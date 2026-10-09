#!/usr/bin/env node
/**
 * vitals-relatorio.cjs — taxa de travamentos e de ANR pela Play.
 *
 * O Google já mede travamentos nativos e "app não responde" (Android vitals)
 * sem configuração nenhuma, mas só quem abre o Play Console vê. Este script lê
 * as duas taxas pela Play Developer Reporting API e sinaliza alerta quando a
 * média de 7 dias passa do limite de "mau comportamento" da Play, que derruba
 * a visibilidade do app na loja (achado 8 da auditoria de operação de 06/10).
 *
 *   node scripts/vitals-relatorio.cjs --saida vitals.md
 *
 * Usa a mesma conta de serviço da ficha (PLAY_SERVICE_ACCOUNT_JSON). Fica
 * inerte, com um aviso e saída 0, até alguém:
 *   1. ativar a "Google Play Developer Reporting API" no projeto do Google
 *      Cloud dessa conta de serviço;
 *   2. dar a ela a permissão "Ver informações do app" no Play Console.
 * Escreve `alerta=true|false` em $GITHUB_OUTPUT (workflow vitals.yml).
 */
const fs = require('fs');
const { contaDeServico, token } = require('./lib/google-conta-servico.cjs');

const PACOTE = 'com.financaspro.mobile';
const API = 'https://playdeveloperreporting.googleapis.com/v1beta1/apps/' + PACOTE;
const ESCOPO = 'https://www.googleapis.com/auth/playdeveloperreporting';

/** Limites de "mau comportamento" da Play (taxa percebida pelo usuário). */
const METRICAS = [
  { conjunto: 'crashRateMetricSet', metrica: 'userPerceivedCrashRate7dUserWeighted', nome: 'Travamentos', limite: 0.0109 },
  { conjunto: 'anrRateMetricSet', metrica: 'userPerceivedAnrRate7dUserWeighted', nome: 'App não responde (ANR)', limite: 0.0047 },
];

const pct = (v) => (v * 100).toFixed(2).replace('.', ',') + '%';
const dataTxt = (d) => String(d.day).padStart(2, '0') + '/' + String(d.month).padStart(2, '0') + '/' + d.year;

/** Dia (DateTime da API) menos n dias, mantendo o fuso. */
function diasAntes(d, n) {
  const t = new Date(Date.UTC(d.year, d.month - 1, d.day));
  t.setUTCDate(t.getUTCDate() - n);
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate(), timeZone: d.timeZone };
}

/** Valor da métrica numa linha da resposta de :query, ou null. */
function valorDaLinha(linha, metrica) {
  const m = (linha.metrics || []).find((x) => x.metric === metrica);
  if (!m || !m.decimalValue || m.decimalValue.value === undefined) return null;
  const v = Number(m.decimalValue.value);
  return Number.isFinite(v) ? v : null;
}

/**
 * Série diária → situação. A última linha com valor é a média de 7 dias mais
 * recente; acima do limite vira alerta.
 */
function avaliar(def, linhas) {
  const serie = (linhas || [])
    .map((l) => ({ dia: l.startTime, valor: valorDaLinha(l, def.metrica) }))
    .filter((p) => p.valor !== null);
  const ultimo = serie.length ? serie[serie.length - 1] : null;
  return {
    nome: def.nome,
    limite: def.limite,
    serie: serie,
    atual: ultimo ? ultimo.valor : null,
    alerta: !!ultimo && ultimo.valor > def.limite,
  };
}

function relatorioMd(resultados) {
  const linhas = ['# Android vitals', ''];
  const alertas = resultados.filter((r) => r.alerta);
  linhas.push(alertas.length
    ? '**Acima do limite da Play:** ' + alertas.map((r) => r.nome).join(' e ') + '. Acima disso a Play reduz a visibilidade do app na loja; os detalhes por aparelho e versão estão no Play Console › Qualidade › Android vitals.'
    : 'Tudo abaixo dos limites de mau comportamento da Play.');
  linhas.push('', '| Métrica | Média de 7 dias | Limite da Play |', '|---|---|---|');
  for (const r of resultados) {
    linhas.push('| ' + r.nome + ' | ' + (r.atual === null ? 'sem dados' : pct(r.atual)) + (r.alerta ? ' ⚠️' : '') + ' | ' + pct(r.limite) + ' |');
  }
  for (const r of resultados) {
    if (!r.serie.length) continue;
    linhas.push('', '**' + r.nome + ', dia a dia (média móvel de 7 dias):** ' +
      r.serie.map((p) => dataTxt(p.dia) + ' ' + pct(p.valor)).join(' · '));
  }
  return linhas.join('\n') + '\n';
}

async function chamar(tk, metodo, url, corpo) {
  const res = await fetch(url, {
    method: metodo,
    headers: Object.assign({ Authorization: 'Bearer ' + tk }, corpo ? { 'Content-Type': 'application/json' } : {}),
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const txt = await res.text();
  if (!res.ok) {
    let msg = txt;
    try { msg = JSON.parse(txt).error.message; } catch (_) { /* resposta não-JSON */ }
    const e = new Error(metodo + ' ' + url.replace(API, '') + ' → ' + res.status + ': ' + String(msg).slice(0, 300));
    e.status = res.status;
    throw e;
  }
  return txt ? JSON.parse(txt) : {};
}

async function consultar(tk, def) {
  const meta = await chamar(tk, 'GET', API + '/' + def.conjunto);
  const fresco = ((meta.freshnessInfo || {}).freshnesses || []).find((f) => f.aggregationPeriod === 'DAILY');
  if (!fresco || !fresco.latestEndTime) return avaliar(def, []);
  const fim = fresco.latestEndTime;
  const r = await chamar(tk, 'POST', API + '/' + def.conjunto + ':query', {
    timelineSpec: { aggregationPeriod: 'DAILY', startTime: diasAntes(fim, 7), endTime: fim },
    metrics: [def.metrica],
  });
  const linhas = (r.rows || []).slice().sort((a, b) =>
    (a.startTime.year - b.startTime.year) || (a.startTime.month - b.startTime.month) || (a.startTime.day - b.startTime.day));
  return avaliar(def, linhas);
}

function saidaGithub(chave, valor) {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, chave + '=' + valor + '\n');
}

async function main(argv) {
  const i = argv.indexOf('--saida');
  const saida = i >= 0 ? argv[i + 1] : null;
  saidaGithub('alerta', 'false');

  if (!(process.env.PLAY_SERVICE_ACCOUNT_JSON || '').trim()) {
    console.log('::notice::PLAY_SERVICE_ACCOUNT_JSON não configurado — Android vitals pulado');
    return;
  }
  const tk = await token(contaDeServico(), ESCOPO);
  let resultados;
  try {
    resultados = [];
    for (const def of METRICAS) resultados.push(await consultar(tk, def));
  } catch (e) {
    if (e.status === 403 || e.status === 404) {
      console.log('::warning::A Play recusou a leitura dos Android vitals (' + e.message + '). ' +
        'Ative a Google Play Developer Reporting API no projeto do Google Cloud da conta de serviço e ' +
        'dê a ela "Ver informações do app" no Play Console (docs/observabilidade/android-vitals.md).');
      return;
    }
    throw e;
  }
  const md = relatorioMd(resultados);
  process.stdout.write(md);
  if (saida) fs.writeFileSync(saida, md);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  saidaGithub('alerta', resultados.some((r) => r.alerta) ? 'true' : 'false');
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((e) => {
    console.error('[vitals]', e.message);
    process.exit(1);
  });
}

module.exports = { METRICAS, avaliar, relatorioMd, diasAntes };
