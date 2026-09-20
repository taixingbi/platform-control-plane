"use server";

import { revalidatePath } from "next/cache";
import { setTenantState } from "@/lib/gateway";

export async function updateTenantState(tenantId: string, state: string) {
  const result = await setTenantState(tenantId, state);
  revalidatePath("/tenants");
  return result;
}
