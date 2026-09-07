/**
 * play-rtdn-notificacoes.test.js — o RTDN precisa reagir aos três envelopes.
 *
 * O endpoint foi exercitado de verdade com Deno, um banco de mentira e
 * envelopes reais do Pub/Sub. O que aquele ensaio achou:
 *
 *   1. voidedPurchaseNotification (estorno/chargeback) era reconhecida e
 *      DESCARTADA — 200 com handled:false, e o Pro seguia de pé depois do
 *      dinheiro voltar. Para assinatura o caminho comum é SUBSCRIPTION_REVOKED,
 *      que já funcionava; esta é a rede de segurança que não existia.
 *   2. testNotification caía no mesmo "sem-subscription-notification" de um
 *      envelope desconhecido. Quem clica em "Enviar notificação de teste" no
 *      Play Console lia isso como endpoint quebrado.
 *   3. token-desconhecido não deixava rastro. Nos logs, um RTDN quebrado (o
 *      play-verify nunca gravou o token) é idêntico a um saudável: 200 em
 *      tudo, para sempre.
 *
 * Aqui a asserção é sobre o fonte, porque o arquivo é TypeScript de Deno e não
 * entra no jest. O ensaio de runtime está descrito em docs/deploy-billing-edge.md.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const shared = fs.readFileSync(
  path.join(root, 'supabase/functions/_shared/play-billing.ts'), 'utf8',
);
const endpoint = fs.readFileSync(
  path.join(root, 'supabase/functions/play-rtdn/index.ts'), 'utf8',
);

/** Só o que roda — os comentários citam o comportamento antigo de propósito. */
const codigo = shared
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

function corpoDe(src, assinatura) {
  const inicio = src.indexOf(assinatura);
  expect(inicio).toBeGreaterThan(-1);
  let nivel = 0;
  for (let j = src.indexOf('{', inicio); j < src.length; j++) {
    if (src[j] === '{') nivel++;
    else if (src[j] === '}') { nivel--; if (nivel === 0) return src.slice(inicio, j + 1); }
  }
  throw new Error('sem fechamento: ' + assinatura);
}

describe('handleRtdn — os três envelopes que o Play manda', () => {
  const fn = corpoDe(codigo, 'export async function handleRtdn');

  test('estorno/chargeback reconsulta o token em vez de descartar', () => {
    expect(fn).toContain('voidedPurchaseNotification');
    expect(fn).toMatch(/vp\.purchaseToken[\s\S]{0,200}syncFromToken\(sb, vp\.purchaseToken\)/);
  });

  test('quem decide se o Pro cai é o Google, não a notificação', () => {
    /* syncFromToken reconsulta a assinatura e revoga só se o Google disser que
       não está mais valendo — uma notificação de estorno de item avulso não
       pode derrubar assinatura que segue paga. */
    const sync = corpoDe(codigo, 'export async function syncFromToken');
    expect(sync).toContain('getSubscriptionV2');
    expect(sync).toMatch(/if \(sub\.entitled\)/);
    expect(sync).toContain('revokePlayEntitlement');
  });

  test('a notificação de teste do Play Console se identifica', () => {
    expect(fn).toContain('testNotification');
    expect(fn).toMatch(/handled: true[\s\S]{0,80}teste/);
  });

  test('subscriptionNotification continua sendo o caminho principal', () => {
    expect(fn).toMatch(/subscriptionNotification[\s\S]{0,200}syncFromToken\(sb, sn\.purchaseToken\)/);
  });

  test('envelope que o Google inventar depois não estoura — só não é tratado', () => {
    expect(fn).toMatch(/return \{ handled: false, reason: "sem-subscription-notification" \};/);
  });
});

describe('Token sem dono deixa rastro', () => {
  const sync = corpoDe(codigo, 'export async function syncFromToken');

  test('avisa em vez de devolver 200 mudo', () => {
    expect(sync).toMatch(/console\.warn\([\s\S]{0,200}token n[ãa]o registrado/i);
    expect(sync).toContain('token-desconhecido');
  });
});

describe('Endpoint — autenticação falha fechada', () => {
  test('sem mecanismo configurado, recusa tudo', () => {
    expect(endpoint).toMatch(/if \(!secret && !saEsperada\)[\s\S]{0,400}status: 503/);
  });

  test('compara o segredo por digest, não por ===', () => {
    const cmp = corpoDe(endpoint, 'async function segredoConfere');
    expect(cmp).toContain('crypto.subtle.digest');
    expect(cmp).toMatch(/diff \|= x\[i\] \^ y\[i\]/);
  });

  test('OIDC do Pub/Sub confere e-mail da service account e audience', () => {
    const oidc = corpoDe(endpoint, 'async function oidcConfere');
    expect(oidc).toContain('tokeninfo');
    expect(oidc).toMatch(/info\.email !== saEsperada/);
    expect(oidc).toMatch(/email_verified/);
    expect(oidc).toMatch(/audiencia && info\.aud !== audiencia/);
  });

  test('idempotência por messageId, e libera o claim se o processamento falhar', () => {
    expect(endpoint).toMatch(/claimEvent\(sb, `rtdn:\$\{messageId\}`/);
    expect(endpoint).toMatch(/duplicate: true/);
    expect(endpoint).toMatch(/releaseEvent\(sb, `rtdn:\$\{messageId\}`\)/);
  });

  test('envelope ilegível é reconhecido para o Pub/Sub não reentregar em loop', () => {
    expect(endpoint).toMatch(/if \(!notification\) return new Response\(null, \{ status: 204 \}\)/);
  });
});
