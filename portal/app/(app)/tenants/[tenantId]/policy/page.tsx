import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/table";
import {
  getPolicyHistory,
  listPolicyChanges,
  listTenants,
  PolicyChangeStatus,
} from "@/lib/gateway";
import { ChangeActions } from "./change-actions";
import { ProposeForm } from "./propose-form";
import { RollbackControl } from "./rollback-control";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<PolicyChangeStatus, "default" | "success" | "warning" | "destructive" | "muted"> = {
  PENDING_APPROVAL: "warning",
  APPLIED: "success",
  REJECTED: "muted",
};

function formatChanges(changes: Record<string, unknown>) {
  return Object.entries(changes)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join(", ");
}

export default async function TenantPolicyPage({ params }: { params: { tenantId: string } }) {
  const tenantId = decodeURIComponent(params.tenantId);
  const [{ tenants }, { changes }, { history }] = await Promise.all([
    listTenants(),
    listPolicyChanges(tenantId),
    getPolicyHistory(tenantId),
  ]);
  const tenant = tenants.find((t) => t.tenant_id === tenantId);
  const currentEpoch = tenant?.policy_epoch ?? Math.max(0, ...history.map((h) => h.policy_epoch));

  const pending = changes
    .filter((c) => c.status === "PENDING_APPROVAL")
    .sort((a, b) => b.created_at - a.created_at);
  const resolved = changes
    .filter((c) => c.status !== "PENDING_APPROVAL")
    .sort((a, b) => b.updated_at - a.updated_at);
  const sortedHistory = [...history].sort((a, b) => b.policy_epoch - a.policy_epoch);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Link href="/tenants" className="hover:underline">
              Tenants
            </Link>
            <span>/</span>
            <span>{tenantId}</span>
          </div>
          <h1 className="text-lg font-semibold">Policy — {tenantId}</h1>
          <p className="text-sm text-muted-foreground">
            Propose → approve → apply → rollback (plan section 33). A manager can propose a
            change to their own tenant; only a platform admin can approve, reject, or roll one
            back — separation of duties, enforced by the gateway API, not this page. Current
            epoch: <span className="font-mono">{currentEpoch}</span>.
          </p>
        </div>
        <ProposeForm tenantId={tenantId} currentEpoch={currentEpoch} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{pending.length} pending approval</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <Thead>
              <Tr>
                <Th>Changes</Th>
                <Th>Base epoch</Th>
                <Th>Requested by</Th>
                <Th></Th>
              </Tr>
            </Thead>
            <Tbody>
              {pending.map((c) => (
                <Tr key={c.change_id}>
                  <Td className="max-w-md truncate font-mono text-xs" title={formatChanges(c.changes)}>
                    {formatChanges(c.changes)}
                  </Td>
                  <Td className="tabular-nums text-muted-foreground">{c.base_policy_epoch}</Td>
                  <Td className="text-muted-foreground">{c.requested_by}</Td>
                  <Td>
                    <ChangeActions tenantId={tenantId} changeId={c.change_id} />
                  </Td>
                </Tr>
              ))}
              {pending.length === 0 && (
                <Tr>
                  <Td colSpan={4} className="text-center text-muted-foreground">
                    No changes pending approval.
                  </Td>
                </Tr>
              )}
            </Tbody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <Thead>
              <Tr>
                <Th>Changes</Th>
                <Th>Status</Th>
                <Th>Requested by</Th>
                <Th>Approved by</Th>
                <Th>Reason</Th>
              </Tr>
            </Thead>
            <Tbody>
              {resolved.map((c) => (
                <Tr key={c.change_id}>
                  <Td className="max-w-md truncate font-mono text-xs" title={formatChanges(c.changes)}>
                    {formatChanges(c.changes)}
                  </Td>
                  <Td>
                    <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
                  </Td>
                  <Td className="text-muted-foreground">{c.requested_by}</Td>
                  <Td className="text-muted-foreground">{c.approved_by ?? "—"}</Td>
                  <Td className="text-muted-foreground">{c.reason ?? "—"}</Td>
                </Tr>
              ))}
              {resolved.length === 0 && (
                <Tr>
                  <Td colSpan={5} className="text-center text-muted-foreground">
                    No resolved changes yet.
                  </Td>
                </Tr>
              )}
            </Tbody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Version history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <Thead>
              <Tr>
                <Th>Epoch</Th>
                <Th>State</Th>
                <Th>Models</Th>
                <Th>RPM limit</Th>
                <Th>Guardrail</Th>
                <Th>Route set</Th>
                <Th>Budget</Th>
                <Th></Th>
              </Tr>
            </Thead>
            <Tbody>
              {sortedHistory.map((h) => (
                <Tr key={h.policy_epoch}>
                  <Td className="tabular-nums font-medium">
                    {h.policy_epoch}
                    {h.policy_epoch === currentEpoch && (
                      <Badge tone="default" className="ml-2">
                        current
                      </Badge>
                    )}
                  </Td>
                  <Td className="text-muted-foreground">{h.state}</Td>
                  <Td className="text-muted-foreground">
                    {h.models.length > 0 ? h.models.join(", ") : "any"}
                  </Td>
                  <Td>{h.rpm_limit}</Td>
                  <Td className="text-muted-foreground">{h.guardrail_policy}</Td>
                  <Td className="text-muted-foreground">{h.route_set ?? "—"}</Td>
                  <Td className="text-muted-foreground">
                    {h.monthly_budget != null ? `$${h.monthly_budget}` : "unlimited"}
                  </Td>
                  <Td>
                    {h.policy_epoch !== currentEpoch && (
                      <RollbackControl tenantId={tenantId} epoch={h.policy_epoch} />
                    )}
                  </Td>
                </Tr>
              ))}
              {sortedHistory.length === 0 && (
                <Tr>
                  <Td colSpan={8} className="text-center text-muted-foreground">
                    No version history yet.
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
