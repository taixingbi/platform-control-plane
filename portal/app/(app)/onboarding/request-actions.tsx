"use client";

import { useState, useTransition } from "react";
import { approveRequest, rejectRequest } from "./actions";

export function RequestActions({ requestId }: { requestId: string }) {
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (showReject) {
    return (
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Rejection reason"
          className="w-48 rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-primary"
        />
        <button
          disabled={isPending || !reason.trim()}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              try {
                await rejectRequest(requestId, reason.trim());
              } catch (err) {
                setError(err instanceof Error ? err.message : "reject failed");
              }
            });
          }}
          className="rounded-md bg-destructive px-2 py-1 text-xs font-medium text-destructive-foreground disabled:opacity-60"
        >
          Confirm
        </button>
        <button
          disabled={isPending}
          onClick={() => {
            setShowReject(false);
            setReason("");
            setError(null);
          }}
          className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
        >
          Cancel
        </button>
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              await approveRequest(requestId);
            } catch (err) {
              setError(err instanceof Error ? err.message : "approve failed");
            }
          });
        }}
        className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-60"
      >
        {isPending ? "Working..." : "Approve"}
      </button>
      <button
        disabled={isPending}
        onClick={() => setShowReject(true)}
        className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-60"
      >
        Reject
      </button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
