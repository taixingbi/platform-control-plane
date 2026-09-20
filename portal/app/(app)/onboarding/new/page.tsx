"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useState } from "react";
import { submit } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
    >
      {pending ? "Submitting..." : "Submit for approval"}
    </button>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary";

export default function NewApplicationPage() {
  const [state, formAction] = useFormState(submit, undefined);
  const [authType, setAuthType] = useState<"iam" | "oauth">("iam");

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold">New Application</h1>
        <p className="text-sm text-muted-foreground">
          Submits an onboarding request for platform admin approval. Approving it provisions a
          real principal mapping and, if the tenant doesn&apos;t already exist, a real tenant
          policy — see the Onboarding page for the queue.
        </p>
      </div>

      <form action={formAction} className="space-y-4 rounded-lg border border-border bg-card p-6">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Tenant">
            <input name="tenant_id" required placeholder="search" className={inputClass} />
          </Field>
          <Field label="Application name">
            <input name="application_id" required placeholder="search-rag-prod" className={inputClass} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Environment">
            <select name="environment" defaultValue="dev" className={inputClass}>
              <option value="dev">dev</option>
              <option value="prod">prod</option>
            </select>
          </Field>
          <Field label="Authentication type">
            <select
              name="auth_type"
              value={authType}
              onChange={(e) => setAuthType(e.target.value as "iam" | "oauth")}
              className={inputClass}
            >
              <option value="iam">AWS IAM role (SigV4)</option>
              <option value="oauth">OAuth client (JWT) — not automated yet</option>
            </select>
          </Field>
        </div>

        {authType === "iam" ? (
          <Field label="IAM role ARN">
            <input
              name="principal_arn"
              required
              placeholder="arn:aws:iam::123456789012:role/SearchRagProd"
              className={`${inputClass} font-mono text-xs`}
            />
          </Field>
        ) : (
          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            OAuth-client applications aren&apos;t provisioned automatically yet (plan section
            22.6) — this request will be recorded but approving it will fail until that&apos;s
            built. Provision the Cognito/OIDC client by hand instead for now.
          </p>
        )}

        <Field label="Requested models (comma-separated model/inference-profile IDs)">
          <input
            name="requested_models"
            placeholder="us.amazon.nova-lite-v1:0, us.amazon.nova-pro-v1:0"
            className={inputClass}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="RPM limit">
            <input name="rpm_limit" type="number" min={1} defaultValue={60} className={inputClass} />
          </Field>
          <Field label="Monthly budget (USD, optional)">
            <input name="monthly_budget" type="number" min={0} step="0.01" placeholder="10000" className={inputClass} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Guardrail policy">
            <input name="guardrail_policy" defaultValue="standard-v1" className={inputClass} />
          </Field>
          <Field label="Data classification">
            <select name="data_classification" defaultValue="internal" className={inputClass}>
              <option value="public">public</option>
              <option value="internal">internal</option>
              <option value="confidential">confidential</option>
              <option value="restricted">restricted</option>
            </select>
          </Field>
        </div>

        {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
        <SubmitButton />
      </form>
    </div>
  );
}
