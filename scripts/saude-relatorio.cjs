#!/usr/bin/env node
/**
 * saude-relatorio.cjs — painel de saúde do app, lido do schema `saude`.
 *
 * O schema fica fora da API do Supabase (migração 20260930120000): este
 * script lê por conexão direta, com psql, e monta um relatório em Markdown:
 *   • por versão (últimos 30 dias): sessões, erros e erros por 1.000 sessões;
 *   • funil de nuvem das últimas semanas de cadastro.
 *
 * E decide o alerta: a versão mais nova com uso suficiente tem erros por
 * 1.000 sessões bem acima da anterior? O workflow .github/workflows/saude.yml
 * roda isto todo dia e abre uma issue quando sim.
 *
 *   SAUDE_DATABASE_URL=postgresql://... node scripts/saude-relatorio.cjs
 *     [--saida relatorio.md]   grava o relatório (senão, só stdout)
 *
 * Sai com 0 mesmo com alerta: quem decide abrir a issue é o workflow, pela
 * linha "alerta=true" em $GITHUB_OUTPUT.
 */
const fs = require('fs');
const { spawnSync } = require('child_process');

// Menos que isto e um único aparelho com problema vira "a versão piorou".
const MIN_SESSOES = 200;
// Alerta quando a nova passa de FATOR × a anterior + FOLGA (por mil): o fator
// pega piora relativa; a folga evita alarme em 1 → 2 erros por mil.
const FATOR = 1.5;
const FOLGA = 2;
const SEMANAS_FUNIL = 8;

function compararVersao(a, b) {
  const x = String(a).split('.').map(Number);
  const y = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  return 0;
}

/**
 * @param {Array<{app_version:string, sessoes:number, erros:number, erros_por_mil:number|null}>} resumo
 * @returns {{alerta:boolean, motivo:string, nova?:object, anterior?:object, limite?:number}}
 */
function decidirAlerta(resumo, opts) {
  const o = Object.assign({ minSessoes: MIN_SESSOES, fator: FATOR, folga: FOLGA }, opts || {});
  const comUso = (resumo || [])
    .filter((v) => /^\d+\.\d+\.\d+$/.test(v.app_version) && Number(v.sessoes) >= o.minSessoes)
    .sort((a, b) => compararVersao(b.app_version, a.app_version));
  if (comUso.length < 2) {
    return { alerta: false, motivo: 'menos de duas versões com ' + o.minSessoes + '+ sessões — nada a comparar' };
  }
  const [nova, anterior] = comUso;
  const taxa = (v) => Number(v.erros_por_mil) || 0;
  const limite = Math.round((taxa(anterior) * o.fator + o.folga) * 10) / 10;
  const alerta = taxa(nova) > limite;
  return {
    alerta,
    nova,
    anterior,
    limite,
    motivo: 'v' + nova.app_version + ': ' + taxa(nova) + ' erros/mil sessões; v' + anterior.app_version + ': '
      + taxa(anterior) + ' (limite ' + limite + ')',
  };
}

function numero(v) {
  return v === null || v === undefined ? '—' : String(v);
}

function montarRelatorio(resumo, funil, decisao) {
  const linhas = ['# Saúde do FinançasPro', ''];
  linhas.push(decisao.alerta ? '**⚠️ Alerta:** ' + decisao.motivo : 'Sem alerta — ' + decisao.motivo, '');
  linhas.push('## Por versão (últimos 30 dias)', '');
  linhas.push('| Versão | Sessões | Erros | Erros / 1.000 sessões | De | Até |');
  linhas.push('|---|---:|---:|---:|---|---|');
  [...(resumo || [])].sort((a, b) => compararVersao(b.app_version, a.app_version)).forEach((v) => {
    linhas.push('| ' + [v.app_version, numero(v.sessoes), numero(v.erros), numero(v.erros_por_mil),
      numero(v.primeiro_dia), numero(v.ultimo_dia)].join(' | ') + ' |');
  });
  if (!resumo || !resumo.length) linhas.push('| — | — | — | — | — | — |');
  linhas.push('', 'Versões com menos de ' + MIN_SESSOES + ' sessões ficam de fora do alerta.', '');
  linhas.push('## Funil de nuvem (por semana de cadastro)', '');
  linhas.push('| Semana | Contas | Lançaram | Ativas no 30º dia | Trial | Assinantes |');
  linhas.push('|---|---:|---:|---:|---:|---:|');
  (funil || []).forEach((f) => {
    linhas.push('| ' + [f.semana, numero(f.contas), numero(f.com_lancamento), numero(f.ativos_d30),
      numero(f.com_trial), numero(f.assinantes)].join(' | ') + ' |');
  });
  if (!funil || !funil.length) linhas.push('| — | — | — | — | — | — |');
  linhas.push('', '"Ativas no 30º dia" fica — até a semana completar 30 dias.', '');
  return linhas.join('\n');
}

function consultar(url, sql) {
  const r = spawnSync('psql', ['-X', '-tA', '-v', 'ON_ERROR_STOP=1', '-c',
    'select coalesce(json_agg(r), \'[]\') from (' + sql + ') r', url], { encoding: 'utf8' });
  if (r.error) throw new Error('psql não encontrado: ' + r.error.message);
  if (r.status !== 0) throw new Error('consulta falhou: ' + (r.stderr || '').trim());
  return JSON.parse(r.stdout.trim() || '[]');
}

function main(argv) {
  const url = process.env.SAUDE_DATABASE_URL;
  if (!url) {
    console.error('[saude] defina SAUDE_DATABASE_URL (conexão direta ao Postgres do Supabase, só leitura basta)');
    return 1;
  }
  const resumo = consultar(url, 'select * from saude.versao_resumo');
  const funil = consultar(url, 'select * from saude.funil_nuvem order by semana desc limit ' + SEMANAS_FUNIL);
  const decisao = decidirAlerta(resumo);
  const texto = montarRelatorio(resumo, funil, decisao);
  process.stdout.write(texto + '\n');

  const i = argv.indexOf('--saida');
  if (i !== -1 && argv[i + 1]) fs.writeFileSync(argv[i + 1], texto + '\n');
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, texto + '\n');
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, 'alerta=' + decisao.alerta + '\n'
      + (decisao.alerta ? 'versao=' + decisao.nova.app_version + '\n' : ''));
  }
  return 0;
}

if (require.main === module) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (e) {
    console.error('[saude] ' + e.message);
    process.exit(1);
  }
}

module.exports = { decidirAlerta, montarRelatorio, compararVersao, MIN_SESSOES, FATOR, FOLGA };
