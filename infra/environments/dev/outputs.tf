output "cognito_user_pool_endpoint" {
  description = "Issuer for gateway-api's OIDC_ISSUER / JWKS base -- gateway-api (bedrock-runtime-gateway-infra) can't reach this via a Terraform data source (no lookup-by-name for a user pool's client-id list is clean enough to avoid an index()/element() lookup for the one real client), so it's hardcoded there instead, same convention as this file's own portal_base_url. Exposed here for visibility and to make updating that hardcoded copy easy if this user pool is ever destroyed and recreated."
  value       = module.cognito_idp.user_pool_endpoint
}

output "cognito_client_id" {
  description = "See cognito_user_pool_endpoint's comment -- gateway-api's OIDC_AUDIENCE, hardcoded there."
  value       = module.cognito_idp.client_id
}

output "portal_alb_dns_name" {
  description = "Internal ALB DNS name, in case anything else ever needs to reach the portal service directly (CloudFront is the only real path today)."
  value       = module.portal_service.alb_dns_name
}

output "portal_cdn_domain_name" {
  description = "CloudFront distribution domain -- should match local.portal_base_url exactly; if it doesn't, the distribution was recreated and portal_base_url needs updating."
  value       = module.portal_cdn.domain_name
}

output "backend_alb_listener_arn" {
  description = "What platform-edge-gateway's new /v1/admin/{proxy+} route's integration_uri points at (Phase 4 cutover)."
  value       = module.backend_service.alb_listener_arn
}

output "backend_alb_dns_name" {
  value = module.backend_service.alb_dns_name
}
