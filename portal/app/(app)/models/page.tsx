import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/table";
import { listRouteSets } from "@/lib/gateway";

export const dynamic = "force-dynamic";

function CertBadge({ certified }: { certified: boolean }) {
  return <Badge tone={certified ? "success" : "destructive"}>{certified ? "certified" : "NOT certified"}</Badge>;
}

export default async function ModelsPage() {
  const { route_sets, certified_models } = await listRouteSets();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Models / Route Sets</h1>
        <p className="text-sm text-muted-foreground">
          Certification (M9) is enforced at request time, not just informational here -- an
          uncertified model is silently skipped by the router even if it&apos;s listed as a
          fallback below. Certify a model via <code className="rounded bg-muted px-1">evals/run_eval.py</code>{" "}
          in bedrock-gateway-app.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Certified models ({certified_models.length})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {certified_models.map((m) => (
            <Badge key={m} tone="success">
              {m}
            </Badge>
          ))}
          {certified_models.length === 0 && (
            <span className="text-sm text-muted-foreground">No certified models yet.</span>
          )}
        </CardContent>
      </Card>

      {route_sets.map((rs) => (
        <Card key={rs.name}>
          <CardHeader>
            <CardTitle>{rs.name}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <Thead>
                <Tr>
                  <Th>Role</Th>
                  <Th>Model</Th>
                  <Th>Certification</Th>
                </Tr>
              </Thead>
              <Tbody>
                <Tr>
                  <Td className="font-medium">primary</Td>
                  <Td className="font-mono text-xs">{rs.primary}</Td>
                  <Td>
                    <CertBadge certified={rs.primary_certified} />
                  </Td>
                </Tr>
                {rs.fallbacks.map((fb, i) => (
                  <Tr key={fb.model}>
                    <Td className="text-muted-foreground">fallback #{i + 1}</Td>
                    <Td className="font-mono text-xs">{fb.model}</Td>
                    <Td>
                      <CertBadge certified={fb.certified} />
                    </Td>
                  </Tr>
                ))}
                {rs.fallbacks.length === 0 && (
                  <Tr>
                    <Td colSpan={3} className="text-center text-muted-foreground">
                      No fallbacks configured -- behaves as a direct call.
                    </Td>
                  </Tr>
                )}
              </Tbody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
