# bedrock-gateway-portal

M10 self-service portal MVP for the [bedrock-gateway](../bedrock-gateway-app)
platform. Next.js (App Router) + TypeScript + Tailwind, calling the
gateway's `/v1/admin/*` API server-side. No backend logic lives here --
every page just renders what the gateway already computes.

## Pages

- **Tenants** -- state (with the kill switch), quota, budget, guardrail
  policy, route set. `GET /v1/admin/tenants`, state changes via
  `PUT /v1/admin/tenants/{id}/state`.
- **Applications** -- AWS_IAM/SigV4 application grants
  (`GET /v1/admin/applications`). Necessarily partial: the JWT auth
  path has no equivalent registry to list.
- **Models / Route Sets** -- `GET /v1/admin/route-sets`, cross-referenced
  against M9's certification registry so an uncertified fallback is
  visibly flagged, not silently dropped.
- **Guardrails** -- which `guardrail_policy` each tenant is assigned,
  and what `BasicGuardrailClient` actually checks today (there's no
  per-policy rule config in the backend yet, so this doesn't pretend
  there is).
- **Usage / Cost** -- `GET /v1/admin/usage`, M8's showback/chargeback
  report with per-tenant budget utilization.
- **Onboarding** -- self-service application onboarding request queue
  with approve/reject actions (M11); approving provisions a real
  principal mapping and, if needed, a real tenant policy -- no manual
  DynamoDB edits.
- **Tenant Policy** (`/tenants/{tenantId}/policy`) -- propose a change
  to a provisioned tenant's policy (raw JSON diff against its current
  epoch), a pending-approval queue with approve/reject actions, change
  history, and a version-history table with a per-epoch rollback
  button (plan section 33). Approve/reject/rollback are admin-only,
  enforced server-side, not gated in this UI.

## Auth

Human sign-in goes through Amazon Cognito's Hosted UI (Authorization
Code flow), separate from the AWS_IAM/SigV4 path service/application
callers use directly against the gateway. Human user -> Cognito ->
OIDC JWT -> portal; service/application -> IAM role/STS/SigV4 ->
gateway -- two trust mechanisms for two different kinds of caller,
not one flow doing both.

- `GET /login` links to `GET /api/auth/login`, which sets a CSRF
  `state` cookie and redirects to Cognito's Hosted UI.
- `GET /api/auth/callback` validates `state`, exchanges the
  authorization code for tokens (`lib/cognito.ts`), and holds the
  resulting **ID token** (not the access token -- only the ID token
  carries `custom:tenant_id`/`custom:application_id`) in the same
  HttpOnly `gw_admin_token` cookie the gateway calls already used,
  never sent to the browser.
- Before trusting the new session, the callback makes one real admin
  call (`listTenants()`); if the gateway rejects the token (e.g. an
  admin not yet in the `platform_admin` Cognito group), the cookie is
  unwound rather than leaving the operator silently "logged in".
- `logout()` clears the cookie and also redirects through Cognito's
  `/logout` endpoint, so the Hosted UI's own browser session doesn't
  silently re-authenticate the same user on the next sign-in.
- Admins are provisioned via Terraform (`aws_cognito_user` +
  `aws_cognito_user_in_group` in `bedrock-gateway-infra`), not
  self-service signup -- Cognito emails a temporary password, and the
  Hosted UI forces a change on first login.

## Local development

```bash
cp .env.example .env.local   # point GATEWAY_API_URL at a running gateway, plus COGNITO_*/PORTAL_BASE_URL
npm install
npm run dev
```

`GATEWAY_API_URL` must be the gateway's open JWT route (bedrock-gateway-infra's
`api_gateway_url` output), not the `/iam/*` SigV4 route. `COGNITO_DOMAIN`,
`COGNITO_CLIENT_ID`, `COGNITO_CLIENT_SECRET`, `COGNITO_REGION`, and
`PORTAL_BASE_URL` come from `bedrock-gateway-infra`'s `cognito_idp`
module outputs -- already wired as container env vars in
`environments/dev/main.tf`.

## Known limitations (MVP, not a production frontend)

- **HTTP-only ALB**: no TLS/ACM cert yet, so session cookies aren't
  marked `Secure` (`PORTAL_HTTPS` env var controls this). Flip once a
  domain + cert exist.
- **Real mutations, but a second source of truth**: the tenant kill
  switch, application onboarding approve/reject, and tenant policy
  propose/approve/reject/rollback (quota/budget/models/guardrail
  policy) are all real, wired, working write paths, not policy-file +
  PR-review + redeploy. That's also the gap: this portal writes
  straight to DynamoDB, entirely bypassing bedrock-gateway-policies'
  Git-reviewed files -- there are now two independent ways to change a
  tenant's live policy with no reconciliation between them. See
  `plan.md` section 35 in the platform root; the proposed direction is
  Git as the single source of truth (this portal's "propose" would
  generate a PR/change request against Git instead of writing
  DynamoDB directly), not yet built.
- **Propose is raw JSON**: the tenant-policy change form takes a raw
  JSON object of changed fields, not a real form with per-field inputs
  and a readable diff in the approval view. Functional, not yet
  enterprise-shaped.
- **No capability-aware rendering**: this portal does no role gating
  client-side (correctly -- the backend is the only real enforcement),
  but it also doesn't hide an action a viewer's role will always get a
  403 on (e.g. a manager seeing an "Approve" button on their own
  proposed change). A `GET /me/capabilities`-style endpoint to drive
  what's *rendered* (never what's *enforced*) is a real UX gap, not
  built.
- **npm audit** flags Next.js 14.2.35 (the latest 14.x patch release)
  against a broad upstream advisory range; the specific reachable
  issue is a build-time-only `postcss` dependency bundled inside
  `next` itself, not something in the deployed request-handling path.
  Clearing it fully means moving to Next 15 (async `cookies()`/
  `headers()`, `useActionState` instead of `useFormState`) -- a real
  but deliberately deferred follow-up, not done here to keep this an
  MVP-sized change.
