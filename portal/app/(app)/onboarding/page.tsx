import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/table";
import { listOnboardingRequests, OnboardingStatus } from "@/lib/gateway";
import { RequestActions } from "./request-actions";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<OnboardingStatus, "default" | "success" | "warning" | "destructive" | "muted"> = {
  PENDING_APPROVAL: "warning",
  APPROVED: "default",
  PROVISIONING: "default",
  ACTIVE: "success",
  REJECTED: "muted",
  FAILED: "destructive",
};

export default async function OnboardingPage() {
  const { requests } = await listOnboardingRequests();
  const pending = requests.filter((r) => r.status === "PENDING_APPROVAL");
  const resolved = requests.filter((r) => r.status !== "PENDING_APPROVAL");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Application Onboarding</h1>
          <p className="text-sm text-muted-foreground">
            Request → approve → provision → active (plan section 22). Approving creates a real
            principal mapping and, if the tenant doesn&apos;t already exist, a real tenant policy —
            no manual DynamoDB edits.
          </p>
        </div>
        <Link
          href="/onboarding/new"
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
        >
          New Application
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{pending.length} pending approval</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <Thead>
              <Tr>
                <Th>Application</Th>
                <Th>Tenant</Th>
                <Th>Auth</Th>
                <Th>Requested by</Th>
                <Th>Models</Th>
                <Th></Th>
              </Tr>
            </Thead>
            <Tbody>
              {pending.map((r) => (
                <Tr key={r.request_id}>
                  <Td className="font-medium">
                    {r.application_id}
                    <div className="text-xs text-muted-foreground">{r.environment}</div>
                  </Td>
                  <Td>{r.tenant_id}</Td>
                  <Td className="text-muted-foreground">
                    {r.auth_type === "iam" ? (
                      <span className="font-mono text-xs">{r.principal_arn}</span>
                    ) : (
                      r.auth_type
                    )}
                  </Td>
                  <Td className="text-muted-foreground">{r.requested_by}</Td>
                  <Td className="text-muted-foreground">{r.requested_models.join(", ") || "—"}</Td>
                  <Td>
                    <RequestActions requestId={r.request_id} />
                  </Td>
                </Tr>
              ))}
              {pending.length === 0 && (
                <Tr>
                  <Td colSpan={6} className="text-center text-muted-foreground">
                    No requests pending approval.
                  </Td>
                </Tr>
              )}
            </Tbody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <Thead>
              <Tr>
                <Th>Application</Th>
                <Th>Tenant</Th>
                <Th>Status</Th>
                <Th>Requested by</Th>
                <Th>Reason</Th>
              </Tr>
            </Thead>
            <Tbody>
              {resolved.map((r) => (
                <Tr key={r.request_id}>
                  <Td className="font-medium">{r.application_id}</Td>
                  <Td>{r.tenant_id}</Td>
                  <Td>
                    <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
                  </Td>
                  <Td className="text-muted-foreground">{r.requested_by}</Td>
                  <Td className="text-muted-foreground">{r.reason ?? "—"}</Td>
                </Tr>
              ))}
              {resolved.length === 0 && (
                <Tr>
                  <Td colSpan={5} className="text-center text-muted-foreground">
                    No resolved requests yet.
                  </Td>
                </Tr>
              )}
            </Tbody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
