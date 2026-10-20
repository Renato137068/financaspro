/**
 * health-replay.test.js — o replay da sessão e o diagnóstico (suporte).
 *
 * O HTML do replay sai do app para anexar a um ticket. Três coisas precisam
 * valer: o que a pessoa vê é o histórico da sessão (sem descrições de
 * lançamentos), nada do que o evento traz pode virar marcação na página
 * (escape), e sem eventos o app não gera arquivo vazio.
 */
const { carregarScript } = require('./helpers/carregar-script.cjs');

const UTILS = carregarScript('js/core/utils.js');

function carregar(extras) {
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

describe('HEALTH_SERVICE — replay da sessão', function() {
  let HS;
  beforeEach(function() {
    HS = carregar();
  });

  test('rótulos conhecidos e tipo desconhecido passa como está', function() {
    expect(HS._rotuloEventoSessao('init_dados')).toBe('App iniciou');
    expect(HS._rotuloEventoSessao('conflito_resolvido')).toBe('Conflito resolvido');
    expect(HS._rotuloEventoSessao('evento_novo')).toBe('evento_novo');
  });

  test('detalhe: lançamentos, conflitos, eventos e backend', function() {
    expect(HS._detalheEventoSessao({ detalhe: { qtd: 3 } })).toBe('3 lançamento(s)');
    expect(HS._detalheEventoSessao({ detalhe: { conflitos: 1, total: 4 } })).toBe('1 conflito(s), 4 total');
    expect(HS._detalheEventoSessao({ detalhe: { eventos: 9 } })).toBe('9 evento(s)');
    expect(HS._detalheEventoSessao({ detalhe: { backend: 'indexeddb' } })).toBe('backend indexeddb');
    expect(HS._detalheEventoSessao({})).toBe('');
    expect(HS._detalheEventoSessao(null)).toBe('');
  });

  test('detalhe sem campo conhecido vira JSON, e JSON que não serializa vira vazio', function() {
    expect(HS._detalheEventoSessao({ detalhe: { outro: 'x' } })).toBe('{"outro":"x"}');
    const circular = {}; circular.self = circular;
    expect(HS._detalheEventoSessao({ detalhe: circular })).toBe('');
  });

  test('a lista mostra o mais recente primeiro e escapa o que vem do evento', function() {
    const html = HS._montarListaReplayHtml([
      { tipo: 'init_dados', iso: '2026-10-20T10:00:00.000Z', detalhe: { qtd: 1 } },
      { tipo: '<img src=x onerror=alert(1)>', iso: '2026-10-20T11:00:00.000Z' },
    ]);
    expect(html.indexOf('11:00:00')).toBeLessThan(html.indexOf('10:00:00'));
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  test('o documento tem título, contagem de eventos e o aviso de que não há descrições', function() {
    const doc = HS._montarDocumentoReplayHtml([{ tipo: 'init_dados', iso: '2026-10-20T10:00:00.000Z' }]);
    expect(doc.startsWith('<!doctype html>')).toBe(true);
    expect(doc).toContain('Replay da sessão');
    expect(doc).toContain('1 evento(s)');
    expect(doc).toContain('Sem descrições de lançamentos');
  });

  test('sem eventos, não gera arquivo e avisa', function() {
    const toast = jest.fn();
    global.UTILS = { mostrarToast: toast, escapeHtml: UTILS.escapeHtml };
    const HS2 = carregar({ UTILS: global.UTILS, SESSION_LOG: { snapshot: function() { return []; } } });
    expect(HS2.exportarReplaySessao()).toBeNull();
    expect(toast).toHaveBeenCalledWith('Nenhum evento nesta sessão ainda', 'info');
    delete global.UTILS;
  });

  test('sem o log de sessão, não gera arquivo', function() {
    const toast = jest.fn();
    const HS2 = carregar({ UTILS: { mostrarToast: toast, escapeHtml: UTILS.escapeHtml }, SESSION_LOG: undefined });
    expect(HS2.exportarReplaySessao()).toBeNull();
    expect(toast).toHaveBeenCalledWith('Replay indisponível', 'error');
  });

  test('com eventos, baixa o HTML e registra a exportação', function() {
    const registrar = jest.fn();
    const clicks = [];
    global.Blob = function(partes) { this.partes = partes; };
    global.URL.createObjectURL = jest.fn(function() { return 'blob:x'; });
    global.URL.revokeObjectURL = jest.fn();
    global.document.createElement = function() { return { click: function() { clicks.push(this.download); } }; };
    const HS2 = carregar({
      SESSION_LOG: {
        snapshot: function() { return [{ tipo: 'init_dados', iso: '2026-10-20T10:00:00.000Z' }]; },
        registrar: registrar,
      },
    });
    const html = HS2.exportarReplaySessao();
    expect(html).toContain('Replay da sessão');
    expect(clicks[0]).toMatch(/^financaspro-replay-\d{4}-\d{2}-\d{2}\.html$/);
    expect(registrar).toHaveBeenCalledWith('exportar_replay_html', { eventos: 1 });
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:x');
  });
});

describe('HEALTH_SERVICE — diagnóstico', function() {
  test('junta o estado do app e registra a exportação', function() {
    const registrar = jest.fn();
    const clicks = [];
    global.Blob = function(partes) { this.partes = partes; };
    global.URL.createObjectURL = jest.fn(function() { return 'blob:d'; });
    global.URL.revokeObjectURL = jest.fn();
    global.document.createElement = function() { return { click: function() { clicks.push(this.download); } }; };
    const HS = carregar({
      SESSION_LOG: {
        snapshot: function() { return [{ tipo: 'init_dados' }, { tipo: 'merge_multiaba' }]; },
        registrar: registrar,
      },
      PERSIST_QUEUE: { getSnapshot: function() { return { pendentes: 0 }; } },
      FINANCE_RECONCILER: { verificarPainel: function() { return { ok: true }; } },
      DADOS: { getTransacoes: function() { return [{}, {}, {}]; }, usoArmazenamento: function() { return { mb: 1.2 }; } },
    });
    const diag = HS.exportarDiagnostico();
    expect(diag.app).toBe('FinançasPro');
    expect(diag.transacoes.total).toBe(3);
    expect(diag.painel).toEqual({ ok: true });
    expect(diag.fila).toEqual({ pendentes: 0 });
    expect(diag.sessao).toHaveLength(2);
    expect(diag.storage).toEqual({ mb: 1.2 });
    expect(clicks[0]).toMatch(/^financaspro-diagnostico-\d{4}-\d{2}-\d{2}\.json$/);
    expect(registrar).toHaveBeenCalledWith('exportar_diagnostico', { eventos: 2 });
  });

  test('o diagnóstico não traz descrições nem valores de lançamentos', function() {
    global.Blob = function(partes) { this.partes = partes; };
    global.URL.createObjectURL = function() { return 'blob:d'; };
    global.URL.revokeObjectURL = function() {};
    global.document.createElement = function() { return { click: function() {} }; };
    const HS = carregar({
      DADOS: { getTransacoes: function() { return [{ descricao: 'Aluguel secreto', valor: 1500 }]; } },
    });
    const diag = HS.exportarDiagnostico();
    expect(JSON.stringify(diag)).not.toContain('Aluguel secreto');
    expect(JSON.stringify(diag)).not.toContain('1500');
  });
});
