/**
 * previsao.js — Previsão financeira com IA
 * v11.0 — Fase 8: renderiza previsão separada da lógica
 * Depende de: ai-engine.js, dados.js, utils.js
 */

var PREVISAO = {
  _cache:    null,
  _cacheKey: '',

  // ─────────────────────────────────────────────────────────────────
  // CORE
  // ─────────────────────────────────────────────────────────────────

  /**
   * Calcula previsão com cache (invalida quando transações mudam).
   * @returns {Object} resultado de AI_ENGINE.prever()
   */
  calcular: function() {
    var txs = typeof DADOS !== 'undefined' ? DADOS.getTransacoes() : [];
    var key = txs.length + '_' + (txs[txs.length - 1] ? txs[txs.length - 1].id : '');

    if (this._cache && this._cacheKey === key) return this._cache;

    this._cache    = AI_ENGINE.prever(txs, 3);
    this._cacheKey = key;
    return this._cache;
  },

  /**
   * Invalida o cache (chamado quando transações mudam).
   */
  invalidarCache: function() {
    this._cache    = null;
    this._cacheKey = '';
  },

  // ─────────────────────────────────────────────────────────────────
  // FORMATAÇÃO
  // ─────────────────────────────────────────────────────────────────

  _formatarMoeda: function(valor) {
    try {
      return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    } catch (e) {
      return 'R$ ' + valor.toFixed(2).replace('.', ',');
    }
  },

  _formatarMes: function(mesKey) {
    var partes = mesKey.split('-');
    var meses  = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    var m      = parseInt(partes[1], 10) - 1;
    return (meses[m] || partes[1]) + '/' + partes[0].slice(2);
  },

  _tendenciaIcon: function(tendencia) {
    var icons = {
      'gastos-crescendo':     { icon: '📈', cor: 'var(--cor-danger, #e53e3e)',  texto: 'Gastos em alta' },
      'gastos-diminuindo':    { icon: '📉', cor: 'var(--cor-success, #38a169)', texto: 'Gastos em queda' },
      'receitas-crescendo':   { icon: '💹', cor: 'var(--cor-success, #38a169)', texto: 'Receitas em alta' },
      'receitas-diminuindo':  { icon: '⬇️', cor: 'var(--cor-warning, #d69e2e)', texto: 'Receitas em queda' },
      'estavel':              { icon: '➡️', cor: 'var(--cor-text-2, #666)',     texto: 'Tendência estável' },
      'insuficiente':         { icon: '📊', cor: 'var(--cor-text-2, #666)',     texto: 'Dados insuficientes' }
    };
    return icons[tendencia] || icons['estavel'];
  },

  // ─────────────────────────────────────────────────────────────────
  // RENDERIZAÇÃO
  // ─────────────────────────────────────────────────────────────────

  /**
   * Renderiza o painel completo de previsão no elemento #previsao-painel.
   */
  renderizar: function() {
    var el = document.getElementById('previsao-painel');
    if (!el) return;

    var prev = this.calcular();

    if (prev.tendencia === 'insuficiente' || prev.meses.length === 0) {
      el.innerHTML = '<div class="previsao-vazia">📊 Registre ao menos 2 meses de transações para ver projeções.</div>';
      return;
    }

    var self   = this;
    var tend   = this._tendenciaIcon(prev.tendencia);
    var meses  = prev.meses;

    // Cards de projeção
    var cardsHtml = meses.map(function(m) {
      var saldoPos = m.saldoEstimado >= 0;
      var confBadge = m.confianca === 'alta' ? '🎯' : m.confianca === 'media' ? '📐' : '💡';
      return '<div class="previsao-card" aria-label="Previsão ' + self._formatarMes(m.mesKey) + '">' +
        '<div class="previsao-card-mes">' + self._formatarMes(m.mesKey) + ' <span class="previsao-conf" title="Confiança ' + m.confianca + '">' + confBadge + '</span></div>' +
        '<div class="previsao-card-row">' +
          '<span class="previsao-label">💚 Receitas</span>' +
          '<span class="previsao-valor receita">' + self._formatarMoeda(m.receitaEstimada) + '</span>' +
        '</div>' +
        '<div class="previsao-card-row">' +
          '<span class="previsao-label">❤️ Despesas</span>' +
          '<span class="previsao-valor despesa">' + self._formatarMoeda(m.despesaEstimada) + '</span>' +
        '</div>' +
        '<div class="previsao-card-saldo ' + (saldoPos ? 'positivo' : 'negativo') + '">' +
          (saldoPos ? '✅' : '⚠️') + ' Saldo: ' + self._formatarMoeda(m.saldoEstimado) +
        '</div>' +
      '</div>';
    }).join('');

    // Saúde financeira
    var txs    = typeof DADOS !== 'undefined' ? DADOS.getTransacoes() : [];
    var config = typeof DADOS !== 'undefined' ? DADOS.getConfig() : {};
    var saude  = AI_ENGINE.calcularSaude(txs, config);
    var saudeCor = saude.nivel === 'excelente' ? '#38a169' : saude.nivel === 'bom' ? '#3182ce' : saude.nivel === 'regular' ? '#d69e2e' : '#e53e3e';

    el.innerHTML =
      '<div class="previsao-header">' +
        '<h3 class="previsao-titulo">🔮 Previsão Financeira</h3>' +
        '<div class="previsao-tendencia" style="color:' + tend.cor + '">' +
          tend.icon + ' ' + tend.texto +
        '</div>' +
      '</div>' +

      '<div class="previsao-cards">' + cardsHtml + '</div>' +

      '<div class="previsao-saude">' +
        '<div class="saude-header">' +
          '<span class="saude-titulo">💪 Saúde Financeira</span>' +
          '<span class="saude-score" style="color:' + saudeCor + '">' + saude.score + '<small>/100</small></span>' +
        '</div>' +
        '<div class="saude-barra-bg">' +
          '<div class="saude-barra-fill" style="width:' + saude.score + '%;background:' + saudeCor + '"></div>' +
        '</div>' +
        '<div class="saude-detalhes">' +
          saude.detalhes.map(function(d) {
            return '<div class="saude-item">' +
              '<span class="saude-check">' + (d.ok ? '✅' : '⚡') + '</span>' +
              '<span class="saude-item-nome">' + d.item + '</span>' +
              '<span class="saude-item-desc">' + d.desc + '</span>' +
            '</div>';
          }).join('') +
        '</div>' +
      '</div>' +

      (prev.taxaPoupancaMedia > 0
        ? '<div class="previsao-meta">📊 Taxa de poupança média: <strong>' + prev.taxaPoupancaMedia + '%</strong></div>'
        : '') +

      (function() {
        if (typeof AI_ENGINE.sugestaoCorte !== 'function') return '';
        var corte = AI_ENGINE.sugestaoCorte(txs, 0.20);
        if (!corte || corte.corteNecessario === 0) return '';
        var catLabel = (typeof CONFIG !== 'undefined' && CONFIG.getCatLabel && corte.categoriaAlvo)
          ? CONFIG.getCatLabel(corte.categoriaAlvo) : (corte.categoriaAlvo || '');
        return '<div class="previsao-meta previsao-meta-corte">' +
          '🎯 Para atingir 20% de poupança, reduza <strong>R$ ' + corte.corteNecessario.toFixed(2).replace('.', ',') + '</strong>' +
          (catLabel ? ' em <strong>' + catLabel + '</strong>' : '') + '.' +
        '</div>';
      }());
  },

  /**
   * Renderiza mini-widget de previsão para o próximo mês (dashboard).
   * Target: #previsao-mini
   */
  renderizarMini: function() {
    var el = document.getElementById('previsao-mini');
    if (!el) return;

    var prev    = this.calcular();
    var proximo = prev.meses && prev.meses[0];

    if (!proximo) {
      el.innerHTML = '';
      return;
    }

    var saldoPos  = proximo.saldoEstimado >= 0;
    var self      = this;
    var tend      = this._tendenciaIcon(prev.tendencia);

    el.innerHTML =
      '<div class="previsao-mini-inner" role="status" aria-label="Previsão próximo mês">' +
        '<span class="previsao-mini-label">🔮 ' + self._formatarMes(proximo.mesKey) + '</span>' +
        '<span class="previsao-mini-saldo ' + (saldoPos ? 'pos' : 'neg') + '">' +
          (saldoPos ? '+' : '') + self._formatarMoeda(proximo.saldoEstimado) +
        '</span>' +
        '<span class="previsao-mini-tend" style="color:' + tend.cor + '">' + tend.icon + '</span>' +
      '</div>';
  },

  // ─────────────────────────────────────────────────────────────────
  // INICIALIZAÇÃO
  // ─────────────────────────────────────────────────────────────────

  init: function() {
    this.renderizarMini();

    // Subscreve mudanças de transações para invalidar cache
    if (typeof APP_STORE !== 'undefined') {
      var self = this;
      APP_STORE.subscribe('dados.transacoesVer', function() {
        self.invalidarCache();
        self.renderizarMini();
      });
    }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PREVISAO;
}
