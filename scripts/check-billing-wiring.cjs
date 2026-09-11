#!/usr/bin/env node
/**
 * check-billing-wiring.cjs — smoke estático do caminho de monetização.
 *
 * Não faz compra real. Garante que arquivos, Edge Functions, trial canônico,
 * UI de equipe e checklist de deploy existem e estão alinhados — o tipo de
 * regressão que aparece depois de um refactor "inofensivo".
 *
 * Uso: node scripts/check-billing-wiring.cjs
 * Exit 0 = OK; exit 1 = falhas listadas.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const fails = [];

function read(rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) {
    fails.push('ausente: ' + rel);
    return '';
  }
  return fs.readFileSync(p, 'utf8');
}

function mustContain(rel, re, label) {
  const src = read(rel);
  if (!src) return;
  if (!re.test(src)) fails.push(label + ' — ' + rel);
}

/** Guarda contra reintroducao: falha se o padrao VOLTAR a aparecer. */
function mustNotContain(rel, re, label) {
  const src = read(rel);
  if (!src) return;
  if (re.test(src)) fails.push(label + ' — ' + rel);
}

function mustExist(rel) {
  if (!fs.existsSync(path.join(root, rel))) fails.push('ausente: ' + rel);
}

const limits = JSON.parse(read('config/plan-limits.json') || '{}');
const trial = Number(limits.trialDays);
if (!Number.isFinite(trial) || trial !== 7) {
  fails.push('config/plan-limits.json trialDays deve ser 7 (foi ' + limits.trialDays + ')');
}

mustContain('js/billing.js', new RegExp('TRIAL_DAYS:\\s*' + trial), 'TRIAL_DAYS canônico');
mustContain('js/billing.js', /getLifecycleAlert/, 'getLifecycleAlert');
mustContain('js/billing.js', /stripe-portal/, 'client stripe-portal');
mustContain('js/billing.js', /stripe-cancel/, 'client stripe-cancel');
mustContain('js/billing.js', /org-invite/, 'client org-invite');
mustContain('js/billing.js', /WELCOME_TRIAL_DAYS:\s*14/, 'Pro de boas-vindas 14 dias');
mustContain('js/billing.js', /janelaAnalitica/, 'janela de historico');
mustContain('js/billing.js', /claimWelcomeTrial/, 'Pro de boas-vindas no cliente');
mustExist('supabase/functions/welcome-trial/index.ts');
mustContain('supabase/functions/_shared/billing-constants.ts', /WELCOME_TRIAL_DAYS\s*=\s*14/,
  'welcome trial 14d na Edge');
mustContain('js/core/supabase-sync.js', /claimWelcomeTrial/, 'boas-vindas no SIGNED_IN');
// Trial vencido tem de deixar de valer: um entitlement nosso nao tem webhook
// de loja para virar o status, entao a data e a unica fonte da verdade.
mustContain('js/billing.js', /trialEndsAt/, 'expiracao de trial no cliente');
mustContain('backend/middleware/plan.js', /entitlementAtivo/, 'expiracao de trial no Express');
// O gate tem de valer com e sem login: era isso que criava um segundo
// plano gratuito, mais generoso, para quem nunca criava conta.
mustNotContain('js/billing.js', /shouldEnforceLimits:[\s\S]{0,200}isCloudUser/,
  'limites valem offline tambem');
mustContain('js/billing.js', /maxUsers:\s*2/, 'PRO maxUsers=2');

mustContain('js/modules/init-billing.js', /SHOW_BUSINESS_PLAN:\s*false/, 'Business fora do paywall');
{
  const plans = read('js/billing.js');
  const staticBlock = plans.slice(plans.indexOf('STATIC_PLANS:'), plans.indexOf('init: function'));
  if (/tier:\s*'BUSINESS'/.test(staticBlock)) {
    fails.push('STATIC_PLANS ainda inclui Business na vitrine');
  }
}
mustContain('js/modules/init-billing.js', /abrirEquipe/, 'UI equipe');
mustContain('js/modules/init-billing.js', /getLifecycleAlert/, 'banner lifecycle');

mustContain('index.html', /data-action="abrir-equipe"/, 'card Equipe no perfil');

mustContain(
  'supabase/functions/_shared/billing-constants.ts',
  new RegExp('TRIAL_DAYS\\s*=\\s*' + trial),
  'Edge TRIAL_DAYS',
);
mustContain('supabase/functions/_shared/stripe-billing.ts', /trial_period_days:\s*TRIAL_DAYS/, 'checkout usa TRIAL_DAYS');
mustContain('supabase/functions/_shared/email.ts', /api\.resend\.com/, 'Resend notify');

[
  'supabase/functions/stripe-portal/index.ts',
  'supabase/functions/stripe-cancel/index.ts',
  'supabase/functions/org-invite/index.ts',
  'supabase/migrations/20260903140000_fp_accept_org_invitation.sql',
  'docs/deploy-billing-edge.md',
  'docs/play-store-ficha.md',
].forEach(mustExist);

mustContain('js/billing.js', /_useSupabaseBilling/, 'preferência Supabase billing');
mustContain('js/billing.js', /express-subscribe-disabled/, 'sem subscribe Express no path Supabase');
mustContain('js/billing.js', /org-invite-unavailable/, 'invite sem bypass Edge');
mustContain('js/modules/init-billing.js', /O Pro cuida do seu mês por você/, 'paywall vende capacidade');
mustNotContain('js/modules/init-billing.js', /tira os limites/i, 'paywall nao vende remocao de limite');
mustContain('js/modules/init-billing.js', /billing-plan-locked/, 'Assinar oculto sem login');
mustNotContain('js/insights.js', /consumeLocalAiUse/, 'insights sem cota por uso');
mustNotContain('js/modules/init-form.js', /guardQuota\('transaction'/, 'sem teto de lancamentos');
mustContain('js/alertas.js', /upsell-alertas-avancados/, 'upsell alertas FREE nuvem');
mustContain('js/core/supabase-sync.js', /_consumePendingInvite/, 'invite após SIGNED_IN');
mustContain('js/play-billing.js', /getProductDetails/, 'Play product details');
mustContain('js/fp-native-billing-bridge.js', /getProductDetails/, 'bridge getProductDetails');
mustContain('js/core/lifecycle.js', /_reconciliarPlay\(\{\s*force:\s*true/,
  'reconcile Play no boot (RISK-04)');
mustContain('js/modules/init-billing.js', /_reconciliouNestaSessao/,
  'reconcile force 1×/sessão');
{
  const bundle = read('scripts/bundle-app.cjs');
  const conta = bundle.slice(bundle.indexOf('conta:'), bundle.indexOf('conta:') + 500);
  if (/js\/billing\.js/.test(conta)) {
    fails.push('billing.js voltou ao lazy conta (RISK-01)');
  }
}
mustContain(
  'android/app/src/main/java/com/financaspro/app/PlayBillingPlugin.java',
  /getProductDetails/,
  'plugin getProductDetails',
);
if (/Crie conta Pro na nuvem para continuar sem limite/.test(read('js/modules/init-billing.js'))) {
  fails.push('banner soft AI ainda promete conta Pro sem limite');
}
if (/todos os recursos locais/i.test(read('js/modules/init-billing.js'))) {
  fails.push('paywall ainda promete “todos os recursos locais”');
}
if (/!DADOS\._nuvemAtiva\(\)\).*return;/s.test(read('js/modules/init-billing.js').replace(/\s+/g, ' '))) {
  // Heurística frouxa — o early-return silencioso não deve existir em abrirPaywall.
}
{
  const init = read('js/modules/init-billing.js');
  const start = init.indexOf('abrirPaywall:');
  const chunk = init.slice(start, start + 900);
  if (/_nuvemAtiva\(\)\).*\{\s*return;\s*\}/s.test(chunk)) {
    fails.push('abrirPaywall ainda retorna silencioso sem nuvem');
  }
}

mustExist('js/fp-native-billing-bridge.js');
mustContain('js/fp-native-billing-bridge.js', /__fpNativeBilling/, 'bridge Play nativo');
mustContain('index.html', /fp-native-billing-bridge\.js/, 'bridge no index');
mustContain(
  'android/app/src/main/java/com/financaspro/app/MainActivity.java',
  /PlayBillingPlugin/,
  'PlayBillingPlugin registrado',
);

mustContain('docs/play-store-ficha.md', /trial de 7 dias/i, 'ficha trial 7d');
mustContain('docs/play-store-ficha.md', /R\$ 16,99/, 'ficha preço Pro mensal');
mustContain('docs/play-store-ficha.md', /R\$ 129,99\/ano/, 'ficha preço Pro anual');
// A ficha publicada e os SKUs precisam contar a mesma história.
mustNotContain('docs/play-store-ficha.md', /R\$ 12,90|R\$ 79,90\/ano/, 'ficha sem preço antigo');
if (/Não pede cadastro nem e-mail para começar/i.test(read('docs/play-store-ficha.md'))) {
  fails.push('ficha Play ainda promete “sem cadastro”');
}

mustContain('docs/openapi.json', /\/orgs\/\{orgId\}\/invitations\/\{invitationId\}/, 'OpenAPI DELETE convite');
mustContain('backend/routes/orgs.js', /revokeInvitation|invitations\/:invitationId/, 'rota Express revoke');

if (fails.length) {
  console.error('[check-billing-wiring] FALHOU (' + fails.length + '):');
  fails.forEach(function (f) { console.error('  - ' + f); });
  process.exit(1);
}

console.log('[check-billing-wiring] OK — trial=' + trial + 'd · portal/cancel/org-invite · equipe · ficha · openapi');
