import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/table";
import { getUsage, listTenants } from "@/lib/gateway";
import { StateControl } from "./state-control";

export const dynamic = "force-dynamic";

export default async function TenantsPage() {
  const [{ tenants }, { tenants: usage }] = await Promise.all([listTenants(), getUsage()]);
  const spendByTenant = new Map(usage.map((u) => [u.tenant_id, u.spend]));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Tenants</h1>
        <p className="text-sm text-muted-foreground">
          State changes take effect immediately (push invalidation) -- SUSPENDED/EMERGENCY_BLOCK
          is the kill switch (plan section 7).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{tenants.length} tenant(s)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <Thead>
              <Tr>
                <Th>Tenant</Th>
                <Th>State</Th>
                <Th>Models</Th>
                <Th>RPM limit</Th>
                <Th>Route set</Th>
                <Th>Guardrail</Th>
                <Th>Budget (spent / limit)</Th>
                <Th>Policy epoch</Th>
                <Th></Th>
              </Tr>
            </Thead>
            <Tbody>
              {tenants.map((t) => (
                <Tr key={t.tenant_id}>
                  <Td className="font-medium">{t.tenant_id}</Td>
                  <Td>
                    <StateControl tenantId={t.tenant_id} state={t.state} />
                  </Td>
                  <Td className="text-muted-foreground">
                    {t.models.length > 0 ? t.models.join(", ") : "any (no restriction)"}
                  </Td>
                  <Td>{t.rpm_limit}</Td>
                  <Td className="text-muted-foreground">{t.route_set ?? "—"}</Td>
                  <Td className="text-muted-foreground">{t.guardrail_policy}</Td>
                  <Td className="tabular-nums">
                    {t.monthly_budget != null
                      ? `$${(spendByTenant.get(t.tenant_id) ?? 0).toFixed(6)} / $${t.monthly_budget}`
                      : "unlimited"}
                  </Td>
                  <Td className="tabular-nums text-muted-foreground">{t.policy_epoch}</Td>
                  <Td>
                    <Link
                      href={`/tenants/${encodeURIComponent(t.tenant_id)}/policy`}
                      className="text-xs text-primary hover:underline"
                    >
                      Policy →
                    </Link>
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
