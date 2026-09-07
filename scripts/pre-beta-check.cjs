#!/usr/bin/env node
/**
 * pre-beta-check.cjs — o que precisa estar de pé antes de abrir a faixa de testes.
 *
 * Por que existe: a auditoria pré-beta fechou os achados de código, mas cinco
 * itens dependem do ambiente (banco, functions, secrets, DNS) e esta sessão não
 * tinha rota de rede até o projeto. Dois deles se verificam comparando strings
 * a olho — os limites de plano no banco e a impressão do assetlinks — e é
 * exatamente onde erro passa batido.
 *
 * O que este script NÃO faz: deploy. Ele só olha e conta o que achou. Aplicar
 * migration, subir function e mexer em secret continua sendo decisão sua.
 *
 *   node scripts/pre-beta-check.cjs
 *
 * Variáveis opcionais:
 *   FP_APP_URL          origem pública do app        (padrão: https://app.financaspro.com)
 *   FP_KEYSTORE_PASS    senha do financaspro-upload.jks — habilita a checagem
 *                       automática de impressão do assetlinks (ver seção 7)
 *   FP_SKIP_CLI=1       pula o que depende do supabase CLI
 *   FP_SUPABASE_URL     aponta para outro projeto (staging) em vez do de produção
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const APP_URL = (process.env.FP_APP_URL || 'https://app.financaspro.com').replace(/\/$/, '');
const TIMEOUT_MS = 15000;

/* ─── Relatório ──────────────────────────────────────────────────────────── */

const achados = [];
let secaoAtual = '';

function secao(titulo) {
  secaoAtual = titulo;
  console.log('\n\x1b[1m' + titulo + '\x1b[0m');
}
function ok(msg, detalhe) {
  console.log('  \x1b[32m✓\x1b[0m ' + msg + (detalhe ? '  \x1b[2m' + detalhe + '\x1b[0m' : ''));
}
function falha(msg, oQueFazer) {
  console.log('  \x1b[31m✗\x1b[0m ' + msg);
  if (oQueFazer) console.log('    \x1b[2m→ ' + oQueFazer + '\x1b[0m');
  achados.push({ nivel: 'falha', secao: secaoAtual, msg, oQueFazer });
}
function aviso(msg, oQueFazer) {
  console.log('  \x1b[33m!\x1b[0m ' + msg);
  if (oQueFazer) console.log('    \x1b[2m→ ' + oQueFazer + '\x1b[0m');
  achados.push({ nivel: 'aviso', secao: secaoAtual, msg, oQueFazer });
}
function pulado(msg) {
  console.log('  \x1b[2m–\x1b[0m \x1b[2m' + msg + '\x1b[0m');
}

/* ─── Credenciais: a mesma fonte que o app usa ───────────────────────────── */

function lerCredenciaisDoApp() {
  /* Override para apontar a staging (e para os testes do próprio script). */
  if (process.env.FP_SUPABASE_URL) {
    return {
      url: process.env.FP_SUPABASE_URL.replace(/\/$/, ''),
      anon: process.env.FP_SUPABASE_ANON || 'anon-de-teste',
    };
  }
  const src = fs.readFileSync(path.join(RAIZ, 'js/core/config.js'), 'utf8');
  const url = (src.match(/_FP_CLOUD_URL = _FP_ENV_URL \|\| '([^']+)'/) || [])[1];
  const anon = (src.match(/_FP_CLOUD_ANON = _FP_ENV_ANON \|\| '([^']+)'/) || [])[1];
  if (!url || !anon) {
    throw new Error('não achei SUPABASE_URL/ANON_KEY em js/core/config.js');
  }
  return { url: url.replace(/\/$/, ''), anon };
}

async function buscar(url, opts) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, Object.assign({ signal: ctrl.signal }, opts || {}));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * O servidor responde de verdade?
 *
 * Esta pergunta vem antes de todas as outras, e a primeira versão do script não
 * a fazia — com a rede bloqueada ele anunciava "10 tabelas conferidas, nenhuma
 * vazou" e "as 8 functions respondem", porque um 403 de proxy não é 404 nem
 * traz linha nenhuma. Verde por ausência de resposta é a pior saída possível
 * num script cuja única função é dar confiança para abrir um beta.
 */
async function servidorResponde(cred) {
  try {
    const res = await buscar(cred.url + '/auth/v1/health', {
      headers: { apikey: cred.anon, Authorization: 'Bearer ' + cred.anon },
    });
    return { ok: res.status === 200, detalhe: 'HTTP ' + res.status };
  } catch (e) {
    return { ok: false, detalhe: e.message };
  }
}

/** Marca a seção como não verificada — nunca como aprovada. */
function inconclusivo(msg, oQueFazer) {
  console.log('  \x1b[35m?\x1b[0m ' + msg);
  if (oQueFazer) console.log('    \x1b[2m→ ' + oQueFazer + '\x1b[0m');
  achados.push({ nivel: 'inconclusivo', secao: secaoAtual, msg, oQueFazer });
}

/* ─── 3. Limites de plano: o estado EFETIVO do banco ─────────────────────── */
/*
 * Isto responde ao achado 06 melhor do que comparar hashes de migration.
 * A pergunta que importa não é "a migration foi aplicada?", é "o banco tem os
 * números certos?". fp_plan_limit_config tem policy de leitura pública, então
 * a chave anon basta.
 */
const CAMPOS_SQL = [
  ['max_trans_per_month', 'maxTransPerMonth'],
  ['max_accounts', 'maxAccounts'],
  ['max_budgets', 'maxBudgets'],
  ['max_custom_categories', 'maxCustomCategories'],
  ['max_goals', 'maxGoals'],
  ['max_recurring', 'maxRecurring'],
  ['max_bills_to_pay', 'maxBillsToPay'],
  ['max_subscriptions', 'maxSubscriptions'],
  ['max_attachments', 'maxAttachments'],
  ['max_devices', 'maxDevices'],
  ['history_months', 'historyMonths'],
  ['ocr_per_month', 'ocrPerMonth'],
];

async function conferirLimites(cred) {
  secao('3. Limites de plano no banco (achado 06)');
  const canonico = JSON.parse(fs.readFileSync(path.join(RAIZ, 'config/plan-limits.json'), 'utf8'));

  let linhas;
  try {
    const res = await buscar(cred.url + '/rest/v1/fp_plan_limit_config?select=*', {
      headers: { apikey: cred.anon, Authorization: 'Bearer ' + cred.anon },
    });
    if (!res.ok) {
      falha('a tabela não respondeu (HTTP ' + res.status + ')',
        'sem isso o resto da checagem do banco não vale — confira se as migrations subiram');
      return;
    }
    linhas = await res.json();
  } catch (e) {
    falha('não consegui falar com o Supabase: ' + e.message,
      'rode de uma máquina com acesso à internet e ao projeto');
    return;
  }

  if (!Array.isArray(linhas) || !linhas.length) {
    falha('fp_plan_limit_config está vazia no banco',
      'npx supabase db push — as migrations de quota não chegaram');
    return;
  }

  let divergencias = 0;
  ['FREE', 'PRO', 'BUSINESS'].forEach(function(tier) {
    const linha = linhas.find(function(l) { return l.tier === tier; });
    if (!linha) {
      falha('tier ' + tier + ' não existe na tabela', 'npx supabase db push');
      divergencias++;
      return;
    }
    CAMPOS_SQL.forEach(function(par) {
      const noBanco = linha[par[0]] === undefined ? null : linha[par[0]];
      const esperado = canonico[tier][par[1]] === undefined ? null : canonico[tier][par[1]];
      if (noBanco !== esperado) {
        falha(tier + '.' + par[0] + ': banco tem ' + JSON.stringify(noBanco)
          + ', o repositório diz ' + JSON.stringify(esperado),
          'a migration que define esse valor não foi aplicada — veja `npx supabase migration list`');
        divergencias++;
      }
    });
  });

  if (!divergencias) {
    ok('os 3 tiers batem com config/plan-limits.json', '36 valores conferidos');
  }
}

/* ─── 4. RLS: a chave anon não pode ler dado de ninguém ──────────────────── */

const TABELAS_PRIVADAS = [
  'User', 'UserConfig', 'Transaction', 'Account', 'Budget',
  'Subscription', 'Organization', 'OrganizationMember', 'Invoice', 'AuditLog',
];

async function conferirRls(cred) {
  secao('4. RLS — sem login, ninguém lê nada');
  let vazando = 0;
  let conferidas = 0;
  for (const tabela of TABELAS_PRIVADAS) {
    try {
      const res = await buscar(
        cred.url + '/rest/v1/' + tabela + '?select=*&limit=1',
        { headers: { apikey: cred.anon, Authorization: 'Bearer ' + cred.anon } },
      );
      const corpo = (await res.text()).trim();
      /* 200 com array vazio é o esperado: a policy filtra por auth.uid(), que
         sem sessão não casa com nada. 200 com linha é vazamento. Qualquer
         outro status não prova nada — e não pode virar aprovação. */
      if (res.status === 200) {
        if (corpo !== '[]' && corpo !== '') {
          falha(tabela + ' devolveu dados para a chave anônima',
            'RLS desligada ou policy permissiva demais — NÃO abra o beta assim');
          vazando++;
        } else {
          conferidas++;
        }
      } else if (res.status === 401 || res.status === 403) {
        /* PostgREST nega acesso: também é RLS funcionando. */
        conferidas++;
      } else {
        inconclusivo(tabela + ': resposta inesperada (HTTP ' + res.status + ')',
          'não consigo afirmar que a tabela está protegida');
      }
    } catch (e) {
      inconclusivo(tabela + ': não deu para checar (' + e.message + ')');
    }
  }
  if (!vazando && conferidas === TABELAS_PRIVADAS.length) {
    ok(conferidas + ' tabelas conferidas, nenhuma vazou');
  } else if (!vazando && conferidas) {
    aviso(conferidas + ' de ' + TABELAS_PRIVADAS.length + ' tabelas conferidas',
      'as demais ficaram sem resposta conclusiva');
  }
}

/* ─── 5. Edge Functions no ar ────────────────────────────────────────────── */

const FUNCTIONS = [
  'play-verify', 'play-rtdn', 'stripe-checkout', 'stripe-webhook',
  'stripe-cancel', 'stripe-portal', 'welcome-trial', 'org-invite',
];

async function conferirFunctions(cred) {
  secao('5. Edge Functions deployadas');
  const faltando = [];
  let respondendo = 0;
  for (const fn of FUNCTIONS) {
    try {
      const res = await buscar(cred.url + '/functions/v1/' + fn, {
        method: 'POST',
        headers: {
          apikey: cred.anon,
          Authorization: 'Bearer ' + cred.anon,
          'Content-Type': 'application/json',
        },
        body: '{}',
      });
      /* 404 = não existe. 401 (sem JWT) e 400 (sem parâmetros) provam que a
         function está lá. Qualquer outro status não prova nada. */
      if (res.status === 404) faltando.push(fn);
      else if (res.status === 401 || res.status === 400 || res.status === 200
               || res.status === 403 && /supabase/i.test(res.headers.get('server') || '')) {
        respondendo++;
      } else {
        inconclusivo(fn + ': resposta inesperada (HTTP ' + res.status + ')');
      }
    } catch (e) {
      inconclusivo(fn + ': não deu para checar (' + e.message + ')');
    }
  }
  if (faltando.length) {
    falha('não deployadas: ' + faltando.join(', '),
      'npx supabase functions deploy <nome> — um 404 em play-verify significa '
      + 'compra aprovada no Play e Pro não liberado');
  } else if (respondendo === FUNCTIONS.length) {
    ok('as ' + FUNCTIONS.length + ' respondem');
  } else {
    aviso(respondendo + ' de ' + FUNCTIONS.length + ' confirmadas',
      'as demais não deram resposta conclusiva');
  }
}

/* ─── 5b. RTDN: diagnóstico do deploy, sem precisar do segredo ───────────── */
/*
 * A play-rtdn é o caminho de cancelamento, revogação e estorno. Ela tem um
 * modo de falhar que não aparece em lugar nenhum: se o deploy for SEM
 * --no-verify-jwt, o gateway do Supabase recusa o push do Pub/Sub com 401
 * ANTES de a função rodar. O Google vai reentregar, desistir, e o entitlement
 * nunca é reconciliado — sem um único erro no seu log, porque o seu código
 * nunca foi chamado.
 *
 * O status de uma requisição SEM Authorization separa os casos:
 *   401 → verificação de JWT ligada: o Pub/Sub nunca vai passar
 *   404 → não deployada
 *   503 → deployada, mas sem PLAY_RTDN_SECRET nem PLAY_RTDN_SERVICE_ACCOUNT
 *   403 → deployada, sem JWT, com autenticação configurada  ← o esperado
 */
async function conferirRtdn(cred) {
  secao('5b. RTDN — deploy e autenticação');
  let res;
  try {
    /* Sem apikey e sem Authorization de propósito: é assim que o Pub/Sub
       chega, e é o que revela se o gateway está barrando antes da função. */
    res = await buscar(cred.url + '/functions/v1/play-rtdn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
  } catch (e) {
    inconclusivo('não deu para checar (' + e.message + ')');
    return;
  }

  if (res.status === 403) {
    ok('deployada sem verificação de JWT e com autenticação exigida',
      'é a configuração correta');
  } else if (res.status === 401) {
    falha('deployada COM verificação de JWT — o push do Pub/Sub é recusado antes '
      + 'de a função rodar',
      'npx supabase functions deploy play-rtdn --no-verify-jwt · o sintoma é '
      + 'cancelamento e estorno que nunca chegam, sem erro nenhum no seu log');
  } else if (res.status === 404) {
    falha('não deployada',
      'npx supabase functions deploy play-rtdn --no-verify-jwt');
  } else if (res.status === 503) {
    falha('deployada, mas sem nenhum mecanismo de autenticação configurado',
      'defina PLAY_RTDN_SERVICE_ACCOUNT (OIDC do Pub/Sub, recomendado) ou '
      + 'PLAY_RTDN_SECRET — hoje ela recusa tudo');
  } else if (res.status === 204 || res.status === 200) {
    falha('aceitou um POST sem autenticação nenhuma (HTTP ' + res.status + ')',
      'endpoint aberto que mexe em assinatura — confira PLAY_RTDN_SECRET/SERVICE_ACCOUNT');
  } else {
    inconclusivo('resposta inesperada (HTTP ' + res.status + ')',
      'esperado 403; veja a tabela em docs/deploy-billing-edge.md');
  }
}

/* ─── 6. Secrets do billing (achado 03) ──────────────────────────────────── */

function conferirSecrets() {
  secao('6. Secrets do billing (achado 03)');
  if (process.env.FP_SKIP_CLI === '1') {
    pulado('FP_SKIP_CLI=1');
    return;
  }
  let saida;
  try {
    saida = execFileSync('npx', ['--yes', 'supabase', 'secrets', 'list'], {
      cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 90000,
    });
  } catch (e) {
    aviso('não consegui rodar `supabase secrets list`',
      'faça login (npx supabase login) ou confira manualmente; use FP_SKIP_CLI=1 para pular');
    return;
  }

  const temSA = /GOOGLE_PLAY_SERVICE_ACCOUNT_JSON/.test(saida);
  const temSandbox = /PLAY_SANDBOX_ENABLED/.test(saida);
  const temPacote = /PLAY_PACKAGE_NAME/.test(saida);

  if (!temSA) {
    falha('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON ausente',
      'sem ele nenhuma compra real é verificada (as legítimas falham em 503) E o '
      + 'RTDN vira no-op: syncFromToken devolve "api-nao-configurada" e nenhum '
      + 'cancelamento ou estorno chega a revogar nada');
  } else {
    ok('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON presente');
  }

  if (temSandbox) {
    falha('PLAY_SANDBOX_ENABLED está definido em produção',
      'com ele ligado, qualquer token GPA.test.* vira 30 dias de Pro sem verificação: '
      + 'npx supabase secrets unset PLAY_SANDBOX_ENABLED');
  } else {
    ok('PLAY_SANDBOX_ENABLED ausente', 'é o correto para produção');
  }

  if (!temPacote) aviso('PLAY_PACKAGE_NAME ausente', 'cai no padrão com.financaspro.mobile');
}

/* ─── 7. assetlinks: a impressão certa é a do Play, não a de upload ──────── */
/*
 * Esta é a que falha calada. O Play reassina o AAB com a chave DELE; se o
 * assetlinks publicar a impressão do keystore de upload, o deep link
 * autoVerify simplesmente não verifica, em todos os aparelhos, sem erro
 * nenhum em lugar nenhum.
 *
 * Não preciso saber qual é a impressão do Play para pegar o erro: basta
 * comparar com a do keystore de upload, que está aqui. Se forem IGUAIS, está
 * errado — e isso o script decide sozinho.
 */
function impressaoDoKeystore() {
  const jks = path.join(RAIZ, 'financaspro-upload.jks');
  if (!fs.existsSync(jks)) return null;
  const senha = process.env.FP_KEYSTORE_PASS;
  if (!senha) return null;
  try {
    const saida = execFileSync('keytool', [
      '-list', '-v', '-keystore', jks, '-storepass', senha,
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 });
    const m = saida.match(/SHA256:\s*([A-F0-9:]{95})/i);
    return m ? m[1].toUpperCase() : null;
  } catch (e) {
    return null;
  }
}

async function conferirAssetlinks() {
  secao('7. assetlinks.json publicado');
  let publicado;
  try {
    const res = await buscar(APP_URL + '/.well-known/assetlinks.json');
    if (!res.ok) {
      falha('não está no ar (HTTP ' + res.status + ') em ' + APP_URL,
        'sem ele o deep link autoVerify falha em silêncio em todos os aparelhos');
      return;
    }
    publicado = await res.json();
  } catch (e) {
    inconclusivo('não consegui buscar em ' + APP_URL + ': ' + e.message,
      'sem resposta não dá para dizer nada — nem que está certo, nem que está errado');
    return;
  }

  const alvo = (publicado || []).find(function(e) {
    return e && e.target && e.target.package_name === 'com.financaspro.mobile';
  });
  if (!alvo) {
    falha('nenhuma entrada para com.financaspro.mobile',
      'confira o arquivo publicado contra .well-known/assetlinks.json do repositório');
    return;
  }
  const impressoes = (alvo.target.sha256_cert_fingerprints || []).map(function(f) {
    return String(f).toUpperCase();
  });
  if (!impressoes.length) {
    falha('a entrada não tem sha256_cert_fingerprints');
    return;
  }
  ok('publicado, com ' + impressoes.length + ' impressão(ões)');

  const daUpload = impressaoDoKeystore();
  if (!daUpload) {
    aviso('não comparei com o keystore de upload',
      'defina FP_KEYSTORE_PASS para eu conferir sozinho; senão, compare à mão com '
      + 'Play Console → Integridade do app → chave de assinatura do app');
    impressoes.forEach(function(f) { console.log('    \x1b[2m' + f + '\x1b[0m'); });
    return;
  }

  if (impressoes.length === 1 && impressoes[0] === daUpload) {
    falha('a impressão publicada é a do keystore de UPLOAD',
      'o Play reassina o AAB com outra chave — publique a de '
      + 'Play Console → Integridade do app → chave de assinatura do app');
  } else if (impressoes.indexOf(daUpload) >= 0) {
    ok('inclui a de upload e mais outra', 'combinação normal quando se aceita os dois canais');
  } else {
    ok('não é a de upload', 'consistente com a chave do Play App Signing');
  }
}

/* ─── 8. Política de privacidade (exigência do Play) ─────────────────────── */

async function conferirPrivacidade() {
  secao('8. Política de privacidade pública');
  try {
    const res = await buscar(APP_URL + '/privacidade.html');
    if (!res.ok) {
      falha('não está no ar (HTTP ' + res.status + ')',
        'o Play exige, para app com cadastro, um caminho de exclusão acessível SEM instalar o app');
      return;
    }
    const html = await res.text();
    if (!/id=["']exclusao-de-conta["']/.test(html)) {
      falha('a âncora #exclusao-de-conta não existe na página publicada',
        'é a URL que vai no Play Console; sem a âncora ela cai no topo do documento');
    } else {
      ok('no ar, com a âncora #exclusao-de-conta');
    }
    if (/Open Finance[\s\S]{0,200}dispon/i.test(html) && !/ainda n[ãa]o dispon/i.test(html)) {
      aviso('a versão publicada ainda descreve o Open Finance como disponível',
        'republique a página — o repositório já tem o texto corrigido (achado 15)');
    }
  } catch (e) {
    inconclusivo('não consegui buscar: ' + e.message,
      'sem resposta não dá para dizer nada — nem que está certo, nem que está errado');
  }
}

/* ─── 1. Local: versão alinhada e build fresco ───────────────────────────── */

function conferirLocal() {
  secao('1. Build local');
  try {
    execFileSync(process.execPath, [path.join(RAIZ, 'scripts/check-version-alignment.cjs')],
      { cwd: RAIZ, stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 });
    ok('versão alinhada entre package, config, gradle e cache do sw');
  } catch (e) {
    falha('versões desalinhadas', 'node scripts/check-version-alignment.cjs');
  }

  const distSw = path.join(RAIZ, 'dist', 'sw.js');
  if (!fs.existsSync(distSw)) {
    falha('dist/ não existe', 'npm run build antes de gerar o AAB');
    return;
  }
  const tDist = fs.statSync(distSw).mtimeMs;
  let maisRecente = 0;
  let culpado = '';
  ['js', 'css', 'index.html'].forEach(function(alvo) {
    const p = path.join(RAIZ, alvo);
    if (!fs.existsSync(p)) return;
    (function varrer(f) {
      const st = fs.statSync(f);
      if (st.isDirectory()) fs.readdirSync(f).forEach(function(n) { varrer(path.join(f, n)); });
      else if (st.mtimeMs > maisRecente) { maisRecente = st.mtimeMs; culpado = path.relative(RAIZ, f); }
    })(p);
  });
  if (maisRecente > tDist) {
    falha('dist/ está mais antigo que o código-fonte (' + culpado + ')',
      'npm run build — senão o AAB sai com o bundle anterior');
  } else {
    ok('dist/ está na frente do código-fonte');
  }
}

/* ─── Fecho ──────────────────────────────────────────────────────────────── */

async function main() {
  console.log('\n\x1b[1mFinançasPro — checagem pré-beta\x1b[0m');
  console.log('\x1b[2mOrigem pública: ' + APP_URL + '\x1b[0m');

  let cred;
  try {
    cred = lerCredenciaisDoApp();
    console.log('\x1b[2mProjeto Supabase: ' + cred.url + '\x1b[0m');
  } catch (e) {
    console.error('\n\x1b[31m' + e.message + '\x1b[0m');
    process.exit(2);
  }

  conferirLocal();

  secao('2. Alcance do servidor');
  const alcance = await servidorResponde(cred);
  if (alcance.ok) {
    ok('o projeto Supabase responde');
    await conferirLimites(cred);
    await conferirRls(cred);
    await conferirFunctions(cred);
    await conferirRtdn(cred);
  } else {
    inconclusivo('o projeto Supabase não respondeu (' + alcance.detalhe + ')',
      'as seções 3 a 5 ficaram SEM VERIFICAR — não são um "ok". Rode de uma '
      + 'máquina com acesso à internet e ao projeto.');
  }

  conferirSecrets();
  await conferirAssetlinks();
  await conferirPrivacidade();

  const falhas = achados.filter(function(a) { return a.nivel === 'falha'; });
  const avisos = achados.filter(function(a) { return a.nivel === 'aviso'; });
  const cegos = achados.filter(function(a) { return a.nivel === 'inconclusivo'; });

  console.log('\n' + '─'.repeat(64));

  if (falhas.length) {
    console.log('\x1b[31m\x1b[1m' + falhas.length + ' item(ns) impedem o beta:\x1b[0m');
    falhas.forEach(function(a, i) {
      console.log('  ' + (i + 1) + '. [' + a.secao.replace(/^\d+\.\s*/, '') + '] ' + a.msg);
    });
  }
  if (cegos.length) {
    console.log('\x1b[35m' + cegos.length + ' item(ns) NÃO PUDERAM ser verificados '
      + '— isto não é aprovação:\x1b[0m');
    cegos.forEach(function(a, i) {
      console.log('  ' + (i + 1) + '. [' + a.secao.replace(/^\d+\.\s*/, '') + '] ' + a.msg);
    });
  }
  if (avisos.length) {
    console.log('\x1b[33m' + avisos.length + ' aviso(s) — não bloqueiam, mas valem um olhar.\x1b[0m');
  }

  if (!falhas.length && !cegos.length && !avisos.length) {
    console.log('\x1b[32m\x1b[1mTudo conferido. Pode abrir a faixa de testes.\x1b[0m\n');
    return;
  }
  console.log('');

  /* Códigos distintos de propósito: 1 é "achei problema", 2 é "não consegui
     olhar". Confundir os dois num CI é como o script começou errado. */
  if (falhas.length) process.exit(1);
  if (cegos.length) process.exit(2);
}

main().catch(function(e) {
  console.error('\n\x1b[31mErro inesperado: ' + (e && e.stack || e) + '\x1b[0m');
  process.exit(2);
});
