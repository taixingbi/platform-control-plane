"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hostedLogoutUrl } from "@/lib/cognito";
import { SESSION_COOKIE } from "@/lib/session";

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  // Clears this cookie, but Cognito's Hosted UI keeps its own browser
  // session -- without this redirect, "sign in with Cognito" right
  // after logging out would silently re-authenticate as the same
  // user with no login prompt.
  redirect(hostedLogoutUrl());
}
