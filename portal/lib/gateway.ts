import { getAdminToken } from "./session";

// GATEWAY_API_URL points at platform-control-plane's own backend (a
// separate ECS service/ALB from bedrock-runtime-gateway's data plane,
// reached through platform-edge-gateway's open JWT route -- admin
// endpoints live under /v1/admin/*, verified via
// Authorization: Bearer <token>, the same JWT-path auth every other
// caller uses (see backend/services/control_plane/auth_pipeline.py).
// Not the /iam/* SigV4 route -- that one is for machine callers
// signing with AWS credentials, not a browser session. The route
// paths themselves didn't change in this repo's split from
// bedrock-gateway-app -- only which service answers them did.
const GATEWAY_API_URL = process.env.GATEWAY_API_URL ?? "";

export class GatewayError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function gatewayFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!GATEWAY_API_URL) {
    throw new GatewayError(500, "GATEWAY_API_URL is not configured");
  }
  const token = await getAdminToken();
  if (!token) {
    throw new GatewayError(401, "no admin session");
  }

  const res = await fetch(`${GATEWAY_API_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    let message = `gateway returned ${res.status}`;
    let code: string | undefined;
    try {
      const body = await res.json();
      message = body?.error?.message ?? message;
      code = body?.error?.code;
    } catch {
      // non-JSON error body -- keep the generic message
    }
    throw new GatewayError(res.status, message, code);
  }

  return res.json() as Promise<T>;
}

export type TenantSummary = {
  tenant_id: string;
  state: "ACTIVE" | "THROTTLED" | "READ_ONLY" | "SUSPENDED" | "EMERGENCY_BLOCK";
  models: string[];
  rpm_limit: number;
  guardrail_policy: string;
  route_set: string | null;
  monthly_budget: number | null;
  policy_epoch: number;
};

export type UsageEntry = {
  tenant_id: string;
  month: string;
  spend: number;
  monthly_budget: number | null;
  utilization: number | null;
};

export type RouteSetEntry = {
  name: string;
  primary: string;
  primary_certified: boolean;
  fallbacks: { model: string; certified: boolean }[];
};

export type ApplicationEntry = {
  principal_arn: string;
  tenant_id: string;
  application_id: string;
  roles: string[];
};

export function listTenants() {
  return gatewayFetch<{ tenants: TenantSummary[] }>("/v1/admin/tenants");
}

export function getUsage() {
  return gatewayFetch<{ tenants: UsageEntry[] }>("/v1/admin/usage");
}

export function listRouteSets() {
  return gatewayFetch<{ route_sets: RouteSetEntry[]; certified_models: string[] }>(
    "/v1/admin/route-sets"
  );
}

export function listApplications() {
  return gatewayFetch<{ applications: ApplicationEntry[]; note: string }>(
    "/v1/admin/applications"
  );
}

export function setTenantState(tenantId: string, state: string) {
  return gatewayFetch<{ tenant_id: string; state: string; policy_epoch: number }>(
    `/v1/admin/tenants/${encodeURIComponent(tenantId)}/state`,
    { method: "PUT", body: JSON.stringify({ state }) }
  );
}

// M11: Application Onboarding (plan section 22).
export type OnboardingStatus =
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "PROVISIONING"
  | "ACTIVE"
  | "REJECTED"
  | "FAILED";

export type OnboardingRequestSummary = {
  request_id: string;
  tenant_id: string;
  application_id: string;
  environment: string;
  auth_type: "iam" | "oauth";
  principal_arn: string | null;
  requested_models: string[];
  rpm_limit: number;
  monthly_budget: number | null;
  guardrail_policy: string;
  data_classification: string;
  requested_by: string;
  status: OnboardingStatus;
  reason: string | null;
  created_at: number;
  updated_at: number;
};

export type OnboardingAuditEvent = {
  event: string;
  actor: string;
  timestamp: number;
  reason: string | null;
};

export function listOnboardingRequests() {
  return gatewayFetch<{ requests: OnboardingRequestSummary[] }>("/v1/admin/onboarding-requests");
}

export function getOnboardingRequest(requestId: string) {
  return gatewayFetch<OnboardingRequestSummary & { history: OnboardingAuditEvent[] }>(
    `/v1/admin/onboarding-requests/${encodeURIComponent(requestId)}`
  );
}

export type NewOnboardingRequest = {
  tenant_id: string;
  application_id: string;
  environment: string;
  auth_type: "iam" | "oauth";
  principal_arn?: string;
  requested_models: string[];
  rpm_limit: number;
  monthly_budget?: number;
  guardrail_policy: string;
  data_classification: string;
};

export function submitOnboardingRequest(body: NewOnboardingRequest) {
  return gatewayFetch<{ request_id: string; status: OnboardingStatus }>(
    "/v1/admin/onboarding-requests",
    { method: "POST", body: JSON.stringify(body) }
  );
}

export function approveOnboardingRequest(requestId: string) {
  return gatewayFetch<OnboardingRequestSummary>(
    `/v1/admin/onboarding-requests/${encodeURIComponent(requestId)}/approve`,
    { method: "POST" }
  );
}

export function rejectOnboardingRequest(requestId: string, reason: string) {
  return gatewayFetch<OnboardingRequestSummary>(
    `/v1/admin/onboarding-requests/${encodeURIComponent(requestId)}/reject`,
    { method: "POST", body: JSON.stringify({ reason }) }
  );
}

// Plan section 33 / 35.15 (P2 production hardening): policy
// versioning/approval/rollback. Unlike onboarding, approve/reject/
// rollback are admin-only server-side (a manager can propose a change
// to their own tenant but never approve it -- separation of duties);
// the portal itself does no role gating client-side, it just surfaces
// whatever 403 the gateway API returns via GatewayError.
export type PolicyChangeStatus = "PENDING_APPROVAL" | "APPLIED" | "REJECTED";

export type PolicyChangeRequest = {
  change_id: string;
  tenant_id: string;
  changes: Record<string, unknown>;
  base_policy_epoch: number;
  requested_by: string;
  status: PolicyChangeStatus;
  reason: string | null;
  approved_by: string | null;
  created_at: number;
  updated_at: number;
};

export type PolicyHistoryEntry = {
  policy_epoch: number;
  state: string;
  models: string[];
  rpm_limit: number;
  guardrail_policy: string;
  route_set: string | null;
  monthly_budget: number | null;
  max_concurrency: number | null;
};

export function listPolicyChanges(tenantId: string) {
  return gatewayFetch<{ changes: PolicyChangeRequest[] }>(
    `/v1/admin/tenants/${encodeURIComponent(tenantId)}/policy-changes`
  );
}

export function getPolicyHistory(tenantId: string) {
  return gatewayFetch<{ tenant_id: string; history: PolicyHistoryEntry[] }>(
    `/v1/admin/tenants/${encodeURIComponent(tenantId)}/policy-history`
  );
}

export function proposePolicyChange(
  tenantId: string,
  changes: Record<string, unknown>,
  basePolicyEpoch: number
) {
  return gatewayFetch<PolicyChangeRequest>(
    `/v1/admin/tenants/${encodeURIComponent(tenantId)}/policy-changes`,
    {
      method: "POST",
      body: JSON.stringify({ changes, base_policy_epoch: basePolicyEpoch }),
    }
  );
}

export function approvePolicyChange(tenantId: string, changeId: string) {
  return gatewayFetch<PolicyChangeRequest>(
    `/v1/admin/tenants/${encodeURIComponent(tenantId)}/policy-changes/${encodeURIComponent(changeId)}/approve`,
    { method: "POST" }
  );
}

export function rejectPolicyChange(tenantId: string, changeId: string, reason: string) {
  return gatewayFetch<PolicyChangeRequest>(
    `/v1/admin/tenants/${encodeURIComponent(tenantId)}/policy-changes/${encodeURIComponent(changeId)}/reject`,
    { method: "POST", body: JSON.stringify({ reason }) }
  );
}

export function rollbackPolicy(tenantId: string, targetEpoch: number) {
  return gatewayFetch<{ tenant_id: string; policy_epoch: number }>(
    `/v1/admin/tenants/${encodeURIComponent(tenantId)}/rollback`,
    { method: "POST", body: JSON.stringify({ target_epoch: targetEpoch }) }
  );
}
