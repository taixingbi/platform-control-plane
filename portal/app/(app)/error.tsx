"use client";

import { logout } from "@/app/login/actions";

export default function AppError({ error }: { error: Error & { digest?: string } }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6">
        <h1 className="text-sm font-semibold text-destructive">Gateway request failed</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          If the token expired or was revoked, sign in again with a fresh one.
        </p>
        <form action={logout} className="mt-4">
          <button
            type="submit"
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
