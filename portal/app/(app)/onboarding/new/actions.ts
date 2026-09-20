"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { submitOnboardingRequest } from "@/lib/gateway";

export async function submit(_prevState: { error?: string } | undefined, formData: FormData) {
  const tenantId = (formData.get("tenant_id") as string)?.trim();
  const applicationId = (formData.get("application_id") as string)?.trim();
  const authType = formData.get("auth_type") as "iam" | "oauth";
  const principalArn = (formData.get("principal_arn") as string)?.trim();

  if (!tenantId || !applicationId) {
    return { error: "Tenant and application name are required." };
  }
  if (authType === "iam" && !principalArn) {
    return { error: "principal_arn is required for the IAM auth type." };
  }

  const models = (formData.get("requested_models") as string)
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

  const rpmLimit = Number(formData.get("rpm_limit")) || 60;
  const budgetRaw = (formData.get("monthly_budget") as string)?.trim();

  try {
    await submitOnboardingRequest({
      tenant_id: tenantId,
      application_id: applicationId,
      environment: (formData.get("environment") as string) || "dev",
      auth_type: authType,
      principal_arn: authType === "iam" ? principalArn : undefined,
      requested_models: models,
      rpm_limit: rpmLimit,
      monthly_budget: budgetRaw ? Number(budgetRaw) : undefined,
      guardrail_policy: (formData.get("guardrail_policy") as string) || "standard-v1",
      data_classification: (formData.get("data_classification") as string) || "internal",
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "submission failed" };
  }

  revalidatePath("/onboarding");
  redirect("/onboarding");
}
