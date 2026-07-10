/**
 * init-assinaturas.js — UI do rastreador de assinaturas
 */
const INIT_ASSINATURAS = {
  _bound: false,

  init: function() {
    if (this._bound) return;
    this._bound = true;
    var self = this;
    document.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-action]');
      if (!btn) return;
      var action = btn.dataset.action;
      if (action === 'assinatura-nova') { e.preventDefault(); self.abrirFormNova(); }
      else if (action === 'assinatura-toggle') self.toggle(btn.dataset.assinaturaId);
      else if (action === 'assinatura-excluir') self.confirmarExcluir(btn.dataset.assinaturaId);
      else if (action === 'assinatura-importar') self.importarSugestao(btn.dataset.nome, btn.dataset.valor);
    });
  },

  _icon: function(name) {
    if (typeof lucideIconHtml === 'function') return lucideIconHtml(name || 'tv');
    return '<i data-lucide="' + (name || 'tv') + '" aria-hidden="true"></i>';
  },

  _renderItem: function(a) {
    var dias = ASSINATURAS.diasAteCobranca(a);
    var prox = ASSINATURAS.proximaCobranca(a);
    var cobrancaTxt = dias === 0 ? 'Cobra hoje' : dias === 1 ? 'Amanhã' : 'Em ' + dias + ' dias · ' + UTILS.formatarData(prox);
    return '<article class="sub-card' + (a.ativa === false ? ' sub-card--inactive' : '') + '">' +
      '<div class="sub-card-main">' +
        '<span class="sub-card-icon">' + this._icon(a.icone) + '</span>' +
        '<div class="sub-card-info">' +
          '<h4 class="sub-card-title">' + UTILS.escapeHtml(a.nome) + '</h4>' +
          '<span class="sub-card-meta">' + UTILS.escapeHtml(cobrancaTxt) + '</span>' +
        '</div>' +
        '<span class="sub-card-valor">' + UTILS.formatarMoeda(a.valor) + '<small>/mês</small></span>' +
      '</div>' +
      '<div class="sub-card-actions">' +
        '<button type="button" class="btn-ghost btn-sm" data-action="assinatura-toggle" data-assinatura-id="' + UTILS.escapeHtml(a.id) + '">' +
          (a.ativa === false ? 'Reativar' : 'Pausar') + '</button>' +
        '<button type="button" class="btn-ghost btn-sm sub-btn-danger" data-action="assinatura-excluir" data-assinatura-id="' + UTILS.escapeHtml(a.id) + '">Excluir</button>' +
      '</div>' +
    '</article>';
  },

  render: function() {
    var el = document.getElementById('assinaturas-list');
    if (!el || typeof ASSINATURAS === 'undefined') return;

    var total = ASSINATURAS.totalMensal();
    var anual = ASSINATURAS.totalAnual();
    var lista = ASSINATURAS.listar();
    var sugestoes = ASSINATURAS.sugerirDoExtrato();

    var html = '<div class="sub-kpis">' +
      '<div class="sub-kpi"><span class="sub-kpi-label">Total mensal</span><span class="sub-kpi-val">' + UTILS.formatarMoeda(total) + '</span></div>' +
      '<div class="sub-kpi"><span class="sub-kpi-label">Projeção anual</span><span class="sub-kpi-val">' + UTILS.formatarMoeda(anual) + '</span></div>' +
      '<div class="sub-kpi"><span class="sub-kpi-label">Ativas</span><span class="sub-kpi-val">' + ASSINATURAS.listar(true).length + '</span></div>' +
    '</div>';

    if (sugestoes.length > 0) {
      html += '<div class="sub-sugestoes"><p class="sub-sugestoes-title">Detectadas no extrato:</p>';
      sugestoes.forEach(function(s) {
        html += '<button type="button" class="sub-sugestao-chip" data-action="assinatura-importar" data-nome="' + UTILS.escapeHtml(s.nome) + '" data-valor="' + s.valor + '">' +
          '+ ' + UTILS.escapeHtml(s.nome) + ' (' + UTILS.formatarMoeda(s.valor) + ')</button>';
      });
      html += '</div>';
    }

    if (lista.length === 0) {
      html += '<div class="sub-empty"><p>Nenhuma assinatura cadastrada.</p>' +
        '<button type="button" class="btn-primario" data-action="assinatura-nova">Adicionar assinatura</button></div>';
    } else {
      html += '<div class="sub-list">' + lista.map(function(a) {
        return INIT_ASSINATURAS._renderItem(a);
      }).join('') + '</div>';
    }

    el.innerHTML = html;
    if (typeof renderLucideIconsNow === 'function') renderLucideIconsNow(el);
  },

  renderResumo: function() {
    var el = document.getElementById('dashboard-assinaturas-resumo');
    var sec = document.getElementById('secao-assinaturas-resumo');
    if (!el || typeof ASSINATURAS === 'undefined') return;
    var ativas = ASSINATURAS.listar(true);
    if (sec) sec.style.display = ativas.length === 0 && ASSINATURAS.listar().length === 0 ? 'none' : '';
    if (ativas.length === 0) {
      el.innerHTML = '';
      return;
    }
    var total = ASSINATURAS.totalMensal();
    var proximas = ativas.slice().sort(function(a, b) {
      return ASSINATURAS.diasAteCobranca(a) - ASSINATURAS.diasAteCobranca(b);
    }).slice(0, 2);
    el.innerHTML = '<div class="sub-resumo-total"><span>Total em assinaturas</span><strong>' + UTILS.formatarMoeda(total) + '/mês</strong></div>' +
      proximas.map(function(a) {
        return '<div class="sub-resumo-line"><span>' + UTILS.escapeHtml(a.nome) + '</span><span>' + UTILS.formatarMoeda(a.valor) + '</span></div>';
      }).join('');
  },

  abrirFormNova: function(preset) {
    preset = preset || {};
    var html =
      '<div class="meta-form">' +
        '<label class="form-label" for="sub-nome">Nome</label>' +
        '<input type="text" id="sub-nome" class="form-input" placeholder="Netflix, Spotify..." value="' + UTILS.escapeHtml(preset.nome || '') + '">' +
        '<label class="form-label" for="sub-valor">Valor mensal (R$)</label>' +
        '<input type="text" id="sub-valor" class="form-input" placeholder="0,00" inputmode="numeric" value="' + (preset.valor ? String(preset.valor).replace('.', ',') : '') + '">' +
        '<label class="form-label" for="sub-dia">Dia da cobrança</label>' +
        '<input type="number" id="sub-dia" class="form-input" min="1" max="31" value="' + (preset.dia || new Date().getDate()) + '">' +
      '</div>';
    var self = this;
    INIT_MODALS.fpAlert(html, { trustedHtml: true, title: 'Nova assinatura' });
    setTimeout(function() {
      var ov = document.querySelector('.modal-overlay');
      if (!ov) return;
      var ok = ov.querySelector('.modal-btn');
      if (!ok) return;
      ok.textContent = 'Salvar';
      ok.onclick = function() { self._salvarNova(ov); };
    }, 80);
  },

  _salvarNova: function(overlay) {
    try {
      var raw = document.getElementById('sub-valor').value.replace(/\./g, '').replace(',', '.');
      ASSINATURAS.criar({
        nome: document.getElementById('sub-nome').value,
        valor: parseFloat(raw),
        diaCobranca: parseInt(document.getElementById('sub-dia').value, 10)
      });
      overlay.remove();
      UTILS.mostrarToast('Assinatura adicionada!', 'success');
      this.render();
      this.renderResumo();
    } catch (e) {
      UTILS.mostrarToast(e.message || 'Erro', 'error');
    }
  },

  importarSugestao: function(nome, valor) {
    this.abrirFormNova({ nome: nome, valor: parseFloat(valor) });
  },

  toggle: function(id) {
    ASSINATURAS.toggleAtiva(id);
    this.render();
    this.renderResumo();
    UTILS.mostrarToast('Assinatura atualizada', 'info');
  },

  confirmarExcluir: function(id) {
    var a = ASSINATURAS.obter(id);
    if (!a) return;
    var self = this;
    var msg = 'Excluir assinatura "' + a.nome + '"?';
    var fn = function() {
      ASSINATURAS.excluir(id);
      self.render();
      self.renderResumo();
      UTILS.mostrarToast('Assinatura removida', 'info');
    };
    if (typeof INIT_MODALS !== 'undefined' && INIT_MODALS.confirm) INIT_MODALS.confirm(msg, fn);
    else if (window.confirm(msg)) fn();
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = INIT_ASSINATURAS;
}
