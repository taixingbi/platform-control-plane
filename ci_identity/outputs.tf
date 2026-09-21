output "role_arns" {
  description = "gha-control-plane-infra-plan/apply-dev, gha-control-plane-portal-deploy-dev. Set as this repo's own GitHub Environment variables -- unchanged from before this migration."
  value       = module.github_oidc_control_plane.role_arns
}

output "backend_role_arns" {
  description = "gha-control-plane-backend-deploy-dev. Set as this repo's own GitHub Environment variables -- unchanged from before this migration."
  value       = module.github_oidc_control_plane_backend.role_arns
}
