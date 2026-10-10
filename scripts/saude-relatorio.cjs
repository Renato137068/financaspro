#!/usr/bin/env node
/**
 * saude-relatorio.cjs — painel de saúde do app, lido do schema `saude`.
 *
 * O schema fica fora da API do Supabase (migração 20260930120000): este
 * script lê por conexão direta, com psql, e monta um relatório em Markdown:
 *   • por versão (últimos 30 dias): sessões, erros e erros por 1.000 sessões;
 *   • os erros mais frequentes dos últimos 7 dias (mensagem, onde, pilha);
 *   • funil de nuvem das últimas semanas de cadastro.
 *
 * E decide os alertas (listarAlertas), cada um com o título da sua issue:
 *   • a versão mais nova com uso suficiente piorou em relação à anterior;
 *   • ela passa de TETO erros por 1.000 sessões (pega a primeira versão, que
 *     não tem anterior para comparar);
 *   • os avisos de uso pararam de chegar (função fora do ar, app quebrado
 *     antes do boot, CSP bloqueando): sem isto, "sem erros" e "sem dados"
 *     ficam iguais no painel;
 *   • um erro novo, que não existia antes da janela, já se repetiu bastante.
 * O workflow .github/workflows/saude.yml roda isto todo dia.
 *
 *   SAUDE_DATABASE_URL=postgresql://... node scripts/saude-relatorio.cjs
 *     [--saida relatorio.md]   grava o relatório (senão, só stdout)
 *     [--alertas alertas.txt]  grava um título de issue por linha
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
// Acima disto (por mil sessões) a versão está ruim mesmo sem anterior pior.
const TETO = 20;
// Dias sem nenhum aviso de uso, depois de já ter havido, até alertar.
const DIAS_SEM_SESSAO = 2;
// Um erro novo vira alerta com isto de ocorrências em 7 dias (no máximo
// MAX_ERROS_NOVOS issues por dia, para não inundar o repositório).
const MIN_ERRO_NOVO = 10;
const MAX_ERROS_NOVOS = 3;
const TOP_ERROS = 10;

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

function diasEntre(de, ate) {
  return Math.round((Date.parse(String(ate).slice(0, 10)) - Date.parse(String(de).slice(0, 10))) / 86_400_000);
}

/** Texto de usuário em título de issue: uma linha, sem crase nem aspas. */
function limparTitulo(t) {
  return String(t || '').replace(/[\r\n`"]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 70);
}

/**
 * @param {object} dados
 * @param {Array} dados.resumo            saude.versao_resumo
 * @param {Array} [dados.erros]           saude.erros_frequentes
 * @param {string|null} [dados.ultimoDiaComSessao]  AAAA-MM-DD
 * @param {string} [dados.hoje]           AAAA-MM-DD (UTC)
 * @returns {Array<{titulo:string, motivo:string}>}
 */
function listarAlertas(dados) {
  const d = dados || {};
  const hoje = d.hoje || new Date().toISOString().slice(0, 10);
  const alertas = [];

  const regressao = decidirAlerta(d.resumo);
  if (regressao.alerta) {
    alertas.push({
      titulo: 'Saúde: v' + regressao.nova.app_version + ' com mais erros por sessão que a versão anterior',
      motivo: regressao.motivo,
    });
  }

  const comUso = (d.resumo || [])
    .filter((v) => /^\d+\.\d+\.\d+$/.test(v.app_version) && Number(v.sessoes) >= MIN_SESSOES)
    .sort((a, b) => compararVersao(b.app_version, a.app_version));
  const nova = comUso[0];
  if (!regressao.alerta && nova && Number(nova.erros_por_mil) > TETO) {
    alertas.push({
      titulo: 'Saúde: v' + nova.app_version + ' com mais de ' + TETO + ' erros por 1.000 sessões',
      motivo: 'v' + nova.app_version + ': ' + nova.erros_por_mil + ' erros/mil sessões (teto ' + TETO + ')',
    });
  }

  if (d.ultimoDiaComSessao && diasEntre(d.ultimoDiaComSessao, hoje) >= DIAS_SEM_SESSAO) {
    alertas.push({
      titulo: 'Saúde: os avisos de uso pararam de chegar',
      motivo: 'último aviso de uso em ' + d.ultimoDiaComSessao + ' (' + diasEntre(d.ultimoDiaComSessao, hoje)
        + ' dias). Confira a função obs-ingest e se o app abre.',
    });
  }

  // Erro "novo" só faz sentido com histórico de antes da janela de 7 dias.
  const primeiroDia = (d.resumo || []).map((v) => String(v.primeiro_dia || '')).filter(Boolean).sort()[0];
  const temHistorico = primeiroDia && diasEntre(primeiroDia, hoje) > 7;
  if (temHistorico) {
    (d.erros || [])
      .filter((e) => e.novo && Number(e.ocorrencias) >= MIN_ERRO_NOVO)
      .sort((a, b) => Number(b.ocorrencias) - Number(a.ocorrencias))
      .slice(0, MAX_ERROS_NOVOS)
      .forEach((e) => {
        alertas.push({
          titulo: limparTitulo('Saúde: erro novo — ' + e.message),
          motivo: 'erro novo na v' + e.app_version + ' (' + (e.onde || 'sem contexto') + '): '
            + e.ocorrencias + ' vezes em 7 dias',
        });
      });
  }
  return alertas;
}

/** Célula de tabela Markdown: uma linha, sem quebrar a tabela. */
function celula(v) {
  return String(v === null || v === undefined || v === '' ? '—' : v).replace(/[\r\n]+/g, ' ').replace(/\|/g, '\\|');
}

function numero(v) {
  return v === null || v === undefined ? '—' : String(v);
}

function montarRelatorio(resumo, funil, decisao, extra) {
  const x = extra || {};
  const linhas = ['# Saúde do FinançasPro', ''];
  const outros = (x.alertas || []).filter((a) => !decisao.alerta || a.motivo !== decisao.motivo);
  linhas.push(decisao.alerta ? '**⚠️ Alerta:** ' + decisao.motivo
    : (outros.length ? 'Sem piora entre versões — ' : 'Sem alerta — ') + decisao.motivo, '');
  outros.forEach((a) => {
    linhas.push('**⚠️ Alerta:** ' + a.motivo, '');
  });
  if (x.ultimoDiaComSessao === null) {
    linhas.push('Nenhum aviso de uso registrado ainda: a telemetria não está ligada em produção'
      + ' (docs/release/ligar-operacao.md, passos 2 e 3).', '');
  }
  linhas.push('## Por versão (últimos 30 dias)', '');
  linhas.push('| Versão | Sessões | Erros | Erros / 1.000 sessões | De | Até |');
  linhas.push('|---|---:|---:|---:|---|---|');
  [...(resumo || [])].sort((a, b) => compararVersao(b.app_version, a.app_version)).forEach((v) => {
    linhas.push('| ' + [v.app_version, numero(v.sessoes), numero(v.erros), numero(v.erros_por_mil),
      numero(v.primeiro_dia), numero(v.ultimo_dia)].join(' | ') + ' |');
  });
  if (!resumo || !resumo.length) linhas.push('| — | — | — | — | — | — |');
  linhas.push('', 'Versões com menos de ' + MIN_SESSOES + ' sessões ficam de fora do alerta.', '');
  if (x.erros) {
    linhas.push('## Erros mais frequentes (últimos 7 dias)', '');
    linhas.push('| Versão | Ocorrências | Mensagem | Onde | Pilha | Última vez |');
    linhas.push('|---|---:|---|---|---|---|');
    [...x.erros].sort((a, b) => Number(b.ocorrencias) - Number(a.ocorrencias)).slice(0, TOP_ERROS).forEach((e) => {
      linhas.push('| ' + [celula(e.app_version), celula(e.ocorrencias), celula((e.novo ? '🆕 ' : '') + e.message),
        celula(e.onde), celula(e.pilha && String(e.pilha).trim().slice(0, 120)), celula(String(e.ultima || '').slice(0, 16))].join(' | ') + ' |');
    });
    if (!x.erros.length) linhas.push('| — | — | — | — | — | — |');
    linhas.push('');
  }
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
  const dia = consultar(url, 'select max(dia)::text as dia from saude.versao_diaria where sessoes > 0');
  const ultimoDiaComSessao = (dia[0] && dia[0].dia) || null;
  let erros;
  try {
    erros = consultar(url, 'select * from saude.erros_frequentes order by ocorrencias desc limit 50');
  } catch (e) {
    // Migração 20261006120000 ainda não aplicada (ou papel sem SELECT nela).
    console.error('[saude] erros_frequentes indisponível: ' + e.message);
  }
  const decisao = decidirAlerta(resumo);
  const alertas = listarAlertas({ resumo, erros, ultimoDiaComSessao });
  const texto = montarRelatorio(resumo, funil, decisao, { erros, alertas, ultimoDiaComSessao });
  process.stdout.write(texto + '\n');

  const i = argv.indexOf('--saida');
  if (i !== -1 && argv[i + 1]) fs.writeFileSync(argv[i + 1], texto + '\n');
  const j = argv.indexOf('--alertas');
  if (j !== -1 && argv[j + 1]) fs.writeFileSync(argv[j + 1], alertas.map((a) => a.titulo).join('\n') + '\n');
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, texto + '\n');
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, 'alerta=' + (alertas.length > 0) + '\n');
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

module.exports = {
  decidirAlerta, listarAlertas, montarRelatorio, compararVersao, MIN_SESSOES, FATOR, FOLGA, TETO,
  DIAS_SEM_SESSAO, MIN_ERRO_NOVO, MAX_ERROS_NOVOS,
};
