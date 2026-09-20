export const dynamic = "force-dynamic";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-sm">
        <h1 className="text-lg font-semibold">Bedrock Gateway Portal</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sign in with your platform admin account. Human sign-in goes through Cognito;
          service/application callers keep using IAM/SigV4 against the gateway directly.
        </p>

        {searchParams?.error && (
          <p className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {searchParams.error}
          </p>
        )}

        <a
          href="/api/auth/login"
          className="mt-5 block w-full rounded-md bg-primary px-4 py-2 text-center text-sm font-medium text-primary-foreground"
        >
          Sign in with Cognito
        </a>
      </div>
    </div>
  );
}
