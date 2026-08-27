/**
 * orcamento-ui.test.js — auditoria da aba Orçamento (header + grupos + insight)
 * @jest-environment jsdom
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'js', 'modules', 'init-orcamento.js'), 'utf8');

function carregar(extra) {
  var config = { renda: 5000, regra503020: { nec: 50, des: 30, pou: 20 } };
  var txs = [];
  var sandbox = Object.assign({
    window: window,
    document: document,
    console: { error: function() {}, warn: function() {}, log: function() {} },
    CONFIG: {
      TIPO_RECEITA: 'receita',
      TIPO_DESPESA: 'despesa',
      getCatLabel: function(c) {
        return ({ alimentacao: 'Alimentação', lazer: 'Lazer' })[c] || c;
      }
    },
    UTILS: {
      formatarMoeda: function(v) {
        return 'R$ ' + Number(v).toFixed(2).replace('.', ',');
      },
      escapeHtml: function(s) {
        return String(s)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      },
      mostrarToast: function() {},
      labelCategoria: function(c) { return c; }
    },
    DADOS: {
      getConfig: function() { return Object.assign({}, config); },
      salvarConfig: function(p) { Object.assign(config, p); }
    },
    TRANSACOES: {
      obter: function(filtros) {
        return txs.filter(function(t) {
          if (!filtros) return true;
          var d = new Date(t.data + 'T00:00:00');
          if (filtros.mes && d.getMonth() + 1 !== filtros.mes) return false;
          if (filtros.ano && d.getFullYear() !== filtros.ano) return false;
          return true;
        });
      }
    },
    ORCAMENTO: {
      _cache: {},
      obterTodos: function() { return this._cache; },
      obterStatus: function(cat) {
        var lim = this._cache[cat];
        if (!lim) return { categoria: cat, limite: null, gasto: 0, percentual: 0, status: 'sem-limite' };
        var gasto = 0;
        txs.forEach(function(t) {
          if (t.tipo === 'despesa' && t.categoria === cat) gasto += t.valor;
        });
        var pct = Math.round((gasto / lim) * 100);
        return {
          categoria: cat, limite: lim, gasto: gasto, percentual: pct,
          status: gasto >= lim ? 'excedido' : (pct >= 80 ? 'alerta' : 'ok')
        };
      },
      projetarCategoria: function(cat) {
        var st = this.obterStatus(cat);
        if (!st.limite) return { risco: 'sem-limite', percentual: 0 };
        if (st.status === 'excedido') return { risco: 'estourado', percentual: st.percentual };
        if (st.percentual >= 85) return { risco: 'vai-estourar', percentual: st.percentual };
        return { risco: 'ok', percentual: st.percentual };
      },
      categoriasEmRisco: function() {
        var self = this;
        return Object.keys(this._cache)
          .map(function(c) { return Object.assign({ categoria: c }, self.projetarCategoria(c)); })
          .filter(function(p) { return p.risco === 'vai-estourar' || p.risco === 'estourado'; });
      },
      mensagemRisco: function(cat) {
        var p = this.projetarCategoria(cat);
        if (p.risco === 'estourado') return cat + ': limite estourado.';
        if (p.risco === 'vai-estourar') return cat + ': risco de estouro.';
        return '';
      }
    },
    Object: Object,
    Array: Array,
    String: String,
    Number: Number,
    Date: Date,
    Math: Math,
    setTimeout: setTimeout
  }, extra || {});
  sandbox._setTxs = function(list) { txs = list; };
  sandbox._setConfig = function(c) { Object.assign(config, c); };
  sandbox._orc = function() { return sandbox.ORCAMENTO; };
  sandbox.globalThis = sandbox;
  var code = src.replace(/\bconst INIT_ORCAMENTO =/, 'var INIT_ORCAMENTO =');
  vm.runInContext(code, vm.createContext(sandbox), {
    filename: path.join(root, 'js', 'modules', 'init-orcamento.js')
  });
  return sandbox;
}

function montarHeaderDom() {
  document.body.innerHTML =
    '<div id="orc-renda-setup" style="display:none"></div>' +
    '<div id="orc-dashboard" style="display:none">' +
    '<div id="orc-saldo-disponivel">R$ 0,00</div>' +
    '<div id="orc-percent-restante">0%</div>' +
    '<div id="orc-tendencia">vs mês anterior</div>' +
    '<div id="orc-total-planejado">R$ 0,00</div>' +
    '<div id="orc-total-realizado">R$ 0,00</div>' +
    '<div id="orc-categorias-criticas">0</div>' +
    '<div id="orc-economia-mes">R$ 0,00</div>' +
    '<div id="orc-trend-indicator"></div>' +
    '<span id="orc-nec-pct"></span><span id="orc-des-pct"></span><span id="orc-pou-pct"></span>' +
    '<span id="orc-nec-gasto"></span><span id="orc-nec-limite"></span>' +
    '<div class="orc-progress"><div id="orc-nec-bar" class="orc-progress-fill"></div></div>' +
    '<span id="orc-des-gasto"></span><span id="orc-des-limite"></span>' +
    '<div class="orc-progress"><div id="orc-des-bar" class="orc-progress-fill"></div></div>' +
    '<span id="orc-pou-gasto"></span><span id="orc-pou-limite"></span>' +
    '<div class="orc-progress"><div id="orc-pou-bar" class="orc-progress-fill"></div></div>' +
    '<div id="orc-insights"></div>' +
    '<div id="orc-live-region"></div>' +
    '<div id="orc-categorias">' +
      '<div id="orc-group-critical" style="display:none"><span id="orc-critical-count">0</span><div id="orc-critical-list"></div></div>' +
      '<div id="orc-group-attention" style="display:none"><span id="orc-attention-count">0</span><div id="orc-attention-list"></div></div>' +
      '<div id="orc-group-healthy" style="display:none"><span id="orc-healthy-count">0</span><div id="orc-healthy-list"></div></div>' +
      '<div id="orc-categorias-empty" style="display:none"></div>' +
    '</div></div>';
}

describe('P0 — header estratégico', function() {
  test('renda + despesas: IDs saem do placeholder e batem com os cartões', function() {
    var hoje = new Date();
    var dataStr = hoje.getFullYear() + '-' +
      String(hoje.getMonth() + 1).padStart(2, '0') + '-' +
      String(hoje.getDate()).padStart(2, '0');
    montarHeaderDom();
    var sb = carregar();
    sb._setTxs([
      { tipo: 'despesa', valor: 2000, categoria: 'alimentacao', data: dataStr },
      { tipo: 'despesa', valor: 800, categoria: 'lazer', data: dataStr }
    ]);
    sb.INIT_ORCAMENTO.renderDashboard();

    expect(document.getElementById('orc-total-planejado').textContent).toBe('R$ 5000,00');
    expect(document.getElementById('orc-total-realizado').textContent).toBe('R$ 2800,00');
    expect(document.getElementById('orc-saldo-disponivel').textContent).toBe('R$ 2200,00');
    expect(document.getElementById('orc-economia-mes').textContent).toBe('R$ 2200,00');
    expect(document.getElementById('orc-percent-restante').textContent).toMatch(/44%/);
    expect(document.getElementById('orc-nec-gasto').textContent).toBe('R$ 2000,00');
  });
});

describe('P1.1 / P2.2 — grupos de categorias', function() {
  test('não sobrescreve #orc-categorias; preenche listas e mostra críticas', function() {
    var hoje = new Date();
    var dataStr = hoje.getFullYear() + '-' +
      String(hoje.getMonth() + 1).padStart(2, '0') + '-' +
      String(hoje.getDate()).padStart(2, '0');
    montarHeaderDom();
    var sb = carregar();
    sb._orc()._cache = { alimentacao: 500 };
    sb._setTxs([
      { tipo: 'despesa', valor: 600, categoria: 'alimentacao', data: dataStr },
      { tipo: 'despesa', valor: 50, categoria: 'lazer', data: dataStr }
    ]);
    sb.INIT_ORCAMENTO.renderDashboard();

    expect(document.getElementById('orc-group-critical')).toBeTruthy();
    expect(document.getElementById('orc-categorias').querySelector('#orc-group-critical')).toBeTruthy();
    expect(document.getElementById('orc-critical-list').innerHTML).toMatch(/Alimentação|alimentacao/);
    expect(document.getElementById('orc-critical-count').textContent).toBe('1');
    expect(document.getElementById('orc-critical-list').textContent).toMatch(/estourado|risco/i);
  });
});

describe('P1.2 — sem renderHistorico', function() {
  test('função removida do módulo', function() {
    expect(src).not.toMatch(/renderHistorico\s*:/);
    expect(src).not.toMatch(/orc-historico/);
  });
});

describe('P2.1 — insight do maior gasto', function() {
  test('usa label escapado, não o slug cru', function() {
    var hoje = new Date();
    var dataStr = hoje.getFullYear() + '-' +
      String(hoje.getMonth() + 1).padStart(2, '0') + '-' +
      String(hoje.getDate()).padStart(2, '0');
    montarHeaderDom();
    var sb = carregar();
    sb._setTxs([
      { tipo: 'despesa', valor: 900, categoria: 'alimentacao', data: dataStr }
    ]);
    sb.INIT_ORCAMENTO.renderDashboard();
    var html = document.getElementById('orc-insights').innerHTML;
    expect(html).toMatch(/Alimentação/);
    expect(html).not.toMatch(/>alimentacao é seu maior/);
  });
});

describe('P1.3 — progressbar ARIA', function() {
  test('trilhos 50/30/20 têm role=progressbar e aria-valuenow', function() {
    montarHeaderDom();
    var sb = carregar();
    sb.INIT_ORCAMENTO.renderDashboard();
    var nec = document.getElementById('orc-nec-bar').parentElement;
    expect(nec.getAttribute('role')).toBe('progressbar');
    expect(nec.getAttribute('aria-valuemax')).toBe('100');
    expect(nec.hasAttribute('aria-valuenow')).toBe(true);
    expect(nec.getAttribute('aria-label')).toMatch(/Necessidades/);
  });
});

describe('Sub-abas Orçamento', function() {
  function montarSubAbasDom() {
    window.scrollTo = function() {};
    document.body.innerHTML =
      '<div id="aba-orcamento">' +
        '<button type="button" data-orc-sub="planejamento" class="filtro-chip ativo" aria-selected="true">Planejamento</button>' +
        '<button type="button" data-orc-sub="metas" class="filtro-chip" aria-selected="false">Metas</button>' +
        '<div id="orc-sub-panel-planejamento" class="orc-sub-panel ativo"></div>' +
        '<div id="orc-sub-panel-metas" class="orc-sub-panel" hidden></div>' +
      '</div>';
  }

  test('mudarSubAba ativa painel metas e desativa planejamento', function() {
    montarSubAbasDom();
    var sb = carregar();
    sb.INIT_ORCAMENTO.mudarSubAba('metas');
    expect(document.getElementById('orc-sub-panel-metas').classList.contains('ativo')).toBe(true);
    expect(document.getElementById('orc-sub-panel-metas').hasAttribute('hidden')).toBe(false);
    expect(document.getElementById('orc-sub-panel-planejamento').classList.contains('ativo')).toBe(false);
    expect(document.getElementById('orc-sub-panel-planejamento').hasAttribute('hidden')).toBe(true);
    expect(document.querySelector('[data-orc-sub="metas"]').getAttribute('aria-selected')).toBe('true');
    expect(document.querySelector('[data-orc-sub="metas"]').getAttribute('tabindex')).toBe('0');
    expect(document.querySelector('[data-orc-sub="planejamento"]').getAttribute('tabindex')).toBe('-1');
  });

  test('nome inválido cai em planejamento', function() {
    montarSubAbasDom();
    var sb = carregar();
    sb.INIT_ORCAMENTO.mudarSubAba('xyz');
    expect(document.getElementById('orc-sub-panel-planejamento').classList.contains('ativo')).toBe(true);
  });
});

describe('Polimento painel Planejamento', function() {
  var htmlPath = path.join(__dirname, '..', 'index.html');
  var htmlOrc = fs.readFileSync(htmlPath, 'utf8');

  test('subtítulo curto no dashboard; sem perfil-header redundante', function() {
    expect(htmlOrc).toMatch(/orc-panel-subtitle[^>]*>Planejamento 50\/30\/20 do mês/);
    var dashBlock = htmlOrc.match(/id="orc-dashboard"[\s\S]*?<!-- Header Estratégico -->/);
    expect(dashBlock).toBeTruthy();
    expect(dashBlock[0]).not.toMatch(/perfil-header perfil-header-compact/);
    expect(dashBlock[0]).not.toMatch(/<h2 class="perfil-nome">Orçamento<\/h2>/);
  });
});
