"use server";

import { revalidatePath } from "next/cache";
import { approveOnboardingRequest, rejectOnboardingRequest } from "@/lib/gateway";

export async function approveRequest(requestId: string) {
  const result = await approveOnboardingRequest(requestId);
  revalidatePath("/onboarding");
  revalidatePath("/applications");
  revalidatePath("/tenants");
  return result;
}

export async function rejectRequest(requestId: string, reason: string) {
  const result = await rejectOnboardingRequest(requestId, reason);
  revalidatePath("/onboarding");
  return result;
}
