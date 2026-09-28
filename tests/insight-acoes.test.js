/**
 * insight-acoes.test.js — botões de insight e alerta do dashboard.
 *
 * Saíram do INIT_CONFIG (Perfil, agora sob demanda) para o bundle principal.
 * Dois defeitos corrigidos na mudança: "abrir paywall" não fazia nada sem o
 * chunk 'conta', e "criar orçamento" focava o campo antes de a tela existir.
 */
const { carregarScript, viaGlobal } = require('./helpers/carregar-script.cjs');

let IA;
let chamadas;

beforeEach(() => {
  chamadas = [];
  document.body.innerHTML = '';
  global.mudarAba = (aba, opts) => chamadas.push(['mudarAba', aba, opts || null]);
  global.setFiltroCat = (cat) => chamadas.push(['setFiltroCat', cat]);
  global.UTILS = {
    mostrarToast: (msg, tipo) => chamadas.push(['toast', tipo, msg]),
    labelCategoria: (c) => c,
    dataLocalIso: () => '2026-09-27',
  };
  delete global.INIT_BILLING;
  delete global.INSIGHTS;
  global.INIT_NAVIGATION = {
    carregarChunkConta: (cb) => {
      chamadas.push(['chunk', 'conta']);
      global.INIT_BILLING = { abrirPaywall: (m) => chamadas.push(['paywall', m]) };
      cb();
    },
    carregarChunkOrcamento: (cb) => {
      chamadas.push(['chunk', 'orcamento']);
      document.body.innerHTML = '<input id="limit-lazer">';
      cb();
    },
  };
  // Os dublês substituem os imports do módulo. INIT_NAVIGATION e mudarAba
  // repassam ao global na hora da chamada: cada teste troca o que está lá.
  IA = carregarScript('js/modules/insight-acoes.js', Object.assign({
    UTILS: global.UTILS,
    mudarAba: (...args) => global.mudarAba(...args),
  }, viaGlobal('INIT_NAVIGATION')));
});

afterEach(() => {
  ['mudarAba', 'setFiltroCat', 'INIT_NAVIGATION', 'INIT_BILLING', 'DADOS', 'ORCAMENTO'].forEach((k) => delete global[k]);
  jest.useRealTimers();
});

function botao(acao, attrs, params) {
  const b = document.createElement('button');
  b.setAttribute('data-insight-action', acao);
  Object.entries(attrs || {}).forEach(([k, v]) => b.setAttribute(k, v));
  if (params) b.setAttribute('data-insight-params', JSON.stringify(params));
  document.body.appendChild(b);
  return b;
}

describe('INSIGHT_ACOES', () => {
  test('abrirPaywall pede o chunk "conta" quando o paywall ainda não carregou', () => {
    IA.handle('abrirPaywall', botao('abrirPaywall'), { message: 'R$ 89 em assinaturas esquecidas' });
    expect(chamadas).toEqual([
      ['chunk', 'conta'],
      ['paywall', 'R$ 89 em assinaturas esquecidas'],
    ]);
  });

  test('criar-orcamento foca o limite só depois de a tela do Orçamento existir', () => {
    jest.useFakeTimers();
    IA.handle('criar-orcamento', botao('criar-orcamento', { 'data-cat': 'lazer' }), {});
    jest.advanceTimersByTime(150);
    expect(chamadas.slice(0, 2)).toEqual([['mudarAba', 'orcamento', null], ['chunk', 'orcamento']]);
    expect(document.activeElement.id).toBe('limit-lazer');
  });

  test('filtrar-categoria abre o Extrato e aplica o filtro pelo wrapper global', () => {
    jest.useFakeTimers();
    IA.handle('filtrar-categoria', botao('filtrar-categoria', { 'data-cat': 'transporte' }), {});
    jest.advanceTimersByTime(150);
    expect(chamadas).toEqual([['mudarAba', 'extrato', null], ['setFiltroCat', 'transporte']]);
  });

  test('irParaMetas leva à sub-aba de metas', () => {
    IA.handle('irParaMetas', botao('irParaMetas'), {});
    expect(chamadas).toEqual([['mudarAba', 'orcamento', { orcSub: 'metas' }]]);
  });

  test('marcarRecorrente grava a recorrência com os parâmetros do insight', () => {
    const salvos = [];
    global.DADOS = { salvarRecorrente: (r) => salvos.push(r) };
    IA.executar('marcarRecorrente', { descricao: 'Netflix', valor: '55.9', categoria: 'assinaturas' });
    expect(salvos).toEqual([expect.objectContaining({
      descricao: 'Netflix', valor: 55.9, categoria: 'assinaturas', frequencia: 'mensal',
      tipo: 'despesa', dataInicio: '2026-09-27', ativo: true,
    })]);
  });

  test('aumentarLimite com falha avisa em vez de estourar', () => {
    global.ORCAMENTO = { definirLimite: () => { throw new Error('x'); } };
    IA.executar('aumentarLimite', { categoria: 'lazer', novoLimite: 300 });
    expect(chamadas).toEqual([['toast', 'error', 'Não foi possível atualizar o limite. Tente de novo.']]);
  });

  test('um clique num [data-insight-action] chega ao handle, com parâmetros JSON', () => {
    IA.init();
    IA.init(); // idempotente: um listener só
    const b = botao('irParaMetas');
    b.click();
    expect(chamadas).toEqual([['mudarAba', 'orcamento', { orcSub: 'metas' }]]);
  });
});
