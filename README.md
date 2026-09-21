# platform-control-plane

Management Plane for the AI Bedrock gateway platform: tenant/application
administration, self-service onboarding, policy propose/approve/reject/
rollback, and usage reporting -- plus the admin portal (Next.js) that
drives it.

Extracted from `bedrock-runtime-gateway-app`'s `admin_routes.py`/
`onboarding_routes.py` and `bedrock-gateway-portal`, which were
independently deployed halves of the same feature with no shared
versioning. This repo is a monorepo with **two separate deployables**
(own ECS service/ALB each, same deployment topology as before), not a
merge into one process -- see the platform root's architecture notes
for why.

```
backend/    FastAPI admin API -- services/control_plane/
portal/     Next.js admin UI
```

## Backend

```bash
cd backend
python3.11 -m venv .venv && source .venv/bin/activate
pip install 'poetry==2.1.4'
poetry install --with dev
poetry run python -m unittest discover -s services/control_plane/tests -t .
```

Local run:

```bash
poetry run python -m services.control_plane.main
# -> listening on http://0.0.0.0:8080
```

Same auth model as `bedrock-runtime-gateway`: JWT (Cognito-issued, or a
local dev keypair when `OIDC_JWKS_URL` is unset) or AWS_IAM/SigV4
(delegates identity resolution to `platform-authz-service` when
`AUTHZ_SERVICE_URL` is set, same as the data plane). `policies/*.yaml`
here are **copies** -- canonical source is `platform-policy-definitions`.

### Why this is a *separate* service from bedrock-runtime-gateway

`platform-authz-service` is a narrow PDP (answers "is this one request
allowed," called on every inference request). This service is the
platform's own **tenant administration** control plane -- policy CRUD,
onboarding provisioning, usage aggregation -- a different job with a
different latency/complexity profile. Both this service and the data
plane read/write the same DynamoDB tables (e.g.
`provisioned-tenant-policies`): the data plane only ever *reads*
`TenantPolicy` (via its own `PolicySnapshotCache`), this service is
where *writes* happen. There's no shared-package tooling across this
platform's repos, so the `TenantPolicy` dataclass and its DynamoDB
(de)serialization are deliberately duplicated here rather than
imported -- same tradeoff already made for `classification_rank`
between `bedrock-runtime-gateway-app` and `platform-authz-service`.

`pipeline.py`'s auth/RBAC functions (`authenticate`, `authorize`,
`authorize_any`, `authorize_tenant_match`, `PipelineError`) are
extracted into this repo's own `auth_pipeline.py` rather than
importing that module whole -- the original also pulls in guardrails/,
concurrency.py, and Bedrock routing, none of which this service needs
since it never runs an inference request itself.

## Portal

Migrated from `bedrock-gateway-portal` (that repo is being retired
once this one's deploy is live and verified -- not deleted yet).

```bash
cd portal
npm install
npm run build   # or `npm run dev` for local development
```

`GATEWAY_API_URL`'s route paths (`/v1/admin/*`) didn't change in this
migration -- only which service answers them did (this repo's own
`backend/`, not `bedrock-runtime-gateway-app` anymore); the portal's own code
needed zero route changes.

Also upgraded Next.js 14.2.35 -> 16.3.5 as part of this migration --
`npm audit` on the original repo showed a critical RCE plus several
other real CVEs, none previously caught (nobody had run `npm audit` on
it before). Along with `postcss` 8.4.39 -> 8.5.28 (a second real high-
severity fix, pulled in by the same audit), this repo now audits
clean at 0 vulnerabilities. The Next.js major bump required migrating
every `cookies()` call site to Next 15+'s async API (`next/headers`'s
`cookies()` returns a `Promise` now) -- `lib/session.ts`,
`app/api/auth/{login,callback}/route.ts`, `app/login/actions.ts`.
Verified with `tsc --noEmit`, a full `next build`, and a live Docker
container smoke test (not just a clean compile) before treating this
as done.

## Infra

Terraform (ECS service, ALB, ECR) for the backend, plus
`portal_service`/`portal_cdn`/`cognito_idp` for the portal, are moving
into this platform's Terraform layer as part of the same
restructuring -- not applied yet. Until then, `deploy-dev` in
`.github/workflows/ci.yml` is wired but will fail (no ECR repo/ECS
service/role exists yet) -- expected, not a bug.
