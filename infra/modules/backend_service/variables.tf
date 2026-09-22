variable "name_prefix" {
  description = "Prefix applied to resource names, e.g. \"gateway-dev-control-plane\"."
  type        = string
}

variable "environment" {
  type = string
}

variable "aws_region" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "private_subnet_ids" {
  type = list(string)
}

variable "vpc_link_security_group_id" {
  description = "Security group of the API Gateway VPC Link that's the ALB's only allowed ingress source (the ALB is private -- reached only through API Gateway, same as gateway-api's own modules/ecs_service, not directly by any other service's task SG the way authz-service is)."
  type        = string
}

variable "image" {
  type = string
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

variable "sns_topic_arn" {
  type    = string
  default = null
}

variable "container_env" {
  type    = map(string)
  default = {}
}

# mTLS cutover (plan section 35): same reasoning as
# bedrock-runtime-gateway's own modules/ecs_service.container_secrets --
# resolved from Secrets Manager at container start, never persisted in
# the task definition or CloudWatch Logs the way a plain container_env
# value would be.
variable "container_secrets" {
  description = "Environment variables resolved from Secrets Manager at container start -- map of env var name to secret ARN."
  type        = map(string)
  default     = {}
}

# --- DynamoDB tables this service reads/writes -- all owned elsewhere
# (bedrock-runtime-gateway), same "this service only reads/writes,
# never owns the table's lifecycle" convention as authz-service's own
# provisioned_principal_mappings_table_arn. -------------------------

variable "usage_table_arn" {
  type = string
}

variable "onboarding_requests_table_arn" {
  type = string
}

variable "onboarding_audit_table_arn" {
  type = string
}

variable "provisioned_tenant_policies_table_arn" {
  type = string
}

variable "provisioned_tenant_policies_history_table_arn" {
  type = string
}

variable "provisioned_principal_mappings_table_arn" {
  description = "Read-only: onboarding/provisioning.py (this repo's own backend/ code, migrated from bedrock-runtime-gateway/app) writes here; this service reads it the same way authz-service's own copy does."
  type        = string
}

variable "policy_change_requests_table_arn" {
  type = string
}
