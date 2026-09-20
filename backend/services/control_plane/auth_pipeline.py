"""Authentication + RBAC/ABAC for the control plane's admin API.

Extracted from bedrock-runtime-gateway's pipeline.py rather than
importing that module whole -- pipeline.py also pulls in guardrails/,
concurrency.py, routing/model_registry.py, and policy/rate_limiter.py,
none of which the control plane needs (it never runs an inference
request itself). Only the Stage 1 (auth) and Stage 1b (RBAC/ABAC)
functions are needed here; everything below is copied verbatim from
that module so behavior (error codes, messages) stays identical for
anything already depending on it (audit logs, tests, the portal's own
error handling).
"""
from __future__ import annotations

from typing import List, Optional

from .auth.aws_iam import IamTenantResolver
from .auth.enterprise_groups import EnterpriseGroupResolver
from .auth.identity import AuthError, Identity, identity_from_claims
from .auth.jwt_verifier import TokenVerifier
from .authz.decision import Decision, decide


class PipelineError(Exception):
    """A pipeline stage rejected the request. Carries enough to render an
    HTTP error response without the route handler knowing which stage
    (auth, RBAC, ...) produced it."""

    def __init__(self, status_code: int, code: str, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.code = code


def authenticate_iam(
    principal_arn: str,
    account_id: Optional[str],
    *,
    iam_tenant_resolver: IamTenantResolver,
    request_id: Optional[str] = None,
    session_id: Optional[str] = None,
) -> Identity:
    """Stage 1 (AWS_IAM path): maps an already SigV4-verified IAM
    principal ARN to an Identity. See auth/aws_iam.py's module
    docstring for why the caller's headers are safe to trust here."""
    try:
        grant = iam_tenant_resolver.resolve(principal_arn, request_id=request_id, session_id=session_id)
    except AuthError as exc:
        raise PipelineError(403, exc.code, str(exc)) from exc

    return Identity(
        sub=principal_arn,
        tenant_id=grant.tenant_id,
        application_id=grant.application_id,
        roles=grant.roles,
        auth_type="aws_iam",
        account_id=account_id,
    )


def authenticate(
    authorization_header: Optional[str],
    *,
    token_verifier: TokenVerifier,
    iam_principal_arn: Optional[str] = None,
    iam_account_id: Optional[str] = None,
    iam_tenant_resolver: Optional[IamTenantResolver] = None,
    request_id: Optional[str] = None,
    session_id: Optional[str] = None,
    enterprise_group_resolver: Optional[EnterpriseGroupResolver] = None,
) -> Identity:
    """Stage 1: Auth. Derives an Identity from whichever verified source
    the request arrived through -- AWS_IAM (iam_principal_arn set) or
    JWT (bearer token, verified claims)."""
    if iam_principal_arn:
        if iam_tenant_resolver is None:
            raise PipelineError(500, "IAM_AUTH_NOT_CONFIGURED", "aws_iam auth is not configured")
        return authenticate_iam(
            iam_principal_arn,
            iam_account_id,
            iam_tenant_resolver=iam_tenant_resolver,
            request_id=request_id,
            session_id=session_id,
        )

    if not authorization_header or not authorization_header.startswith("Bearer "):
        raise PipelineError(401, "UNAUTHENTICATED", "missing bearer token")

    token = authorization_header[len("Bearer "):].strip()
    if not token:
        raise PipelineError(401, "UNAUTHENTICATED", "missing bearer token")

    try:
        claims = token_verifier.verify(token)
        identity = identity_from_claims(claims, enterprise_group_resolver=enterprise_group_resolver)
    except AuthError as exc:
        raise PipelineError(401, exc.code, str(exc)) from exc

    return identity


def authorize(identity: Identity, *, required_role: str, action: str = "unspecified") -> Decision:
    """Stage 1b: RBAC. Raises PipelineError(403, ...) if the identity
    lacks the role required for this operation."""
    decision = decide(identity, action=action, required_role=required_role)
    if not decision.allow:
        raise PipelineError(403, decision.code, decision.reason)
    return decision


def authorize_any(identity: Identity, *, required_roles: List[str], action: str = "unspecified") -> Decision:
    """Stage 1b variant: any one of several roles suffices."""
    decision = decide(identity, action=action, required_roles=required_roles)
    if not decision.allow:
        raise PipelineError(403, decision.code, decision.reason)
    return decision


def authorize_tenant_match(
    identity: Identity, resource_tenant_id: str, *, override_role: str, action: str = "unspecified",
    policy_version: Optional[int] = None,
) -> Decision:
    """Stage 1b ABAC variant: the identity's own tenant must own
    `resource_tenant_id`, unless it holds `override_role`."""
    decision = decide(
        identity, action=action, resource_tenant_id=resource_tenant_id, override_role=override_role,
        policy_version=policy_version,
    )
    if not decision.allow:
        raise PipelineError(403, decision.code, decision.reason)
    return decision
