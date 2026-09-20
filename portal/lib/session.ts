import { cookies } from "next/headers";

// Human sign-in goes through Cognito's Hosted UI (see lib/cognito.ts,
// app/api/auth/*) -- this cookie holds the resulting ID token, an
// HttpOnly cookie never exposed to client JS, attached server-side to
// every call to the gateway's admin API. Same cookie, same shape as
// before Cognito; only how it gets populated changed.
export const SESSION_COOKIE = "gw_admin_token";

// CSRF guard for the OAuth2 redirect round-trip -- see
// app/api/auth/login and app/api/auth/callback.
export const STATE_COOKIE = "gw_oauth_state";

export async function getAdminToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}
