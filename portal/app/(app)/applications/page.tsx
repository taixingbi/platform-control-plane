import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/table";
import { listApplications } from "@/lib/gateway";

export const dynamic = "force-dynamic";

export default async function ApplicationsPage() {
  const { applications, note } = await listApplications();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Applications</h1>
        <p className="text-sm text-muted-foreground">{note}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{applications.length} application grant(s)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <Thead>
              <Tr>
                <Th>Application</Th>
                <Th>Tenant</Th>
                <Th>Roles</Th>
                <Th>IAM principal ARN</Th>
              </Tr>
            </Thead>
            <Tbody>
              {applications.map((app) => (
                <Tr key={app.principal_arn}>
                  <Td className="font-medium">{app.application_id}</Td>
                  <Td>{app.tenant_id}</Td>
                  <Td className="text-muted-foreground">{app.roles.join(", ") || "—"}</Td>
                  <Td className="font-mono text-xs text-muted-foreground">{app.principal_arn}</Td>
                </Tr>
              ))}
              {applications.length === 0 && (
                <Tr>
                  <Td colSpan={4} className="text-center text-muted-foreground">
                    No AWS_IAM application grants configured.
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
