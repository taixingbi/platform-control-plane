# ECS Fargate control-plane backend (admin + onboarding, migrated from
# bedrock-runtime-gateway's own app/ -- plan.md Section 25's control-
# plane split, Phase 4/"direct cutover") fronted by a private ALB
# reachable only through API Gateway's VPC Link -- same shape as
# gateway-api's own modules/ecs_service, not authz-service's
# caller-SG-only/HTTPS pattern (this service is a REST API front
# door for the portal and onboarding callers, not a single internal
# caller).

resource "aws_ecs_cluster" "this" {
  name = "${var.name_prefix}-cluster"

  setting {
    name  = "containerInsights"
    value = "disabled"
  }

  tags = {
    Environment = var.environment
  }
}

resource "aws_cloudwatch_log_group" "this" {
  name              = var.log_group_name != "" ? var.log_group_name : "/ecs/${var.name_prefix}"
  retention_in_days = var.log_retention_days
}

resource "aws_security_group" "alb" {
  name        = "${var.name_prefix}-alb"
  description = "control-plane backend ALB -- ingress from the API Gateway VPC Link only"
  vpc_id      = var.vpc_id

  ingress {
    description     = "From the API Gateway VPC Link"
    from_port       = 80
    to_port         = 80
    protocol        = "tcp"
    security_groups = [var.vpc_link_security_group_id]
  }

  # Added by hand 2026-09-22 for the gateway-principal-grants-dev
  # DynamoDB rename's manual verification -- lets a console-launched
  # AWS CloudShell VPC environment (attached to gateway-dev-vpc,
  # security group sg-0c25b89ac47694f02) reach this ALB for ad hoc
  # curl/debugging. Declared here (not just created via the CLI) so a
  # routine dev auto-apply doesn't revert it as drift.
  ingress {
    description     = "CloudShell VPC environment - manual curl/debugging"
    from_port       = 80
    to_port         = 80
    protocol        = "tcp"
    security_groups = ["sg-0c25b89ac47694f02"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Environment = var.environment
  }
}

resource "aws_security_group" "service" {
  name        = "${var.name_prefix}-service"
  description = "control-plane backend task ingress from its own ALB only"
  vpc_id      = var.vpc_id

  ingress {
    description     = "From ALB"
    from_port       = var.container_port
    to_port         = var.container_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Environment = var.environment
  }
}

resource "aws_lb" "this" {
  name               = "${var.name_prefix}-alb"
  internal           = true
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.private_subnet_ids

  tags = {
    Environment = var.environment
  }
}

resource "aws_lb_target_group" "this" {
  name        = "${var.name_prefix}-tg"
  port        = var.container_port
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    path                = "/healthz"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 15
    timeout             = 5
    matcher             = "200"
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.this.arn
  }
}

data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "execution" {
  name               = "${var.name_prefix}-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role" "task" {
  name               = "${var.name_prefix}-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

# Same per-table action sets bedrock-runtime-gateway's own
# modules/ecs_service grants gateway-api's task role for these exact
# tables (onboarding provisioning runs inline on the admin approve
# call, same as there -- Scan is genuinely needed for
# list_all()/list_tenant_ids()/list_grants(), not a broad-grant
# shortcut, same tradeoff jobs/store.py's DynamoDbJobStore already
# accepts).
data "aws_iam_policy_document" "table_access" {
  statement {
    sid       = "UsageRecords"
    actions   = ["dynamodb:GetItem", "dynamodb:UpdateItem"]
    resources = [var.usage_table_arn]
  }
  statement {
    sid       = "OnboardingRequests"
    actions   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:Scan"]
    resources = [var.onboarding_requests_table_arn]
  }
  statement {
    sid       = "OnboardingAudit"
    actions   = ["dynamodb:PutItem", "dynamodb:Query"]
    resources = [var.onboarding_audit_table_arn]
  }
  statement {
    sid       = "ProvisionedTenantPolicies"
    actions   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:Scan"]
    resources = [var.provisioned_tenant_policies_table_arn]
  }
  statement {
    sid       = "ProvisionedPrincipalMappings"
    actions   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:Scan"]
    resources = [var.provisioned_principal_mappings_table_arn]
  }
  statement {
    sid       = "PolicyChangeRequests"
    actions   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:Scan"]
    resources = [var.policy_change_requests_table_arn]
  }
  statement {
    sid       = "ProvisionedTenantPoliciesHistory"
    actions   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:Query"]
    resources = [var.provisioned_tenant_policies_history_table_arn]
  }
}

resource "aws_iam_role_policy" "task_tables" {
  name   = "${var.name_prefix}-table-access"
  role   = aws_iam_role.task.id
  policy = data.aws_iam_policy_document.table_access.json
}

# --- Tracing: ADOT sidecar -> X-Ray (same shape as modules/ecs_service
# and modules/authz_service's identical copy of this). ----------------
locals {
  adot_collector_config = <<-EOT
    receivers:
      otlp:
        protocols:
          http:
            endpoint: 0.0.0.0:4318
    exporters:
      awsxray:
        region: ${var.aws_region}
    service:
      pipelines:
        traces:
          receivers: [otlp]
          exporters: [awsxray]
  EOT
}

data "aws_iam_policy_document" "xray_write" {
  statement {
    sid       = "XRayWrite"
    actions   = ["xray:PutTraceSegments", "xray:PutTelemetryRecords", "xray:GetSamplingRules", "xray:GetSamplingTargets"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "task_xray" {
  name   = "${var.name_prefix}-xray-write"
  role   = aws_iam_role.task.id
  policy = data.aws_iam_policy_document.xray_write.json
}

resource "aws_ecs_task_definition" "this" {
  family                   = var.name_prefix
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([
    {
      name      = "control-plane"
      image     = var.image
      essential = true
      portMappings = [
        {
          containerPort = var.container_port
          protocol      = "tcp"
        }
      ]
      environment = [
        for k, v in var.container_env : { name = k, value = v }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.this.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "control-plane"
        }
      }
    },
    {
      name      = "aws-otel-collector"
      image     = "public.ecr.aws/aws-observability/aws-otel-collector:latest"
      essential = false
      environment = [
        { name = "AOT_CONFIG_CONTENT", value = local.adot_collector_config }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.this.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "adot"
        }
      }
    }
  ])

  tags = {
    Environment = var.environment
  }
}

resource "aws_ecs_service" "this" {
  name            = "${var.name_prefix}-service"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.this.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.service.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.this.arn
    container_name   = "control-plane"
    container_port   = var.container_port
  }

  # Same reasoning as modules/ecs_service/modules/authz_service: CI
  # deploys by registering a new task definition revision directly,
  # outside Terraform.
  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }

  depends_on = [aws_lb_listener.http]

  tags = {
    Environment = var.environment
  }
}

resource "aws_appautoscaling_target" "this" {
  max_capacity       = var.autoscaling_max_capacity
  min_capacity       = var.autoscaling_min_capacity
  resource_id        = "service/${aws_ecs_cluster.this.name}/${aws_ecs_service.this.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "cpu" {
  name               = "${var.name_prefix}-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.this.resource_id
  scalable_dimension = aws_appautoscaling_target.this.scalable_dimension
  service_namespace  = aws_appautoscaling_target.this.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 60
    scale_in_cooldown  = 120
    scale_out_cooldown = 60
  }
}

# --- Operational alarms -- same reasoning as modules/ecs_service and
# modules/authz_service's identical copies: this is now on the
# portal's/onboarding's synchronous request path.
resource "aws_cloudwatch_metric_alarm" "target_5xx" {
  alarm_name          = "${var.name_prefix}-target-5xx"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Sum"
  threshold           = 5
  alarm_description   = "control-plane backend is returning 5xx -- admin/onboarding degrades for every caller while this fires."
  treat_missing_data  = "notBreaching"
  dimensions = {
    LoadBalancer = aws_lb.this.arn_suffix
  }
  alarm_actions = var.sns_topic_arn != null ? [var.sns_topic_arn] : []
  ok_actions    = var.sns_topic_arn != null ? [var.sns_topic_arn] : []
}

resource "aws_cloudwatch_metric_alarm" "unhealthy_hosts" {
  alarm_name          = "${var.name_prefix}-unhealthy-hosts"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 2
  metric_name         = "UnHealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Maximum"
  threshold           = 1
  alarm_description   = "At least one control-plane backend task is failing its ALB health check."
  treat_missing_data  = "notBreaching"
  dimensions = {
    LoadBalancer = aws_lb.this.arn_suffix
    TargetGroup  = aws_lb_target_group.this.arn_suffix
  }
  alarm_actions = var.sns_topic_arn != null ? [var.sns_topic_arn] : []
  ok_actions    = var.sns_topic_arn != null ? [var.sns_topic_arn] : []
}
