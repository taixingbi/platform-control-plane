terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

locals {
  name_prefix = "gateway-dev"
}

# --- Cross-repo lookups (Phase 1 of the platform restructuring:
# portal/cognito infra ownership moves here from bedrock-runtime-gateway
# (its infra/ half, when this was written, was still its own repo --
# now merged), WITHOUT touching any live resource -- same
# state-mv/push playbook already used for authz-service) --------
#
# Deliberately loose coupling, same convention every other cross-repo
# lookup in this platform already uses: name-based data source
# lookups, not `terraform_remote_state`, not resource duplication.
# platform-foundation now owns the VPC itself (Phase 3, 2026-09-21);
# this repo only ever reads it -- still by ALB name here rather than a
# platform-foundation data source, since that's what's already live
# and correct, not worth churning just to reference the new owner
# directly.

data "aws_lb" "gateway" {
  name = "gateway-dev-alb"
}

data "aws_subnets" "private" {
  filter {
    name   = "vpc-id"
    values = [data.aws_lb.gateway.vpc_id]
  }
  filter {
    name   = "tag:Name"
    values = ["gateway-dev-private-*"]
  }
}

# Live bug found and fixed 2026-09-21: portal_service's ALB was placed
# in the private (NAT-only) subnets above -- fine for gateway-dev-alb
# (reached only via API Gateway's VPC Link, an AWS-internal path), but
# this ALB is internet-facing and CloudFront fetches it directly over
# the real public internet, which needs an actual Internet Gateway
# route. Confirmed live: NewConnectionCount/RequestCount at this ALB
# sat at exactly 0 the whole time it was broken (~36 hours) -- not an
# application bug, the connection never got past routing.
data "aws_subnets" "public" {
  filter {
    name   = "vpc-id"
    values = [data.aws_lb.gateway.vpc_id]
  }
  filter {
    name   = "tag:Name"
    values = ["gateway-dev-public-*"]
  }
}

# --- Cross-repo lookups for the control-plane backend (Phase 4,
# 2026-09-21 -- "direct cutover" of admin/onboarding from
# bedrock-runtime-gateway/app to this repo's own backend/). Same
# loose-coupling convention as everything else in this file. --------

data "aws_security_group" "api_gateway_vpc_link" {
  name = "gateway-dev-api-gw-vpc-link"
}

data "aws_sns_topic" "ops_alerts" {
  name = "gateway-dev-ops-alerts"
}

data "aws_lb" "authz_service" {
  name = "gateway-dev-authz-alb"
}

data "aws_dynamodb_table" "usage" {
  name = "gateway-dev-usage"
}

data "aws_dynamodb_table" "onboarding_requests" {
  name = "gateway-dev-onboarding-requests"
}

data "aws_dynamodb_table" "onboarding_audit" {
  name = "gateway-dev-onboarding-audit"
}

data "aws_dynamodb_table" "provisioned_tenant_policies" {
  name = "gateway-dev-provisioned-tenant-policies"
}

data "aws_dynamodb_table" "provisioned_principal_mappings" {
  name = "gateway-dev-provisioned-principal-mappings"
}

data "aws_dynamodb_table" "policy_change_requests" {
  name = "gateway-dev-policy-change-requests"
}

data "aws_dynamodb_table" "provisioned_tenant_policies_history" {
  name = "gateway-dev-provisioned-tenant-policies-history"
}

module "ecr_control_plane" {
  source = "git::https://github.com/taixingbi/bedrock-runtime-gateway.git//infra/modules/ecr?ref=main"

  repository_name = "${local.name_prefix}-control-plane"
  environment     = "dev"
}

module "backend_service" {
  source = "../../modules/backend_service"

  name_prefix                = "${local.name_prefix}-control-plane"
  environment                = "dev"
  aws_region                 = var.aws_region
  vpc_id                     = data.aws_lb.gateway.vpc_id
  private_subnet_ids         = data.aws_subnets.private.ids
  vpc_link_security_group_id = data.aws_security_group.api_gateway_vpc_link.id
  sns_topic_arn              = data.aws_sns_topic.ops_alerts.arn
  log_group_name             = "/ai-platform/ecs/gateway-dev-control-plane"

  # No image has been pushed on a first apply -- CI registers the real
  # task definition revision on its first deploy, same as gateway-api/
  # authz-service/portal.
  image = "${module.ecr_control_plane.repository_url}:bootstrap"

  usage_table_arn                               = data.aws_dynamodb_table.usage.arn
  onboarding_requests_table_arn                 = data.aws_dynamodb_table.onboarding_requests.arn
  onboarding_audit_table_arn                    = data.aws_dynamodb_table.onboarding_audit.arn
  provisioned_tenant_policies_table_arn         = data.aws_dynamodb_table.provisioned_tenant_policies.arn
  provisioned_principal_mappings_table_arn      = data.aws_dynamodb_table.provisioned_principal_mappings.arn
  policy_change_requests_table_arn              = data.aws_dynamodb_table.policy_change_requests.arn
  provisioned_tenant_policies_history_table_arn = data.aws_dynamodb_table.provisioned_tenant_policies_history.arn

  container_env = {
    AWS_REGION   = var.aws_region
    SERVICE_NAME = "control-plane"
    SERVICE      = "platform-control-plane"
    ENVIRONMENT  = "dev"
    LOG_LEVEL    = "INFO"

    # Human auth (Cognito) -- same real values gateway-api's own
    # container_env hardcodes (see bedrock-runtime-gateway/infra's own
    # comment on why: no clean data-source lookup for a Cognito app
    # client's id by name).
    OIDC_JWKS_URL = "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_HvCI4Nbr6/.well-known/jwks.json"
    OIDC_ISSUER   = "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_HvCI4Nbr6"
    OIDC_AUDIENCE = "3g1ahkm9un6ccfno3e2jtt53j8"

    IAM_TENANTS_PATH      = "policies/iam_tenants.yaml"
    TENANT_POLICY_PATH    = "policies/tenants.yaml"
    CERTIFIED_MODELS_PATH = "policies/certified_models.yaml"
    ROUTE_SET_CONFIG_PATH = "policies/route_sets.yaml"

    USAGE_TABLE_NAME                               = data.aws_dynamodb_table.usage.name
    ONBOARDING_REQUESTS_TABLE_NAME                 = data.aws_dynamodb_table.onboarding_requests.name
    ONBOARDING_AUDIT_TABLE_NAME                    = data.aws_dynamodb_table.onboarding_audit.name
    PROVISIONED_TENANT_POLICIES_TABLE_NAME         = data.aws_dynamodb_table.provisioned_tenant_policies.name
    PROVISIONED_PRINCIPAL_MAPPINGS_TABLE_NAME      = data.aws_dynamodb_table.provisioned_principal_mappings.name
    POLICY_CHANGE_REQUESTS_TABLE_NAME              = data.aws_dynamodb_table.policy_change_requests.name
    PROVISIONED_TENANT_POLICIES_HISTORY_TABLE_NAME = data.aws_dynamodb_table.provisioned_tenant_policies_history.name

    # M12: delegates AWS_IAM principal mapping to platform-authz-service
    # -- same real values bedrock-runtime-gateway's own container_env
    # hardcodes (that repo's own comment explains why: the CA moved to
    # platform-foundation, ACM PCA has no clean "look up by name" data
    # source, and a root CA's self-signed cert doesn't change for its
    # lifetime).
    AUTHZ_SERVICE_URL = "https://${data.aws_lb.authz_service.dns_name}"
    AUTHZ_CA_CERT_PEM = chomp(<<-EOT
      -----BEGIN CERTIFICATE-----
      MIIDKzCCAhOgAwIBAgIRAJI2amN73dXcl32YjkCVK5swDQYJKoZIhvcNAQELBQAw
      LzEtMCsGA1UEAwwkQmVkcm9jayBHYXRld2F5IFBsYXRmb3JtIEludGVybmFsIENB
      MB4XDTI2MDkxNzAxNDMyNVoXDTM2MDkxNzAyNDMyNVowLzEtMCsGA1UEAwwkQmVk
      cm9jayBHYXRld2F5IFBsYXRmb3JtIEludGVybmFsIENBMIIBIjANBgkqhkiG9w0B
      AQEFAAOCAQ8AMIIBCgKCAQEAop+Y1RxTXoOTZVrIgFurEINkEbE/E1/JQjHesTMX
      2zuFmgQAJtmsLRHnEpJDPRSWjcbdZCVbhSsfNGt7gNXIw32pPTbPOx02BoHUVaFS
      MbNaw6t0TRvsuWTCrJCTRIoS595xrUSz1jFuwIMgpzJH7C0u6OoMEI+YrU6WYOhX
      pKsT5AQrVf7e6BaRX4IeyOZRK8A7ACq0NqrgVDv+gmq8ggnAWZyMBsSscozkOfZO
      FK+fnsK2xdSiDvvoBOiN2wC3zx6ZyTqzN0zsAaqq9hQby3y2GD/FDyIq4MIYSsqR
      YlhWJp5HL+BVnJ66sn9MqnKbNUEM3EI71DVX5wzGzvpCUwIDAQABo0IwQDAPBgNV
      HRMBAf8EBTADAQH/MB0GA1UdDgQWBBREKqAldQXFXQVILzNgPFMgmKAHMDAOBgNV
      HQ8BAf8EBAMCAYYwDQYJKoZIhvcNAQELBQADggEBAHnic2MRaOxmzBWU4/A1hYmq
      tdipEjk2BXt3uOUOkbiPn3lYneZCcQIUfSrDP65d+3+5aTPV2oVGU93zc+YrUwjN
      QSQWYP0QrXWBa2ZOAou354Jg5je1ydVRZi2QdnIuIEkHdbkY10zAy8b4ojc75tDE
      vmJoVAJhXQnjiLl0NeR0rPY4cTdPKnZ+Wphb2cl8hEGzYr6s7TMQvbPjzB0HrnFX
      OTDWYTh2wY7wKxcWzp1rlgul/jH1Kek4eBtG3u3F/2R8MBxYfI5XzOyoWayzXVd5
      LrdHmzHQfP2eEv9GqS54Gqu3elV3dOdluK0rbmYfrUcVGOoFI3DFBFLD01agWe0=
      -----END CERTIFICATE-----
    EOT
    )
  }
}

module "ecr_portal" {
  source = "git::https://github.com/taixingbi/bedrock-runtime-gateway.git//infra/modules/ecr?ref=main"

  repository_name = "${local.name_prefix}-portal"
  environment     = "dev"
}

module "portal_service" {
  source = "../../modules/portal_service"

  name_prefix        = "${local.name_prefix}-portal"
  environment        = "dev"
  aws_region         = var.aws_region
  vpc_id             = data.aws_lb.gateway.vpc_id
  private_subnet_ids = data.aws_subnets.private.ids
  public_subnet_ids  = data.aws_subnets.public.ids
  # Real, already-live log group -- kept byte-for-byte identical to
  # what bedrock-runtime-gateway used. aws_cloudwatch_log_group's
  # name forces replacement if changed (loses log history), so this is
  # NOT renamed to match this repo, same reasoning platform-edge-gateway's
  # own log_group_name was deliberately left alone during the repo
  # rename's cosmetic cleanup pass.
  log_group_name = "/ai-platform/ecs/bedrock-gateway-portal-dev"

  # No image has been pushed on a first apply -- CI registers the real
  # task definition revision on its first deploy, same as gateway-api.
  image = "${module.ecr_portal.repository_url}:bootstrap"

  container_env = {
    # The portal's admin bearer-token auth goes over the open JWT
    # route -- not /iam/*, that one's for SigV4-signing machine callers.
    # Hardcoded, not a module reference: api_gateway moved to the
    # platform-edge-gateway repo (plan.md Section 25) -- this is that
    # repo's real, already-applied api_endpoint output. Update this if
    # that API Gateway is ever destroyed and recreated (a new one gets
    # a new endpoint).
    GATEWAY_API_URL = "https://as1n3q8d33.execute-api.us-east-1.amazonaws.com"

    COGNITO_DOMAIN        = module.cognito_idp.hosted_ui_domain
    COGNITO_CLIENT_ID     = module.cognito_idp.client_id
    COGNITO_CLIENT_SECRET = module.cognito_idp.client_secret
    COGNITO_REGION        = var.aws_region
    PORTAL_BASE_URL       = local.portal_base_url
    # Real HTTPS in front of the ALB now (module.portal_cdn) -- the
    # only path a browser can reach this portal through is CloudFront,
    # so the session cookie's Secure flag is safe to turn on.
    PORTAL_HTTPS = "true"
  }
}

# HTTPS front door -- Cognito's Hosted UI requires it (see the
# module's own comment). The ALB itself deliberately stays HTTP-only;
# only CloudFront's edge gets a certificate.
module "portal_cdn" {
  source = "../../modules/portal_cdn"

  name_prefix        = "${local.name_prefix}-portal"
  environment        = "dev"
  origin_domain_name = module.portal_service.alb_dns_name
}

# --- Human identity (Cognito) for the portal ------------------------------
#
# local.portal_base_url is a plain string, not module.portal_cdn's
# domain_name output, deliberately: cognito_idp's callback_url needs
# the portal's URL, and portal_service's container_env (above) needs
# cognito_idp's client_id/secret -- referencing each other's *module*
# outputs both ways is a genuine Terraform cycle. module.portal_cdn's
# domain is now created and stable (CloudFront distribution domains
# are assigned once, at creation, confirmed live as
# d3ofy46m4rhywg.cloudfront.net) -- so this hardcodes today's
# already-real value rather than re-deriving it circularly. Update
# this if the portal's CloudFront distribution is ever destroyed and
# recreated (a new one gets a new domain).
locals {
  portal_base_url = "https://d3ofy46m4rhywg.cloudfront.net"
}

module "cognito_idp" {
  source = "../../modules/cognito_idp"

  name_prefix  = local.name_prefix
  aws_region   = var.aws_region
  callback_url = "${local.portal_base_url}/api/auth/callback"
  logout_url   = "${local.portal_base_url}/login"
}

# The one admin user this session actually needs -- Cognito emails a
# temporary password on creation (its built-in low-volume sender, no
# SES setup required); Hosted UI forces a password change on first
# login. Add more aws_cognito_user blocks (and matching
# aws_cognito_user_in_group ones) for additional admins.
resource "aws_cognito_user" "admin" {
  user_pool_id = module.cognito_idp.user_pool_id
  username     = "bitaihang@gmail.com"

  attributes = {
    email                   = "bitaihang@gmail.com"
    email_verified          = "true"
    "custom:tenant_id"      = "platform"
    "custom:application_id" = "portal"
  }

  desired_delivery_mediums = ["EMAIL"]

  # The AWS provider's refresh for this resource's `attributes` never
  # actually converges with real Cognito state: every single apply
  # this session re-proposed "remove tenant_id/application_id (no
  # such bare attribute has ever existed -- Cognito always stores
  # custom schema attributes as custom:tenant_id/custom:application_id),
  # add custom:tenant_id/custom:application_id" -- a permanent phantom
  # diff. Previously assumed harmless/cosmetic; confirmed live it
  # is NOT -- one such apply actually deleted the real custom:*
  # attributes from the live user entirely (portal login then failed
  # with "token is missing required claim(s)"), rather than the
  # no-op it looked like every prior time. Ignore this attribute
  # going forward -- it's provisioned once above; anyone reprovisioning
  # it should do so by hand (aws cognito-idp admin-update-user-attributes),
  # not via a Terraform apply this provider can't be trusted with.
  lifecycle {
    ignore_changes = [attributes]
  }
}

resource "aws_cognito_user_in_group" "admin_is_platform_admin" {
  user_pool_id = module.cognito_idp.user_pool_id
  username     = aws_cognito_user.admin.username
  group_name   = module.cognito_idp.platform_admin_group_name
}
