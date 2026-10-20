/**
 * health-replay.test.js — o replay da sessão e o diagnóstico (suporte).
 *
 * O HTML do replay sai do app para anexar a um ticket. Três coisas precisam
 * valer: o que a pessoa vê é o histórico da sessão (sem descrições de
 * lançamentos), nada do que o evento traz pode virar marcação na página
 * (escape), e sem eventos o app não gera arquivo vazio. O replay é um módulo
 * sob demanda (services/replay-sessao.js); o diagnóstico fica no healthService.
 */
const { carregarScript } = require('./helpers/carregar-script.cjs');

const UTILS = carregarScript('js/core/utils.js');

function carregarHealth(extras) {
  return carregarScript('js/services/healthService.js', Object.assign({
    UTILS: UTILS,
    SESSION_LOG: { snapshot: function() { return []; }, registrar: jest.fn() },
    PERSIST_QUEUE: {},
    FINANCE_RECONCILER: {},
    CONFIG_USER: {},
    INIT_MODALS: {},
    DADOS: { getTransacoes: function() { return []; } },
  }, extras || {}));
}

function carregarReplay(extras) {
  return carregarScript('js/services/replay-sessao.js', Object.assign({
    UTILS: UTILS,
    SESSION_LOG: { snapshot: function() { return []; }, registrar: jest.fn() },
    DADOS: { getTransacoes: function() { return []; } },
    INIT_MODALS: {},
  }, extras || {}));
}

describe('REPLAY_SESSAO — conteúdo do replay', function() {
  let R;
  beforeEach(function() {
    R = carregarReplay();
  });

  test('rótulos conhecidos e tipo desconhecido passa como está', function() {
    expect(R._rotuloEventoSessao('init_dados')).toBe('App iniciou');
    expect(R._rotuloEventoSessao('conflito_resolvido')).toBe('Conflito resolvido');
    expect(R._rotuloEventoSessao('evento_novo')).toBe('evento_novo');
  });

  test('detalhe: lançamentos, conflitos, eventos e backend', function() {
    expect(R._detalheEventoSessao({ detalhe: { qtd: 3 } })).toBe('3 lançamento(s)');
    expect(R._detalheEventoSessao({ detalhe: { conflitos: 1, total: 4 } })).toBe('1 conflito(s), 4 total');
    expect(R._detalheEventoSessao({ detalhe: { eventos: 9 } })).toBe('9 evento(s)');
    expect(R._detalheEventoSessao({ detalhe: { backend: 'indexeddb' } })).toBe('backend indexeddb');
    expect(R._detalheEventoSessao({})).toBe('');
    expect(R._detalheEventoSessao(null)).toBe('');
  });

  test('detalhe sem campo conhecido vira JSON, e JSON que não serializa vira vazio', function() {
    expect(R._detalheEventoSessao({ detalhe: { outro: 'x' } })).toBe('{"outro":"x"}');
    const circular = {}; circular.self = circular;
    expect(R._detalheEventoSessao({ detalhe: circular })).toBe('');
  });

  test('a lista mostra o mais recente primeiro e escapa o que vem do evento', function() {
    const html = R._montarListaReplayHtml([
      { tipo: 'init_dados', iso: '2026-10-20T10:00:00.000Z', detalhe: { qtd: 1 } },
      { tipo: '<img src=x onerror=alert(1)>', iso: '2026-10-20T11:00:00.000Z' },
    ]);
    expect(html.indexOf('11:00:00')).toBeLessThan(html.indexOf('10:00:00'));
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  test('o documento tem título, contagem de eventos e o aviso de que não há descrições', function() {
    const doc = R._montarDocumentoReplayHtml([{ tipo: 'init_dados', iso: '2026-10-20T10:00:00.000Z' }]);
    expect(doc.startsWith('<!doctype html>')).toBe(true);
    expect(doc).toContain('Replay da sessão');
    expect(doc).toContain('1 evento(s)');
    expect(doc).toContain('Sem descrições de lançamentos');
  });
});

describe('REPLAY_SESSAO — exportação', function() {
  test('sem eventos, não gera arquivo e avisa', function() {
    const toast = jest.fn();
    const R = carregarReplay({ UTILS: { mostrarToast: toast, escapeHtml: UTILS.escapeHtml } });
    expect(R.exportar()).toBeNull();
    expect(toast).toHaveBeenCalledWith('Nenhum evento nesta sessão ainda', 'info');
  });

  test('sem o log de sessão, não gera arquivo', function() {
    const toast = jest.fn();
    const R = carregarReplay({ UTILS: { mostrarToast: toast, escapeHtml: UTILS.escapeHtml }, SESSION_LOG: undefined });
    expect(R.exportar()).toBeNull();
    expect(toast).toHaveBeenCalledWith('Replay indisponível', 'error');
  });

  test('com eventos, baixa o HTML e registra a exportação', function() {
    const registrar = jest.fn();
    const clicks = [];
    global.Blob = function(partes) { this.partes = partes; };
    global.URL.createObjectURL = jest.fn(function() { return 'blob:x'; });
    global.URL.revokeObjectURL = jest.fn();
    global.document.createElement = function() { return { click: function() { clicks.push(this.download); } }; };
    const R = carregarReplay({
      SESSION_LOG: {
        snapshot: function() { return [{ tipo: 'init_dados', iso: '2026-10-20T10:00:00.000Z' }]; },
        registrar: registrar,
      },
    });
    const html = R.exportar();
    expect(html).toContain('Replay da sessão');
    expect(clicks[0]).toMatch(/^financaspro-replay-\d{4}-\d{2}-\d{2}\.html$/);
    expect(registrar).toHaveBeenCalledWith('exportar_replay_html', { eventos: 1 });
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:x');
  });
});

describe('HEALTH_SERVICE — diagnóstico', function() {
  test('junta o estado do app e registra a exportação', async function() {
    const registrar = jest.fn();
    const clicks = [];
    global.Blob = function(partes) { this.partes = partes; };
    global.URL.createObjectURL = jest.fn(function() { return 'blob:d'; });
    global.URL.revokeObjectURL = jest.fn();
    global.document.createElement = function() { return { click: function() { clicks.push(this.download); } }; };
    const HS = carregarHealth({
      SESSION_LOG: {
        snapshot: function() { return [{ tipo: 'init_dados' }, { tipo: 'merge_multiaba' }]; },
        registrar: registrar,
      },
      PERSIST_QUEUE: { getSnapshot: function() { return { pendentes: 0 }; } },
      FINANCE_RECONCILER: { verificarPainel: function() { return { ok: true }; } },
      DADOS: { getTransacoes: function() { return [{}, {}, {}]; }, usoArmazenamento: function() { return { mb: 1.2 }; } },
    });
    const diag = await HS.exportarDiagnostico();
    expect(diag.app).toBe('FinançasPro');
    expect(diag.transacoes.total).toBe(3);
    expect(diag.painel).toEqual({ ok: true });
    expect(diag.fila).toEqual({ pendentes: 0 });
    expect(diag.sessao).toHaveLength(2);
    expect(diag.storage).toEqual({ mb: 1.2 });
    expect(clicks[0]).toMatch(/^financaspro-diagnostico-\d{4}-\d{2}-\d{2}\.json$/);
    expect(registrar).toHaveBeenCalledWith('exportar_diagnostico', { eventos: 2 });
  });

  test('o diagnóstico não traz descrições nem valores de lançamentos', async function() {
    global.Blob = function(partes) { this.partes = partes; };
    global.URL.createObjectURL = function() { return 'blob:d'; };
    global.URL.revokeObjectURL = function() {};
    global.document.createElement = function() { return { click: function() {} }; };
    const HS = carregarHealth({
      DADOS: { getTransacoes: function() { return [{ descricao: 'Aluguel secreto', valor: 1500 }]; } },
    });
    const diag = await HS.exportarDiagnostico();
    expect(JSON.stringify(diag)).not.toContain('Aluguel secreto');
    expect(JSON.stringify(diag)).not.toContain('1500');
  });
});
