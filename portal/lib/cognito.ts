// Cognito Hosted UI OAuth2 Authorization Code flow for human portal
// login -- separate from the gateway's own service-to-service
// AWS_IAM/SigV4 path, which this file has nothing to do with. See
// app/api/auth/login and app/api/auth/callback for where this is used.
//
// A confidential client (COGNITO_CLIENT_SECRET is set) so the code<->
// token exchange happens here, server-side, never in the browser.

const COGNITO_DOMAIN = process.env.COGNITO_DOMAIN ?? "";
const COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID ?? "";
const COGNITO_CLIENT_SECRET = process.env.COGNITO_CLIENT_SECRET ?? "";
const PORTAL_BASE_URL = process.env.PORTAL_BASE_URL ?? "";

const REDIRECT_URI = `${PORTAL_BASE_URL}/api/auth/callback`;

function requireConfig() {
  if (!COGNITO_DOMAIN || !COGNITO_CLIENT_ID || !COGNITO_CLIENT_SECRET || !PORTAL_BASE_URL) {
    throw new Error("Cognito is not configured (COGNITO_DOMAIN/COGNITO_CLIENT_ID/COGNITO_CLIENT_SECRET/PORTAL_BASE_URL)");
  }
}

// Absolute URLs on this portal's own public domain -- deliberately
// not built from a request's Host header. Confirmed live: the
// container sees the ECS task's private DNS name as Host
// (ip-10-x-x-x.ec2.internal:8080), not the public CloudFront domain,
// so NextResponse.redirect(new URL(path, request.url)) sends browsers
// to an unreachable internal address. PORTAL_BASE_URL is the one
// value actually guaranteed correct.
export function portalUrl(path: string): string {
  requireConfig();
  return `${PORTAL_BASE_URL}${path}`;
}

export function authorizeUrl(state: string): string {
  requireConfig();
  const params = new URLSearchParams({
    client_id: COGNITO_CLIENT_ID,
    response_type: "code",
    scope: "openid email profile",
    redirect_uri: REDIRECT_URI,
    state,
  });
  return `https://${COGNITO_DOMAIN}/oauth2/authorize?${params.toString()}`;
}

export function hostedLogoutUrl(): string {
  requireConfig();
  const params = new URLSearchParams({
    client_id: COGNITO_CLIENT_ID,
    logout_uri: `${PORTAL_BASE_URL}/login`,
  });
  return `https://${COGNITO_DOMAIN}/logout?${params.toString()}`;
}

interface TokenResponse {
  id_token: string;
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
}

// The ID token, not the access token, is what identity_from_claims
// needs -- Cognito only puts custom:tenant_id/custom:application_id
// (and email) in the ID token. cognito:groups rides along on both.
export async function exchangeCodeForIdToken(code: string): Promise<string> {
  requireConfig();
  const basicAuth = Buffer.from(`${COGNITO_CLIENT_ID}:${COGNITO_CLIENT_SECRET}`).toString("base64");

  const res = await fetch(`https://${COGNITO_DOMAIN}/oauth2/token`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: COGNITO_CLIENT_ID,
      code,
      redirect_uri: REDIRECT_URI,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Cognito token exchange failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as TokenResponse;
  return data.id_token;
}
