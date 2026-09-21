variable "name_prefix" {
  description = "Prefix applied to resource names, e.g. \"gateway-dev-portal\"."
  type        = string
}

variable "environment" {
  description = "Environment tag, e.g. \"dev\" or \"prod\"."
  type        = string
}

variable "aws_region" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "private_subnet_ids" {
  description = "Where the ECS task itself runs -- no direct internet route, reachable only through the ALB."
  type        = list(string)
}

variable "public_subnet_ids" {
  description = "Where the ALB lives. This ALB is internet-facing (CloudFront fetches it directly over the real public internet, not through any AWS-internal path) -- it must sit in a subnet with a real Internet Gateway route, not a NAT-only private one. Live-verified 2026-09-21: the P0 hardening that moved every ALB in this platform to private subnets broke this one specifically (gateway-dev-alb's own ALB stayed reachable since API Gateway's VPC Link reaches it over an AWS-internal path that doesn't need a public route at all) -- CloudFront's NewConnectionCount/RequestCount at the ALB sat at exactly 0 for the ~36 hours this was broken, confirming connections never got past the missing route, not an application bug."
  type        = list(string)
}

variable "image" {
  description = "Full image URI (ECR repo URL + tag)."
  type        = string
}

variable "container_port" {
  type    = number
  default = 8080
}

variable "task_cpu" {
  type    = number
  default = 256
}

variable "task_memory" {
  type    = number
  default = 512
}

variable "desired_count" {
  type    = number
  default = 1
}

variable "autoscaling_min_capacity" {
  type    = number
  default = 1
}

variable "autoscaling_max_capacity" {
  type    = number
  default = 3
}

variable "log_retention_days" {
  type    = number
  default = 30
}

variable "log_group_name" {
  description = "Override for the CloudWatch log group name; defaults to \"/ecs/<name_prefix>\" when empty."
  type        = string
  default     = ""
}

variable "container_env" {
  description = "Environment variables passed to the portal container (e.g. GATEWAY_API_URL)."
  type        = map(string)
  default     = {}
}
