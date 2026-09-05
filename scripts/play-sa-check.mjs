// scripts/play-sa-check.mjs
// Testa a conta de serviço do Google Play FORA do app (sem Supabase, sem expor a chave).
//
// Uso:
//   node scripts/play-sa-check.mjs --key C:\caminho\sa.json
//   node scripts/play-sa-check.mjs --key C:\caminho\sa.json --token <purchaseToken>
//
// Imprime SOMENTE: client_email, status HTTP e error.status/reason/message da Google.
// NUNCA imprime a private_key nem o purchaseToken. Seguro para colar no chat.

import { readFileSync } from "node:fs";
import { createSign } from "node:crypto";

const args = process.argv.slice(2);
const arg = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };

const keyPath = arg("--key");
const pkg = arg("--package") || "com.financaspro.mobile";
const purchaseToken = arg("--token");

if (!keyPath) { console.error("Falta --key <caminho do JSON da service account>"); process.exit(1); }

const SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const API = "https://androidpublisher.googleapis.com/androidpublisher/v3";

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function loadSa(path) {
  let s = readFileSync(path, "utf8");
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  s = s.trim();
  let j = JSON.parse(s);
  if (typeof j === "string") j = JSON.parse(j);
  if (typeof j.private_key === "string" && j.private_key.includes("\\n")) {
    j.private_key = j.private_key.replace(/\\n/g, "\n");
  }
  return j;
}

async function getToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const aud = sa.token_uri || "https://oauth2.googleapis.com/token";
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud, iat: now, exp: now + 3600 }));
  const input = `${header}.${claims}`;
  const sig = b64url(createSign("RSA-SHA256").update(input).sign(sa.private_key));
  const res = await fetch(aud, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${input}.${sig}` }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.log(`[OAuth] ${res.status} ${body.error || ""} :: ${body.error_description || ""}`);
    process.exit(2);
  }
  console.log(`[OAuth] 200 OK — access_token obtido (expira em ${body.expires_in}s)`);
  return body.access_token;
}

async function probe(label, url, token) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const txt = await res.text().catch(() => "");
  const isHtml = /^\s*<(!doctype|html)/i.test(txt);
  let e = null;
  if (!isHtml) { try { e = JSON.parse(txt).error; } catch { /* ignore */ } }
  const reason = e?.errors?.[0]?.reason || e?.status || (isHtml ? "resposta-HTML(URL-invalida)" : "");
  const msg = isHtml ? "" : (e?.message || (res.ok ? "" : txt) || "").slice(0, 240).replace(/\s+/g, " ");
  console.log(`[${label}] HTTP ${res.status}${reason ? " | " + reason : ""}`);
  if (msg) console.log(`[${label}] ${msg}`);
  return res.status;
}

const sa = loadSa(keyPath);
console.log(`client_email : ${sa.client_email}`);
console.log(`project_id   : ${sa.project_id}`);
console.log(`package      : ${pkg}`);
console.log("---");

const token = await getToken(sa);

// Probe A: a SA enxerga o app? (nao depende de compra nenhuma)
// Path correto: /applications/{pkg}/subscriptions  (sem "monetization")
const a = await probe("A1: listar assinaturas do app", `${API}/applications/${encodeURIComponent(pkg)}/subscriptions?pageSize=5`, token);
const a2 = await probe("A2: listar produtos no app", `${API}/applications/${encodeURIComponent(pkg)}/inappproducts`, token);

// Probe B: o purchaseToken específico
if (purchaseToken) {
  await probe("B: subscriptionsv2.get", `${API}/applications/${encodeURIComponent(pkg)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`, token);
}

console.log("---");
const best = (a === 200 || a2 === 200) ? 200 : Math.min(a, a2);
if (best === 200) {
  console.log("=> A SA TEM acesso ao app. Se o probe B falhar, o problema e o purchaseToken, nao permissao.");
} else if (best === 401) {
  console.log("=> A SA NAO tem acesso ao app (permissao ainda nao propagou). Espere 15-60 min e rode de novo.");
} else if (best === 403) {
  console.log("=> API desativada ou bloqueio no Cloud. Veja o 'reason' acima.");
} else if (best === 404) {
  console.log("=> 404 em JSON = o pacote nao existe nesta conta de desenvolvedor. 404 em HTML = URL errada no script.");
}
