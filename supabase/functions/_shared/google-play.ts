// supabase/functions/_shared/google-play.ts
//
// Port Deno de backend/lib/google-play-api.js.
// Sem `jsonwebtoken` nem `googleapis`: assina o JWT RS256 da conta de serviço
// com a Web Crypto nativa (crypto.subtle) e usa fetch. Verifica assinaturas via
// purchases.subscriptionsv2.get.

const SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token";
const API_BASE =
  "https://androidpublisher.googleapis.com/androidpublisher/v3";

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

// Cache de access token por client_email (reaproveitado em instância quente).
const tokenCache = new Map<string, { token: string; exp: number }>();

export function parseServiceAccount(raw: unknown): ServiceAccount | null {
  if (!raw) return null;
  let json: any = raw;
  if (typeof raw === "string") {
    try {
      json = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!json || !json.client_email || !json.private_key) return null;
  return json as ServiceAccount;
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function signJwt(sa: ServiceAccount, now: number): Promise<string> {
  const enc = new TextEncoder();
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: sa.client_email,
    scope: SCOPE,
    aud: sa.token_uri || DEFAULT_TOKEN_URI,
    iat: now,
    exp: now + 3600,
  };
  const input = `${b64url(enc.encode(JSON.stringify(header)))}.${
    b64url(enc.encode(JSON.stringify(claims)))
  }`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(input)),
  );
  return `${input}.${b64url(sig)}`;
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const cached = tokenCache.get(sa.client_email);
  if (cached && cached.exp - 60 > now) return cached.token;

  const tokenUri = sa.token_uri || DEFAULT_TOKEN_URI;
  const assertion = await signJwt(sa, now);
  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("OAuth Google Play falhou", res.status, detail.slice(0, 300));
    const err: any = new Error("google-play-auth-falhou");
    err.status = 502;
    throw err;
  }
  const data = await res.json();
  const expiresIn = Number(data.expires_in) || 3600;
  tokenCache.set(sa.client_email, {
    token: data.access_token,
    exp: now + expiresIn,
  });
  return data.access_token;
}

export function isEntitledState(state: string, expiryTime: string | null): boolean {
  const denied = new Set([
    "SUBSCRIPTION_STATE_EXPIRED",
    "SUBSCRIPTION_STATE_ON_HOLD",
    "SUBSCRIPTION_STATE_PAUSED",
    "SUBSCRIPTION_STATE_PENDING",
    "SUBSCRIPTION_STATE_UNSPECIFIED",
  ]);
  if (denied.has(state)) return false;
  if (!expiryTime) return false;
  return new Date(expiryTime).getTime() > Date.now();
}

export interface SubscriptionV2Result {
  state: string;
  productId: string | null;
  expiryTime: string | null;
  entitled: boolean;
  raw: any;
}

export async function getSubscriptionV2(opts: {
  serviceAccountJson: unknown;
  packageName: string;
  purchaseToken: string;
}): Promise<SubscriptionV2Result> {
  const sa = parseServiceAccount(opts.serviceAccountJson);
  if (!sa) {
    const err: any = new Error("service-account-invalida");
    err.status = 500;
    throw err;
  }
  const accessToken = await getAccessToken(sa);
  const url = `${API_BASE}/applications/${
    encodeURIComponent(opts.packageName)
  }/purchases/subscriptionsv2/tokens/${encodeURIComponent(opts.purchaseToken)}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 404 || res.status === 410) {
    const err: any = new Error("assinatura-nao-encontrada");
    err.status = 404;
    throw err;
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("Google Play Developer API falhou", res.status, detail.slice(0, 300));
    const err: any = new Error("google-play-api-falhou");
    err.status = 502;
    throw err;
  }

  const raw = await res.json();
  const lineItems = Array.isArray(raw.lineItems) ? raw.lineItems : [];
  let expiryTime: string | null = null;
  let productId: string | null = null;
  for (const item of lineItems) {
    if (item.productId && !productId) productId = item.productId;
    if (item.expiryTime && (!expiryTime || item.expiryTime > expiryTime)) {
      expiryTime = item.expiryTime;
    }
  }
  const state = raw.subscriptionState || "SUBSCRIPTION_STATE_UNSPECIFIED";
  return { state, productId, expiryTime, entitled: isEntitledState(state, expiryTime), raw };
}
