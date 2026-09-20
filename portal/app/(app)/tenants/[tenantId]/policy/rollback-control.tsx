"use client";

import { useState, useTransition } from "react";
import { rollbackToEpoch } from "./actions";

export function RollbackControl({ tenantId, epoch }: { tenantId: string; epoch: number }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Rollback live traffic to epoch {epoch}?</span>
        <button
          disabled={isPending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              try {
                await rollbackToEpoch(tenantId, epoch);
                setConfirming(false);
              } catch (err) {
                setError(err instanceof Error ? err.message : "rollback failed");
              }
            });
          }}
          className="rounded-md bg-destructive px-2 py-1 text-xs font-medium text-destructive-foreground disabled:opacity-60"
        >
          {isPending ? "Rolling back..." : "Confirm rollback"}
        </button>
        <button
          disabled={isPending}
          onClick={() => setConfirming(false)}
          className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
        >
          Cancel
        </button>
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
    >
      Rollback to this version
    </button>
  );
}
