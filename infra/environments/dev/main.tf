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
# portal/cognito infra ownership moves here from
# bedrock-runtime-gateway-infra, WITHOUT touching any live resource --
# same state-mv/push playbook already used for authz-service) --------
#
# Deliberately loose coupling, same convention every other cross-repo
# lookup in this platform already uses: name-based data source
# lookups, not `terraform_remote_state`, not resource duplication.
# bedrock-runtime-gateway-infra keeps owning the VPC itself (until
# platform-foundation exists); this repo only ever reads it.

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

module "ecr_portal" {
  source = "git::https://github.com/taixingbi/bedrock-runtime-gateway-infra.git//modules/ecr?ref=main"

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
  # Real, already-live log group -- kept byte-for-byte identical to
  # what bedrock-runtime-gateway-infra used. aws_cloudwatch_log_group's
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
