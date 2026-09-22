"""App factory + entrypoint for the control-plane backend.

Run locally:
    python -m services.control_plane.main

Run under uvicorn directly (what the Dockerfile does):
    uvicorn services.control_plane.main:app --host 0.0.0.0 --port 8080
"""
from __future__ import annotations

import uuid
from typing import Dict, Optional, Set

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.middleware import Middleware

from .api.admin_routes import build_admin_router
from .api.onboarding_routes import build_onboarding_router
from .auth.aws_iam import (
    DynamoDbIamTenantResolver,
    FileIamTenantResolver,
    HttpIamTenantResolver,
    IamTenantResolver,
    InMemoryIamTenantResolver,
    LayeredIamTenantResolver,
    ProvisionedIamTenantResolver,
)
from .auth.devkeys import load_or_create_dev_keypair
from .auth.enterprise_groups import EnterpriseGroupResolver, FileEnterpriseGroupResolver
from .auth.jwt_verifier import JwksVerifier, StaticKeyVerifier, TokenVerifier
from .config import Settings, load_settings
from .onboarding.audit import AuditStore, DynamoDbAuditStore, InMemoryAuditStore
from .onboarding.store import DynamoDbOnboardingStore, InMemoryOnboardingStore, OnboardingStore
from .policy.cache import PolicySnapshotCache
from .policy.change_requests import DynamoDbPolicyChangeStore, InMemoryPolicyChangeStore, PolicyChangeStore
from .policy.store import (
    DynamoDbPolicyStore,
    FilePolicyStore,
    InMemoryPolicyStore,
    LayeredPolicyStore,
    MutablePolicyStore,
    ProvisionedPolicyStore,
)
from .routing_types import RouteSet
from .routing_types import certified_model_ids as _certified_model_ids_from
from .routing_types import load_certified_models_from_yaml, load_route_sets_from_yaml
from .telemetry.logging import configure_logging, get_logger, log_event
from .usage.store import UsageStore
from .telemetry.middleware import RequestContextMiddleware
from .telemetry.otel import configure_tracing

_logger = get_logger("control-plane")


def _build_default_token_verifier(settings: Settings) -> TokenVerifier:
    if settings.oidc_jwks_url:
        return JwksVerifier(
            jwks_url=settings.oidc_jwks_url,
            issuer=settings.oidc_issuer,
            audience=settings.oidc_audience,
            cache_ttl_s=settings.oidc_jwks_cache_ttl_s,
        )
    _private_pem, public_pem = load_or_create_dev_keypair(settings.dev_jwt_keypair_path)
    return StaticKeyVerifier(
        public_key_pem=public_pem, issuer=settings.oidc_issuer, audience=settings.oidc_audience
    )


def create_app(
    settings: Optional[Settings] = None,
    *,
    token_verifier: Optional[TokenVerifier] = None,
    iam_tenant_resolver: Optional[IamTenantResolver] = None,
    iam_tenant_resolver_primary: Optional[ProvisionedIamTenantResolver] = None,
    policy_store: Optional[MutablePolicyStore] = None,
    policy_store_primary: Optional[ProvisionedPolicyStore] = None,
    policy_change_store: Optional[PolicyChangeStore] = None,
    onboarding_store: Optional[OnboardingStore] = None,
    onboarding_audit_store: Optional[AuditStore] = None,
    enterprise_group_resolver: Optional[EnterpriseGroupResolver] = None,
    usage_store: Optional[UsageStore] = None,
    route_sets: Optional[Dict[str, RouteSet]] = None,
    certified_model_ids: Optional[Set[str]] = None,
) -> FastAPI:
    settings = settings or load_settings()
    configure_logging(
        settings.service_name, settings.log_level, service=settings.service, environment=settings.environment
    )

    if token_verifier is None:
        token_verifier = _build_default_token_verifier(settings)

    # Same "primary (provisioned) stores exist independently of
    # whether iam_tenant_resolver/policy_store were overridden below"
    # reasoning bedrock-runtime-gateway's own main.py uses --
    # onboarding_routes.py always needs something to write to.
    if iam_tenant_resolver_primary is None:
        iam_tenant_resolver_primary = (
            DynamoDbIamTenantResolver(
                table_name=settings.provisioned_principal_mappings_table_name, region=settings.aws_region
            )
            if settings.provisioned_principal_mappings_table_name
            else InMemoryIamTenantResolver()
        )
    if policy_store_primary is None:
        policy_store_primary = (
            DynamoDbPolicyStore(
                table_name=settings.provisioned_tenant_policies_table_name,
                region=settings.aws_region,
                history_table_name=settings.provisioned_tenant_policies_history_table_name or None,
            )
            if settings.provisioned_tenant_policies_table_name
            else InMemoryPolicyStore({})
        )
    if iam_tenant_resolver is None:
        # M12: platform-authz-service does its own file+Dynamo layering
        # internally -- when configured, this service defers
        # principal-mapping entirely rather than doing it twice.
        iam_tenant_resolver = (
            HttpIamTenantResolver(
                base_url=settings.authz_service_url,
                ca_cert_pem=settings.authz_ca_cert_pem,
                client_cert_pem=settings.authz_client_cert_pem,
                client_key_pem=settings.authz_client_key_pem,
            )
            if settings.authz_service_url
            else LayeredIamTenantResolver(
                primary=iam_tenant_resolver_primary,
                fallback=FileIamTenantResolver(settings.iam_tenants_path),
            )
        )
    if policy_store is None:
        policy_store = LayeredPolicyStore(
            primary=policy_store_primary,
            fallback=FilePolicyStore(settings.tenant_policy_path),
        )
    if onboarding_store is None:
        onboarding_store = (
            DynamoDbOnboardingStore(table_name=settings.onboarding_requests_table_name, region=settings.aws_region)
            if settings.onboarding_requests_table_name
            else InMemoryOnboardingStore()
        )
    if onboarding_audit_store is None:
        onboarding_audit_store = (
            DynamoDbAuditStore(table_name=settings.onboarding_audit_table_name, region=settings.aws_region)
            if settings.onboarding_audit_table_name
            else InMemoryAuditStore()
        )
    if policy_change_store is None:
        # Reuses the onboarding audit table's DynamoDbAuditStore shape
        # for its own event trail -- see admin_routes.py's AuditEvent
        # calls keyed by change_id. A separate table, just the same
        # generic "who/what/when" store, not shared state.
        policy_change_store = (
            DynamoDbPolicyChangeStore(
                table_name=settings.policy_change_requests_table_name, region=settings.aws_region
            )
            if settings.policy_change_requests_table_name
            else InMemoryPolicyChangeStore()
        )
    if enterprise_group_resolver is None:
        enterprise_group_resolver = FileEnterpriseGroupResolver(settings.enterprise_groups_path)

    policy_cache = PolicySnapshotCache(store=policy_store, ttl_s=settings.policy_cache_ttl_s)
    if route_sets is None:
        route_sets = load_route_sets_from_yaml(settings.route_set_config_path)
    if certified_model_ids is None:
        certified_model_ids = _certified_model_ids_from(
            load_certified_models_from_yaml(settings.certified_models_path)
        )

    if usage_store is None:
        from .usage.store import DynamoDbUsageStore, InMemoryUsageStore

        # The control plane never writes usage itself (the data plane
        # does, on every billed request) -- GET /v1/admin/usage only
        # ever reads it. Same table, shared with bedrock-runtime-gateway.
        usage_store = (
            DynamoDbUsageStore(table_name=settings.usage_table_name, region=settings.aws_region)
            if settings.usage_table_name
            else InMemoryUsageStore()
        )

    admin_router = build_admin_router(
        policy_store=policy_store,
        policy_cache=policy_cache,
        settings=settings,
        token_verifier=token_verifier,
        iam_tenant_resolver=iam_tenant_resolver,
        usage_store=usage_store,
        route_sets=route_sets,
        certified_model_ids=certified_model_ids,
        policy_store_primary=policy_store_primary,
        policy_change_store=policy_change_store,
        audit_store=onboarding_audit_store,
        enterprise_group_resolver=enterprise_group_resolver,
    )
    onboarding_router = build_onboarding_router(
        onboarding_store=onboarding_store,
        audit_store=onboarding_audit_store,
        policy_store=policy_store,
        policy_store_primary=policy_store_primary,
        iam_tenant_resolver=iam_tenant_resolver,
        iam_tenant_resolver_primary=iam_tenant_resolver_primary,
        settings=settings,
        token_verifier=token_verifier,
        enterprise_group_resolver=enterprise_group_resolver,
    )

    async def unhandled_error(request: Request, exc: Exception) -> JSONResponse:
        request_id = getattr(request.state, "request_id", str(uuid.uuid4()))
        log_event(
            _logger, "ERROR", "unhandled exception",
            request_id=request_id, path=request.url.path, error=str(exc),
        )
        return JSONResponse(
            {"error": {"code": "INTERNAL_ERROR", "message": "internal error", "request_id": request_id}},
            status_code=500,
        )

    async def invalid_request_body(request: Request, exc: RequestValidationError) -> JSONResponse:
        request_id = getattr(request.state, "request_id", str(uuid.uuid4()))
        first_error = exc.errors()[0]
        code = "INVALID_JSON" if first_error.get("type") == "json_invalid" else "INVALID_REQUEST"
        return JSONResponse(
            {"error": {"code": code, "message": first_error.get("msg", "invalid request"), "request_id": request_id}},
            status_code=400,
        )

    app = FastAPI(
        title="Platform Control Plane",
        middleware=[Middleware(RequestContextMiddleware)],
        exception_handlers={
            Exception: unhandled_error,
            RequestValidationError: invalid_request_body,
        },
    )

    @app.get("/healthz")
    async def healthz() -> dict:
        return {"status": "ok"}

    app.include_router(admin_router)
    app.include_router(onboarding_router)
    app.state.settings = settings

    if settings.environment != "prod":
        configure_tracing(settings.service_name, otlp_endpoint=None)

    return app


try:
    app = create_app()
except Exception:  # pragma: no cover - config-only failures at import time
    import traceback

    traceback.print_exc()
    app = None


if __name__ == "__main__":
    import uvicorn

    settings = load_settings()
    uvicorn.run(create_app(settings), host=settings.host, port=settings.port)
