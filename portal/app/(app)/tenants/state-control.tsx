"use client";

import { useState, useTransition } from "react";
import { updateTenantState } from "./actions";

const STATES = ["ACTIVE", "THROTTLED", "READ_ONLY", "SUSPENDED", "EMERGENCY_BLOCK"] as const;

export function StateControl({ tenantId, state }: { tenantId: string; state: string }) {
  const [current, setCurrent] = useState(state);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <select
        value={current}
        disabled={isPending}
        onChange={(e) => {
          const next = e.target.value;
          const previous = current;
          setCurrent(next);
          setError(null);
          startTransition(async () => {
            try {
              await updateTenantState(tenantId, next);
            } catch (err) {
              setCurrent(previous);
              setError(err instanceof Error ? err.message : "update failed");
            }
          });
        }}
        className="rounded-md border border-border bg-background px-2 py-1 text-xs disabled:opacity-60"
      >
        {STATES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
