import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/table";
import { getUsage } from "@/lib/gateway";

export const dynamic = "force-dynamic";

function formatUsd(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;
}

export default async function UsagePage() {
  const { tenants } = await getUsage();
  const totalSpend = tenants.reduce((sum, t) => sum + t.spend, 0);
  const overBudget = tenants.filter((t) => t.utilization != null && t.utilization >= 1).length;
  const month = tenants[0]?.month ?? "";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Usage / Cost</h1>
        <p className="text-sm text-muted-foreground">
          Showback/chargeback for {month || "the current month"} (plan section 20). Budget
          enforcement (M8) is a hard limit -- a tenant at 100% utilization is already being
          rejected with 429 BUDGET_EXCEEDED, not just close to it.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Total spend this month" value={formatUsd(totalSpend)} />
        <Stat label="Tenants tracked" value={String(tenants.length)} />
        <Stat
          label="Tenants over budget"
          value={String(overBudget)}
          hint={overBudget > 0 ? "currently rejecting requests" : undefined}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Spend by tenant</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <Thead>
              <Tr>
                <Th>Tenant</Th>
                <Th>Spend</Th>
                <Th>Budget</Th>
                <Th>Utilization</Th>
              </Tr>
            </Thead>
            <Tbody>
              {tenants
                .slice()
                .sort((a, b) => b.spend - a.spend)
                .map((t) => (
                  <Tr key={t.tenant_id}>
                    <Td className="font-medium">{t.tenant_id}</Td>
                    <Td className="tabular-nums">{formatUsd(t.spend)}</Td>
                    <Td className="tabular-nums text-muted-foreground">
                      {t.monthly_budget != null ? formatUsd(t.monthly_budget) : "unlimited"}
                    </Td>
                    <Td>
                      {t.utilization != null ? (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                            <div
                              className={`h-full ${t.utilization >= 1 ? "bg-destructive" : t.utilization >= 0.8 ? "bg-warning" : "bg-success"}`}
                              style={{ width: `${Math.min(t.utilization, 1) * 100}%` }}
                            />
                          </div>
                          <span className="tabular-nums text-xs text-muted-foreground">
                            {(t.utilization * 100).toFixed(1)}%
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </Td>
                  </Tr>
                ))}
            </Tbody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
