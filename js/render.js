/**
 * render.js - UI Rendering
 * Tier 1: Depends on config.js, dados.js, utils.js, transacoes.js, orcamento.js
 */

var RENDER = {
  init: function() {
    this.renderResumo();
    this.renderExtrato();
    this.renderOrcamento();
    this.renderFormCategories();
    this.atualizarHeaderSaldo();
  },

  renderResumo: function() {
    var agora = new Date();
    var resumo = TRANSACOES.obterResumoMes(agora.getMonth() + 1, agora.getFullYear());
    var elRec = document.getElementById('resumo-receitas');
    var elDesp = document.getElementById('resumo-despesas');
    var elSaldo = document.getElementById('saldo-header-txt');
    if (elRec) elRec.textContent = UTILS.formatarMoeda(resumo.receitas);
    if (elDesp) elDesp.textContent = UTILS.formatarMoeda(resumo.despesas);
    if (elSaldo) elSaldo.textContent = 'Saldo: ' + UTILS.formatarMoeda(resumo.saldo);
  },

  renderUltimasTransacoes: function() {
    var transacoes = TRANSACOES.obter({});
    var ultimas = transacoes.slice(0, 5);
    var list = document.getElementById('resumo-list');
    if (!list) return;
    if (ultimas.length === 0) { list.innerHTML = '<p class="empty">Nenhuma transacao</p>'; return; }
    list.innerHTML = ultimas.map(function(t) {
      return '<div class="transacao-item"><div class="transacao-info">' +
        '<div class="transacao-categoria">' + UTILS.escapeHtml(t.categoria) + '</div>' +
        '<div class="transacao-data">' + UTILS.formatarData(t.data) + '</div>' +
        '</div><div class="transacao-valor ' + t.tipo + '">' +
        (t.tipo === CONFIG.TIPO_RECEITA ? '+' : '-') + ' ' + UTILS.formatarMoeda(t.valor) +
        '</div></div>';
    }).join('');
  },

  renderExtrato: function() {
    var transacoes = TRANSACOES.obter({});
    var container = document.getElementById('lista-transacoes');
    if (!container) return;
    if (transacoes.length === 0) {
      container.innerHTML = '<p class="empty">Nenhuma transacao</p>';
      return;
    }
    container.innerHTML = transacoes.map(function(t) {
      return '<div class="transacao-item-full" data-tx-id="' + UTILS.escapeHtml(t.id) + '">' +
        '<div class="transacao-info-full">' +
          '<div class="transacao-categoria">' + UTILS.escapeHtml(t.categoria) + '</div>' +
          '<div class="transacao-descricao">' + UTILS.escapeHtml(t.descricao || '-') + '</div>' +
          '<div class="transacao-data">' + UTILS.formatarData(t.data) + '</div>' +
        '</div><div class="transacao-actions">' +
          '<div class="transacao-valor ' + t.tipo + '">' +
            (t.tipo === CONFIG.TIPO_RECEITA ? '+' : '-') + ' ' + UTILS.formatarMoeda(t.valor) +
          '</div>' +
          '<button class="btn-delete" type="button" aria-label="Excluir transacao">&times;</button>' +
        '</div></div>';
    }).join('');

    var self = this;
    container.addEventListener('click', function(e) {
      var deleteBtn = e.target.closest('.btn-delete');
      if (!deleteBtn) return;
      var item = deleteBtn.closest('[data-tx-id]');
      var id = item ? item.dataset.txId : null;
      if (!id) return;
      var tx = TRANSACOES.obterPorId(id);
      var desc = tx ? (tx.descricao || tx.categoria) : 'esta transacao';
      fpConfirm('Excluir "' + desc + '"?', function() {
        TRANSACOES.deletar(id);
        self.renderExtrato();
        self.renderResumo();
        self.renderOrcamento();
        self.atualizarHeaderSaldo();
        UTILS.mostrarToast('Transacao excluida', 'info');
      });
    });
  },

  renderOrcamento: function() {
    var agora = new Date();
    var status = ORCAMENTO.obterStatusTodos(agora.getMonth() + 1, agora.getFullYear());
    var container = document.getElementById('resumo-orcamentos');
    if (!container) return;
    if (status.length === 0) {
      container.innerHTML = '<p class="empty">Nenhum orcamento definido</p>';
      return;
    }
    container.innerHTML = status.map(function(s) {
      var pct = s.percentual;
      var cor = s.status === 'excedido' ? '#ef5350' : s.status === 'alerta' ? '#ffa726' : '#66bb6a';
      return '<div class="orcamento-item" data-categoria="' + UTILS.escapeHtml(s.categoria) + '">' +
        '<div class="orcamento-header"><span class="orcamento-categoria">' + UTILS.escapeHtml(s.categoria) + '</span>' +
        '<span class="orcamento-valor">' + UTILS.formatarMoeda(s.gasto) + ' / ' + UTILS.formatarMoeda(s.limite) + '</span></div>' +
        '<div class="progress-bar"><div class="progress-fill" style="width:' + Math.min(pct, 100) + '%;background-color:' + cor + ';"></div></div>' +
        '<div class="orcamento-footer"><span class="status-' + s.status + '">' + pct + '%</span>' +
        '<button class="btn-small" type="button">Remover</button></div></div>';
    }).join('');

    var self = this;
    container.addEventListener('click', function(e) {
      var removeBtn = e.target.closest('.btn-small');
      if (!removeBtn) return;
      var item = removeBtn.closest('[data-categoria]');
      var cat = item ? item.dataset.categoria : null;
      if (!cat) return;
      fpConfirm('Remover limite de "' + cat + '"?', function() {
        ORCAMENTO.deletarLimite(cat);
        self.renderOrcamento();
        UTILS.mostrarToast('Limite removido', 'info');
      });
    });
  },

  renderFormCategories: function() {
    var tipoSelect = document.getElementById('tipo-transacao');
    if (!tipoSelect) return;
    var self = this;
    tipoSelect.addEventListener('change', function(e) { self.atualizarCategorias(e.target.value); });
    this.atualizarCategorias(CONFIG.TIPO_DESPESA);
  },

  atualizarCategorias: function(tipo) {
    var categorias = tipo === CONFIG.TIPO_RECEITA ? CONFIG.CATEGORIAS_RECEITA : CONFIG.CATEGORIAS_DESPESA;
    var select = document.getElementById('categoria-transacao');
    if (!select) return;
    select.innerHTML = '<option value="">Selecione a categoria</option>' +
      categorias.map(function(cat) { return '<option value="' + cat + '">' + cat + '</option>'; }).join('');
  },

  atualizarHeaderSaldo: function() {
    var saldo = UTILS.calcularSaldo(TRANSACOES.obter({}));
    var el = document.getElementById('saldo-header-txt');
    if (el) el.textContent = 'Saldo: ' + UTILS.formatarMoeda(saldo);
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = RENDER;
}
