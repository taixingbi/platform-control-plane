"use client";

import { useState, useTransition } from "react";
import { proposeChange } from "./actions";

const PLACEHOLDER = `{
  "rpm_limit": 120,
  "monthly_budget": 5000
}`;

export function ProposeForm({ tenantId, currentEpoch }: { tenantId: string; currentEpoch: number }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
      >
        Propose Change
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">
        Changed fields only, as JSON (e.g. <code className="font-mono text-xs">rpm_limit</code>,{" "}
        <code className="font-mono text-xs">monthly_budget</code>,{" "}
        <code className="font-mono text-xs">models</code>,{" "}
        <code className="font-mono text-xs">guardrail_policy</code>,{" "}
        <code className="font-mono text-xs">route_set</code>,{" "}
        <code className="font-mono text-xs">max_concurrency</code>). Based on the current epoch,{" "}
        <span className="font-mono">{currentEpoch}</span> — proposing against a stale epoch is
        rejected with a conflict at approval time, not silently applied.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={PLACEHOLDER}
        rows={6}
        className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-primary"
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          disabled={isPending}
          onClick={() => {
            setError(null);
            let parsed: Record<string, unknown>;
            try {
              parsed = JSON.parse(text);
              if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
                throw new Error("must be a JSON object");
              }
              if (Object.keys(parsed).length === 0) {
                throw new Error("at least one field is required");
              }
            } catch (err) {
              setError(err instanceof Error ? `Invalid JSON: ${err.message}` : "Invalid JSON");
              return;
            }
            startTransition(async () => {
              try {
                await proposeChange(tenantId, parsed, currentEpoch);
                setOpen(false);
                setText("");
              } catch (err) {
                setError(err instanceof Error ? err.message : "propose failed");
              }
            });
          }}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {isPending ? "Submitting..." : "Submit for approval"}
        </button>
        <button
          disabled={isPending}
          onClick={() => {
            setOpen(false);
            setText("");
            setError(null);
          }}
          className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
