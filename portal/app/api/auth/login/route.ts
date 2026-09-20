import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authorizeUrl } from "@/lib/cognito";
import { STATE_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

// Starts the Hosted UI Authorization Code flow. The state value is
// only a CSRF guard (proves the callback's request came from a
// redirect this server issued) -- it carries no session data itself.
export async function GET() {
  const state = randomBytes(16).toString("hex");

  (await cookies()).set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.PORTAL_HTTPS === "true",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  });

  return NextResponse.redirect(authorizeUrl(state));
}
