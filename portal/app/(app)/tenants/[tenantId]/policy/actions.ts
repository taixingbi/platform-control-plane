"use server";

import { revalidatePath } from "next/cache";
import {
  approvePolicyChange,
  proposePolicyChange,
  rejectPolicyChange,
  rollbackPolicy,
} from "@/lib/gateway";

export async function proposeChange(
  tenantId: string,
  changes: Record<string, unknown>,
  basePolicyEpoch: number
) {
  const result = await proposePolicyChange(tenantId, changes, basePolicyEpoch);
  revalidatePath(`/tenants/${tenantId}/policy`);
  return result;
}

export async function approveChange(tenantId: string, changeId: string) {
  const result = await approvePolicyChange(tenantId, changeId);
  revalidatePath(`/tenants/${tenantId}/policy`);
  revalidatePath("/tenants");
  return result;
}

export async function rejectChange(tenantId: string, changeId: string, reason: string) {
  const result = await rejectPolicyChange(tenantId, changeId, reason);
  revalidatePath(`/tenants/${tenantId}/policy`);
  return result;
}

export async function rollbackToEpoch(tenantId: string, targetEpoch: number) {
  const result = await rollbackPolicy(tenantId, targetEpoch);
  revalidatePath(`/tenants/${tenantId}/policy`);
  revalidatePath("/tenants");
  return result;
}
