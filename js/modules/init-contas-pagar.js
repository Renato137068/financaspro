/**
 * init-contas-pagar.js — UI de contas a pagar + calendário
 */
const INIT_CONTAS_PAGAR = {
  _bound: false,
  _mesView: null,
  _anoView: null,

  init: function() {
    if (this._bound) return;
    this._bound = true;
    var now = new Date();
    this._mesView = now.getMonth() + 1;
    this._anoView = now.getFullYear();

    var self = this;
    document.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-action]');
      if (!btn) return;
      var action = btn.dataset.action;
      if (action === 'conta-nova') { e.preventDefault(); self.abrirFormNova(); }
      else if (action === 'conta-pagar') self.confirmarPagamento(btn.dataset.contaId);
      else if (action === 'conta-excluir') self.confirmarExcluir(btn.dataset.contaId);
      else if (action === 'conta-mes-prev') { self._mudarMes(-1); }
      else if (action === 'conta-mes-next') { self._mudarMes(1); }
    });
  },

  _mudarMes: function(delta) {
    this._mesView += delta;
    if (this._mesView < 1) { this._mesView = 12; this._anoView--; }
    if (this._mesView > 12) { this._mesView = 1; this._anoView++; }
    this.render();
  },

  _icon: function(name) {
    if (typeof lucideIconHtml === 'function') return lucideIconHtml(name || 'calendar');
    return '<i data-lucide="' + (name || 'calendar') + '" aria-hidden="true"></i>';
  },

  _renderCalendario: function(mes, ano) {
    var primeiro = new Date(ano, mes - 1, 1);
    var ultimoDia = new Date(ano, mes, 0).getDate();
    var startDow = primeiro.getDay();
    var pendentes = CONTAS_PAGAR.listarPendentes();
    var porDia = {};
    pendentes.forEach(function(c) {
      var p = c.vencimento.split('-');
      if (parseInt(p[0], 10) === ano && parseInt(p[1], 10) === mes) {
        var dia = parseInt(p[2], 10);
        porDia[dia] = (porDia[dia] || 0) + 1;
      }
    });

    var nomes = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
    var html = '<div class="cp-cal-grid cp-cal-head">';
    nomes.forEach(function(n) { html += '<span class="cp-cal-dow">' + n + '</span>'; });
    html += '</div><div class="cp-cal-grid cp-cal-body">';

    for (var i = 0; i < startDow; i++) html += '<span class="cp-cal-cell cp-cal-empty"></span>';
    var hoje = new Date();
    for (var d = 1; d <= ultimoDia; d++) {
      var cls = 'cp-cal-cell';
      if (d === hoje.getDate() && mes === hoje.getMonth() + 1 && ano === hoje.getFullYear()) cls += ' cp-cal-today';
      if (porDia[d]) cls += ' cp-cal-has-bill';
      html += '<span class="' + cls + '"><span class="cp-cal-day">' + d + '</span>';
      if (porDia[d]) html += '<span class="cp-cal-dot" title="' + porDia[d] + ' conta(s)"></span>';
      html += '</span>';
    }
    html += '</div>';
    return html;
  },

  _renderItem: function(conta) {
    var sit = CONTAS_PAGAR.situacao(conta);
    var dias = CONTAS_PAGAR.diasAteVencimento(conta.vencimento);
    var statusLabel = sit === 'vencida' ? 'Vencida' : sit === 'hoje' ? 'Vence hoje' : sit === 'proxima' ? 'Em ' + dias + ' dias' : UTILS.formatarData(conta.vencimento);
    return '<article class="cp-item cp-item--' + sit + '">' +
      '<div class="cp-item-main">' +
        '<span class="cp-item-icon">' + this._icon(conta.recorrente ? 'repeat' : 'file-text') + '</span>' +
        '<div class="cp-item-info">' +
          '<h4 class="cp-item-title">' + UTILS.escapeHtml(conta.descricao) + '</h4>' +
          '<span class="cp-item-meta">' + UTILS.escapeHtml(statusLabel) +
            (conta.recorrente ? ' · Mensal' : '') + '</span>' +
        '</div>' +
        '<span class="cp-item-valor">' + UTILS.formatarMoeda(conta.valor) + '</span>' +
      '</div>' +
      '<div class="cp-item-actions">' +
        '<button type="button" class="btn-primario btn-sm" data-action="conta-pagar" data-conta-id="' + UTILS.escapeHtml(conta.id) + '">Marcar pago</button>' +
        '<button type="button" class="btn-ghost btn-sm cp-btn-danger" data-action="conta-excluir" data-conta-id="' + UTILS.escapeHtml(conta.id) + '">Excluir</button>' +
      '</div>' +
    '</article>';
  },

  render: function() {
    var wrap = document.getElementById('contas-pagar-panel');
    var sec = document.getElementById('secao-contas-pagar');
    if (!wrap || typeof CONTAS_PAGAR === 'undefined') return;

    var resumo = CONTAS_PAGAR.resumo();
    var pendentes = CONTAS_PAGAR.listarPendentes().sort(function(a, b) {
      return a.vencimento.localeCompare(b.vencimento);
    });

    var mesNome = new Date(this._anoView, this._mesView - 1, 1)
      .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    mesNome = mesNome.charAt(0).toUpperCase() + mesNome.slice(1);

    var html =
      '<div class="cp-kpis">' +
        '<div class="cp-kpi"><span class="cp-kpi-label">Pendentes</span><span class="cp-kpi-val">' + resumo.pendentes + '</span></div>' +
        '<div class="cp-kpi cp-kpi--warn"><span class="cp-kpi-label">Vencidas</span><span class="cp-kpi-val">' + resumo.vencidas + '</span></div>' +
        '<div class="cp-kpi"><span class="cp-kpi-label">Total do mês</span><span class="cp-kpi-val">' + UTILS.formatarMoeda(resumo.totalMes) + '</span></div>' +
      '</div>' +
      '<div class="cp-cal-header">' +
        '<button type="button" class="cp-cal-nav" data-action="conta-mes-prev" aria-label="Mês anterior">' + this._icon('chevron-left') + '</button>' +
        '<span class="cp-cal-title">' + UTILS.escapeHtml(mesNome) + '</span>' +
        '<button type="button" class="cp-cal-nav" data-action="conta-mes-next" aria-label="Próximo mês">' + this._icon('chevron-right') + '</button>' +
      '</div>' +
      this._renderCalendario(this._mesView, this._anoView);

    if (pendentes.length === 0) {
      html += '<div class="cp-empty"><p>Nenhuma conta pendente.</p><button type="button" class="btn-primario" data-action="conta-nova">Adicionar conta</button></div>';
    } else {
      html += '<div class="cp-list">' + pendentes.map(function(c) {
        return INIT_CONTAS_PAGAR._renderItem(c);
      }).join('') + '</div>';
    }

    wrap.innerHTML = html;
    if (typeof renderLucideIconsNow === 'function') renderLucideIconsNow(wrap);
  },

  renderResumo: function() {
    var el = document.getElementById('dashboard-contas-resumo');
    if (!el || typeof CONTAS_PAGAR === 'undefined') return;
    var urgentes = CONTAS_PAGAR.listarPendentes()
      .sort(function(a, b) { return a.vencimento.localeCompare(b.vencimento); })
      .slice(0, 3);
    if (urgentes.length === 0) {
      el.innerHTML = '<p class="cp-resumo-empty">Nenhuma conta pendente. <button type="button" class="secao-link" data-action="conta-nova">Adicionar</button></p>';
      return;
    }
    el.innerHTML = urgentes.map(function(c) {
      var sit = CONTAS_PAGAR.situacao(c);
      return '<div class="cp-resumo-item cp-item--' + sit + '">' +
        '<span>' + UTILS.escapeHtml(c.descricao) + '</span>' +
        '<strong>' + UTILS.formatarMoeda(c.valor) + '</strong>' +
      '</div>';
    }).join('');
    if (typeof renderLucideIconsNow === 'function') renderLucideIconsNow(el);
  },

  abrirFormNova: function() {
    var hoje = new Date();
    var defaultDate = [
      hoje.getFullYear(),
      String(hoje.getMonth() + 1).padStart(2, '0'),
      String(hoje.getDate()).padStart(2, '0')
    ].join('-');

    var cats = (CONFIG.CATEGORIAS_DESPESA_SLUGS || []).slice(0, 12);
    var catOpts = cats.map(function(c) {
      return '<option value="' + c + '">' + (CONFIG.getCatLabel ? CONFIG.getCatLabel(c) : c) + '</option>';
    }).join('');

    var html =
      '<div class="meta-form">' +
        '<label class="form-label" for="conta-desc">Descrição</label>' +
        '<input type="text" id="conta-desc" class="form-input" placeholder="Ex: Aluguel, Internet" maxlength="80">' +
        '<label class="form-label" for="conta-valor">Valor (R$)</label>' +
        '<input type="text" id="conta-valor" class="form-input" placeholder="0,00" inputmode="numeric">' +
        '<label class="form-label" for="conta-venc">Vencimento</label>' +
        '<input type="date" id="conta-venc" class="form-input" value="' + defaultDate + '">' +
        '<label class="form-label" for="conta-cat">Categoria</label>' +
        '<select id="conta-cat" class="form-input">' + catOpts + '</select>' +
        '<label class="form-check"><input type="checkbox" id="conta-recorrente"> Conta mensal (recorrente)</label>' +
      '</div>';

    var self = this;
    INIT_MODALS.fpAlert(html, { trustedHtml: true, title: 'Nova conta a pagar' });
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
      var raw = document.getElementById('conta-valor').value.replace(/\./g, '').replace(',', '.');
      CONTAS_PAGAR.criar({
        descricao: document.getElementById('conta-desc').value,
        valor: parseFloat(raw),
        vencimento: document.getElementById('conta-venc').value,
        categoria: document.getElementById('conta-cat').value,
        recorrente: document.getElementById('conta-recorrente').checked
      });
      overlay.remove();
      UTILS.mostrarToast('Conta adicionada!', 'success');
      this.render();
      this.renderResumo();
      if (typeof RENDER !== 'undefined' && RENDER.init) RENDER.init();
    } catch (e) {
      UTILS.mostrarToast(e.message || 'Erro ao salvar', 'error');
    }
  },

  confirmarPagamento: function(id) {
    var conta = CONTAS_PAGAR.obter(id);
    if (!conta) return;
    var self = this;
    var msg = 'Marcar "' + conta.descricao + '" como paga e registrar despesa de ' + UTILS.formatarMoeda(conta.valor) + '?';
    var onOk = function() {
      try {
        CONTAS_PAGAR.marcarPago(id, true);
        UTILS.mostrarToast(conta.recorrente ? 'Pago! Próximo vencimento atualizado.' : 'Conta paga!', 'success');
        self.render();
        self.renderResumo();
        if (typeof RENDER !== 'undefined' && RENDER.init) RENDER.init();
      } catch (e) {
        UTILS.mostrarToast(e.message || 'Erro', 'error');
      }
    };
    if (typeof INIT_MODALS !== 'undefined' && INIT_MODALS.confirm) {
      INIT_MODALS.confirm(msg, onOk);
    } else if (window.confirm(msg)) onOk();
  },

  confirmarExcluir: function(id) {
    var conta = CONTAS_PAGAR.obter(id);
    if (!conta) return;
    var self = this;
    var msg = 'Excluir "' + conta.descricao + '"?';
    var fn = function() {
      CONTAS_PAGAR.excluir(id);
      UTILS.mostrarToast('Conta removida', 'info');
      self.render();
      self.renderResumo();
    };
    if (typeof INIT_MODALS !== 'undefined' && INIT_MODALS.confirm) INIT_MODALS.confirm(msg, fn);
    else if (window.confirm(msg)) fn();
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = INIT_CONTAS_PAGAR;
}
