"""Environment-driven configuration for the control-plane backend.

Scoped down from bedrock-runtime-gateway's own config.py -- only the
settings admin_routes.py/onboarding_routes.py actually reference (see
routing_types.py/auth_pipeline.py's own docstrings for the same
"extracted, not the whole thing" reasoning). Same "config.py is the
only place that reads os.environ" convention as every other service
in this platform.
"""
from __future__ import annotations

import os
from dataclasses import dataclass


def _env_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    return float(raw)


@dataclass(frozen=True)
class Settings:
    aws_region: str
    host: str
    port: int
    service_name: str
    service: str
    environment: str
    log_level: str

    oidc_issuer: str
    oidc_audience: str
    oidc_jwks_url: str
    oidc_jwks_cache_ttl_s: float
    dev_jwt_keypair_path: str

    # Same three role names bedrock-runtime-gateway's own config.py
    # uses -- kept identical (not renamed for this repo) so a
    # Cognito-issued token's roles claim means the same thing on
    # either side of the data-plane/control-plane split.
    chat_required_role: str
    admin_required_role: str
    manager_required_role: str

    iam_tenants_path: str
    enterprise_groups_path: str
    tenant_policy_path: str
    policy_cache_ttl_s: float
    certified_models_path: str
    route_set_config_path: str

    usage_table_name: str
    onboarding_requests_table_name: str
    onboarding_audit_table_name: str
    provisioned_tenant_policies_table_name: str
    provisioned_tenant_policies_history_table_name: str
    provisioned_principal_mappings_table_name: str
    policy_change_requests_table_name: str

    # M12: when set, principal mapping delegates to platform-authz-service
    # instead of resolving in-process -- same as bedrock-runtime-gateway's
    # own HttpIamTenantResolver wiring.
    authz_service_url: str
    authz_ca_cert_pem: str

    # Plan section 35 (P1 hardening) -- this service's own mTLS client
    # cert/key, presented to authz-service on every call once its ALB
    # listener's mutual_authentication is flipped to "verify" (still
    # "off" as of 2026-09-22, see HttpIamTenantResolver's own comment).
    authz_client_cert_pem: str
    authz_client_key_pem: str


def load_settings() -> Settings:
    return Settings(
        aws_region=os.environ.get("AWS_REGION", "us-east-1"),
        host=os.environ.get("CONTROL_PLANE_HOST", "0.0.0.0"),
        port=int(os.environ.get("CONTROL_PLANE_PORT", "8080")),
        service_name=os.environ.get("SERVICE_NAME", "control-plane"),
        service=os.environ.get("SERVICE", "platform-control-plane"),
        environment=os.environ.get("ENVIRONMENT", "dev"),
        log_level=os.environ.get("LOG_LEVEL", "INFO"),
        oidc_issuer=os.environ.get("OIDC_ISSUER", "https://dev-issuer.local/"),
        oidc_audience=os.environ.get("OIDC_AUDIENCE", "bedrock-gateway"),
        oidc_jwks_url=os.environ.get("OIDC_JWKS_URL", ""),
        oidc_jwks_cache_ttl_s=_env_float("OIDC_JWKS_CACHE_TTL_S", 300.0),
        dev_jwt_keypair_path=os.environ.get("DEV_JWT_KEYPAIR_PATH", ".dev/jwt_keypair.json"),
        chat_required_role=os.environ.get("CHAT_REQUIRED_ROLE", "developer"),
        admin_required_role=os.environ.get("ADMIN_REQUIRED_ROLE", "platform_admin"),
        manager_required_role=os.environ.get("MANAGER_REQUIRED_ROLE", "manager"),
        iam_tenants_path=os.environ.get("IAM_TENANTS_PATH", "policies/iam_tenants.yaml"),
        enterprise_groups_path=os.environ.get("ENTERPRISE_GROUPS_PATH", ""),
        tenant_policy_path=os.environ.get("TENANT_POLICY_PATH", "policies/tenants.yaml"),
        policy_cache_ttl_s=_env_float("POLICY_CACHE_TTL_S", 30.0),
        certified_models_path=os.environ.get("CERTIFIED_MODELS_PATH", "policies/certified_models.yaml"),
        route_set_config_path=os.environ.get("ROUTE_SET_CONFIG_PATH", "policies/route_sets.yaml"),
        usage_table_name=os.environ.get("USAGE_TABLE_NAME", ""),
        onboarding_requests_table_name=os.environ.get("ONBOARDING_REQUESTS_TABLE_NAME", ""),
        onboarding_audit_table_name=os.environ.get("ONBOARDING_AUDIT_TABLE_NAME", ""),
        provisioned_tenant_policies_table_name=os.environ.get("PROVISIONED_TENANT_POLICIES_TABLE_NAME", ""),
        provisioned_tenant_policies_history_table_name=os.environ.get(
            "PROVISIONED_TENANT_POLICIES_HISTORY_TABLE_NAME", ""
        ),
        provisioned_principal_mappings_table_name=os.environ.get(
            "PROVISIONED_PRINCIPAL_MAPPINGS_TABLE_NAME", ""
        ),
        policy_change_requests_table_name=os.environ.get("POLICY_CHANGE_REQUESTS_TABLE_NAME", ""),
        authz_service_url=os.environ.get("AUTHZ_SERVICE_URL", ""),
        authz_ca_cert_pem=os.environ.get("AUTHZ_CA_CERT_PEM", ""),
        authz_client_cert_pem=os.environ.get("AUTHZ_CLIENT_CERT_PEM", ""),
        authz_client_key_pem=os.environ.get("AUTHZ_CLIENT_KEY_PEM", ""),
    )
