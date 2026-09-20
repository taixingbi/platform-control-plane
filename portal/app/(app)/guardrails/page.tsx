import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/table";
import { listTenants } from "@/lib/gateway";

export const dynamic = "force-dynamic";

// BasicGuardrailClient (services/gateway/guardrails/basic_guardrail.py)
// runs the same fixed checks for every guardrail_policy name -- there's
// no per-policy rule configuration in the backend yet, so this page
// shows what's genuinely true today (which policy name each tenant is
// assigned, and what that name currently gates) rather than a config
// UI for something that doesn't exist as editable state.
const CHECKS = [
  { category: "PII", detail: "SSN, credit-card-like, and email patterns" },
  { category: "Prompt injection", detail: "a denylist of common override phrases" },
];

export default async function GuardrailsPage() {
  const { tenants } = await listTenants();
  const byPolicy = new Map<string, string[]>();
  for (const t of tenants) {
    byPolicy.set(t.guardrail_policy, [...(byPolicy.get(t.guardrail_policy) ?? []), t.tenant_id]);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Guardrails</h1>
        <p className="text-sm text-muted-foreground">
          Fail-closed (plan section 11): if a guardrail check can&apos;t complete, the request is
          blocked with 503 rather than silently allowed through, unless a tenant explicitly opts
          into <code className="rounded bg-muted px-1">allow_guardrail_bypass_on_error</code>.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>What every guardrail_policy currently checks</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <Thead>
              <Tr>
                <Th>Category</Th>
                <Th>Detail</Th>
              </Tr>
            </Thead>
            <Tbody>
              {CHECKS.map((c) => (
                <Tr key={c.category}>
                  <Td className="font-medium">{c.category}</Td>
                  <Td className="text-muted-foreground">{c.detail}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Policy assignment by tenant</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <Thead>
              <Tr>
                <Th>guardrail_policy</Th>
                <Th>Tenants</Th>
              </Tr>
            </Thead>
            <Tbody>
              {[...byPolicy.entries()].map(([policy, tenantIds]) => (
                <Tr key={policy}>
                  <Td className="font-medium">
                    <Badge tone="muted">{policy}</Badge>
                  </Td>
                  <Td className="text-muted-foreground">{tenantIds.join(", ")}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
