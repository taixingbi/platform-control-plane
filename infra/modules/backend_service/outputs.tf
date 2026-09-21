output "alb_listener_arn" {
  description = "HTTP listener ARN -- what platform-edge-gateway's aws_apigatewayv2_integration.integration_uri points at, same convention as gateway-api's own modules/ecs_service.alb_listener_arn."
  value       = aws_lb_listener.http.arn
}

output "alb_dns_name" {
  value = aws_lb.this.dns_name
}

output "cluster_name" {
  value = aws_ecs_cluster.this.name
}

output "service_name" {
  value = aws_ecs_service.this.name
}

output "task_definition_family" {
  value = aws_ecs_task_definition.this.family
}

output "security_group_id" {
  value = aws_security_group.service.id
}
