# This repo's own CI identity (infra plan/apply-dev, portal deploy-dev,
# backend deploy-dev) -- Terraform-ownership migration from
# platform-foundation (2026-09-21), step 2 of 6. These 4 IAM roles
# already existed, created and managed by
# platform-foundation/environments/global's module
# "github_oidc_control_plane" / "github_oidc_control_plane_backend"
# calls. Moved here via `terraform import` (never delete/recreate) so
# this repo owns its own CI permissions going forward. ARNs are
# unchanged; this repo's GitHub Environment variables do not need to
# change.
#
# A separate Terraform root from infra/environments/dev -- own state
# file, own (infrequent) apply.
#
# Two separate module calls, not two keys in one roles map: ci.yml's
# "Deploy backend to dev" and "Deploy portal to dev" jobs both use
# GitHub Environment "dev" (same repo, same environment name), but each
# needs its own distinct IAM role; one module's roles map can't have
# two entries under the same key.

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

data "aws_caller_identity" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
}

# --- This repo's own Terraform plan/apply-dev roles (infra/environments/dev
# -- see migrate-control-plane-infra-state.sh), plus its OWN portal
# deploy-dev role (push image, update the SAME live gateway-dev-portal*
# ECS service the old bedrock-gateway-portal repo's gha-portal-deploy-dev
# role already deploys to -- identical policy shape, just scoped to
# this repo's OIDC trust instead). -----------------------------------

data "aws_iam_policy_document" "control_plane_infra_plan" {
  statement {
    sid = "ReadOnly"
    actions = [
      "ec2:Describe*",
      # refreshing modules/portal_service's data
      # "aws_ec2_managed_prefix_list" "cloudfront_origin_facing" calls
      # this specific action, a distinct verb Describe* doesn't cover.
      "ec2:GetManagedPrefixListEntries",
      "elasticloadbalancing:Describe*",
      "ecs:Describe*", "ecs:List*",
      "ecr:Describe*", "ecr:List*", "ecr:GetLifecyclePolicy",
      "cloudfront:Get*", "cloudfront:List*",
      "cognito-idp:Describe*", "cognito-idp:Get*", "cognito-idp:List*",
      "cognito-idp:AdminGetUser", "cognito-idp:AdminListGroupsForUser",
      "logs:Describe*", "logs:List*",
      "iam:Get*", "iam:List*",
      "sts:GetCallerIdentity",
      "application-autoscaling:Describe*", "application-autoscaling:ListTagsForResource",
      "cloudwatch:Describe*", "cloudwatch:List*", "cloudwatch:Get*",
      # backend_service's own cross-repo lookups (the ops_alerts SNS
      # topic, the 7 DynamoDB tables it reads/writes) -- DynamoDB's own
      # break from the usual naming convention (ListTagsOfResource, not
      # *ListTagsForResource*).
      "sns:GetTopicAttributes", "sns:ListTopics", "sns:ListTagsForResource",
      "dynamodb:Describe*", "dynamodb:ListTagsOfResource",
    ]
    resources = ["*"]
  }
  statement {
    sid       = "TerraformStateS3"
    actions   = ["s3:GetObject", "s3:ListBucket"]
    resources = ["arn:aws:s3:::*tfstate*", "arn:aws:s3:::*tfstate*/*"]
  }
}

data "aws_iam_policy_document" "control_plane_infra_apply" {
  statement {
    sid       = "Ec2Broad"
    actions   = ["ec2:*"]
    resources = ["*"]
  }
  statement {
    sid       = "ElbBroad"
    actions   = ["elasticloadbalancing:*"]
    resources = ["*"]
  }
  statement {
    sid       = "EcsBroad"
    actions   = ["ecs:*"]
    resources = ["*"]
  }
  statement {
    sid       = "EcrBroad"
    actions   = ["ecr:*"]
    resources = ["*"]
  }
  statement {
    sid       = "CloudFrontBroad"
    actions   = ["cloudfront:*"]
    resources = ["*"]
  }
  statement {
    sid       = "CognitoBroad"
    actions   = ["cognito-idp:*"]
    resources = ["*"]
  }
  statement {
    sid       = "LogsBroad"
    actions   = ["logs:*"]
    resources = ["*"]
  }
  statement {
    sid       = "AppAutoscalingBroad"
    actions   = ["application-autoscaling:*"]
    resources = ["*"]
  }
  statement {
    sid       = "CloudWatchBroad"
    actions   = ["cloudwatch:*"]
    resources = ["*"]
  }
  # Read-only: bedrock-runtime-gateway owns both the ops_alerts SNS
  # topic and the 7 DynamoDB tables backend_service reads/writes --
  # this repo only ever looks them up by name (data source), never
  # manages their lifecycle.
  statement {
    sid       = "SnsReadOnly"
    actions   = ["sns:GetTopicAttributes", "sns:ListTopics", "sns:ListTagsForResource"]
    resources = ["*"]
  }
  statement {
    sid       = "DynamoDbReadOnly"
    actions   = ["dynamodb:Describe*", "dynamodb:ListTagsOfResource"]
    resources = ["*"]
  }
  # IAM role names ARE predictable, scoped by name -- covers the
  # portal's roles (gateway-*-portal-*), the backend's
  # (gateway-*-control-plane-*), and (Terraform-ownership migration
  # follow-up) this repo's OWN CI roles (gha-control-plane-*, managed
  # by this same ci_identity root -- including itself).
  statement {
    sid = "ManagePortalRoles"
    actions = [
      "iam:CreateRole", "iam:DeleteRole", "iam:GetRole", "iam:UpdateRole",
      "iam:PutRolePolicy", "iam:DeleteRolePolicy", "iam:GetRolePolicy",
      "iam:AttachRolePolicy", "iam:DetachRolePolicy", "iam:ListAttachedRolePolicies",
      "iam:ListRolePolicies", "iam:TagRole", "iam:UntagRole", "iam:PassRole",
    ]
    resources = [
      "arn:aws:iam::${local.account_id}:role/gateway-*-portal-*",
      "arn:aws:iam::${local.account_id}:role/gateway-*-control-plane-*",
      "arn:aws:iam::${local.account_id}:role/gha-control-plane-*",
    ]
  }
  statement {
    sid       = "AppAutoscalingServiceLinkedRole"
    actions   = ["iam:CreateServiceLinkedRole"]
    resources = ["arn:aws:iam::${local.account_id}:role/aws-service-role/ecs.application-autoscaling.amazonaws.com/*"]
    condition {
      test     = "StringEquals"
      variable = "iam:AWSServiceName"
      values   = ["ecs.application-autoscaling.amazonaws.com"]
    }
  }
  # Learned live wiring AuthZ's own ci_identity into CI: this role
  # never had a generic iam:Get*/List* grant (only the plan role did),
  # fine while it only ever wrote roles directly, but ci_identity's own
  # module.github_oidc also reads the account-wide OIDC provider via
  # data source during apply now, not just plan.
  statement {
    sid       = "OidcProviderReadOnly"
    actions   = ["iam:ListOpenIDConnectProviders", "iam:GetOpenIDConnectProvider"]
    resources = ["*"]
  }
  statement {
    sid = "TerraformStateS3"
    # S3-native state locking (use_lockfile) -- DeleteObject releases
    # the <key>.tflock object an apply creates to hold the lock. Not
    # needed by the plan role above -- every plan job always runs with
    # -lock=false, so it never touches the lock file at all.
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]
    resources = ["arn:aws:s3:::*tfstate*", "arn:aws:s3:::*tfstate*/*"]
  }
}

# Same shape as bedrock-gateway-portal's own deploy role -- identical
# resource scoping (gateway-dev-portal*, the same live ECS service),
# just under this repo's own OIDC trust so its own CI can deploy the
# image it builds.
data "aws_iam_policy_document" "control_plane_portal_deploy" {
  statement {
    sid = "PushToEcr"
    actions = [
      "ecr:GetDownloadUrlForLayer", "ecr:BatchGetImage", "ecr:BatchCheckLayerAvailability",
      "ecr:PutImage", "ecr:InitiateLayerUpload", "ecr:UploadLayerPart", "ecr:CompleteLayerUpload",
    ]
    resources = ["arn:aws:ecr:${var.aws_region}:${local.account_id}:repository/gateway-dev-portal*"]
  }
  statement {
    sid       = "EcrAuth"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }
  statement {
    sid       = "DeployToEcs"
    actions   = ["ecs:DescribeServices", "ecs:UpdateService"]
    resources = ["*"]
    condition {
      test     = "ArnLike"
      variable = "ecs:cluster"
      values   = ["arn:aws:ecs:${var.aws_region}:${local.account_id}:cluster/gateway-dev-portal*"]
    }
  }
  statement {
    sid       = "RegisterTaskDefinition"
    actions   = ["ecs:RegisterTaskDefinition", "ecs:DescribeTaskDefinition"]
    resources = ["*"]
  }
  statement {
    sid       = "PassExecutionRole"
    actions   = ["iam:PassRole"]
    resources = ["arn:aws:iam::${local.account_id}:role/gateway-dev-portal*-execution"]
  }
}

module "github_oidc_control_plane" {
  source = "git::https://github.com/taixingbi/platform-foundation.git//modules/github_oidc?ref=main"

  # The account-wide OIDC provider is owned by platform-foundation
  # (formally imported into its state) -- every other repo, this one
  # included, only ever references it via data source.
  create_oidc_provider = false
  github_org           = var.github_org
  github_repo          = "platform-control-plane"

  roles = {
    plan = {
      role_name   = "gha-control-plane-infra-plan"
      policy_json = data.aws_iam_policy_document.control_plane_infra_plan.json
    }
    apply-dev = {
      role_name   = "gha-control-plane-infra-apply-dev"
      policy_json = data.aws_iam_policy_document.control_plane_infra_apply.json
    }
    dev = {
      role_name   = "gha-control-plane-portal-deploy-dev"
      policy_json = data.aws_iam_policy_document.control_plane_portal_deploy.json
    }
  }
}

# Same shape as control_plane_portal_deploy above, scoped to the
# backend's own real resource names instead.
data "aws_iam_policy_document" "control_plane_backend_deploy" {
  statement {
    sid = "PushToEcr"
    actions = [
      "ecr:GetDownloadUrlForLayer", "ecr:BatchGetImage", "ecr:BatchCheckLayerAvailability",
      "ecr:PutImage", "ecr:InitiateLayerUpload", "ecr:UploadLayerPart", "ecr:CompleteLayerUpload",
    ]
    resources = ["arn:aws:ecr:${var.aws_region}:${local.account_id}:repository/gateway-dev-control-plane*"]
  }
  statement {
    sid       = "EcrAuth"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }
  statement {
    sid       = "DeployToEcs"
    actions   = ["ecs:DescribeServices", "ecs:UpdateService"]
    resources = ["*"]
    condition {
      test     = "ArnLike"
      variable = "ecs:cluster"
      values   = ["arn:aws:ecs:${var.aws_region}:${local.account_id}:cluster/gateway-dev-control-plane*"]
    }
  }
  statement {
    sid       = "RegisterTaskDefinition"
    actions   = ["ecs:RegisterTaskDefinition", "ecs:DescribeTaskDefinition"]
    resources = ["*"]
  }
  statement {
    # Both the execution role AND the task role -- ECS
    # RegisterTaskDefinition needs to pass both when a task definition
    # specifies task_role_arn too, not just execution_role_arn.
    sid     = "PassBackendRoles"
    actions = ["iam:PassRole"]
    resources = [
      "arn:aws:iam::${local.account_id}:role/gateway-dev-control-plane*-execution",
      "arn:aws:iam::${local.account_id}:role/gateway-dev-control-plane*-task",
    ]
  }
}

module "github_oidc_control_plane_backend" {
  source = "git::https://github.com/taixingbi/platform-foundation.git//modules/github_oidc?ref=main"

  create_oidc_provider = false
  github_org           = var.github_org
  github_repo          = "platform-control-plane"

  roles = {
    dev = {
      role_name   = "gha-control-plane-backend-deploy-dev"
      policy_json = data.aws_iam_policy_document.control_plane_backend_deploy.json
    }
  }
}
