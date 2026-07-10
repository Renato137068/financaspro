/**
 * init-patrimonio.js — UI de patrimônio líquido
 */
const INIT_PATRIMONIO = {
  _bound: false,

  init: function() {
    if (this._bound) return;
    this._bound = true;
    var self = this;
    document.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-action]');
      if (!btn) return;
      var action = btn.dataset.action;
      if (action === 'patrimonio-ativo-nova') { e.preventDefault(); self.abrirFormAtivo(); }
      else if (action === 'patrimonio-divida-nova') { e.preventDefault(); self.abrirFormDivida(); }
      else if (action === 'patrimonio-ativo-editar') self.abrirFormAtivo(btn.dataset.patrimonioId);
      else if (action === 'patrimonio-divida-editar') self.abrirFormDivida(btn.dataset.patrimonioId);
      else if (action === 'patrimonio-ativo-excluir') self.confirmarExcluirAtivo(btn.dataset.patrimonioId);
      else if (action === 'patrimonio-divida-excluir') self.confirmarExcluirDivida(btn.dataset.patrimonioId);
      else if (action === 'patrimonio-importar-conta') {
        self.abrirFormAtivo({
          nome: btn.dataset.nome,
          tipo: btn.dataset.tipo,
          contaId: btn.dataset.contaId
        });
      }
    });
  },

  _icon: function(name) {
    if (typeof lucideIconHtml === 'function') return lucideIconHtml(name || 'wallet');
    return '<i data-lucide="' + (name || 'wallet') + '" aria-hidden="true"></i>';
  },

  _renderAtivo: function(a) {
    return '<article class="pat-item pat-item--ativo">' +
      '<div class="pat-item-main">' +
        '<span class="pat-item-icon">' + this._icon(PATRIMONIO.iconeAtivo(a.tipo)) + '</span>' +
        '<div class="pat-item-info">' +
          '<h4 class="pat-item-title">' + UTILS.escapeHtml(a.nome) + '</h4>' +
          '<span class="pat-item-meta">' + UTILS.escapeHtml(PATRIMONIO.tipoAtivoLabel(a.tipo)) + '</span>' +
        '</div>' +
        '<span class="pat-item-valor pat-item-valor--positivo">' + UTILS.formatarMoeda(a.valor) + '</span>' +
      '</div>' +
      '<div class="pat-item-actions">' +
        '<button type="button" class="btn-ghost btn-sm" data-action="patrimonio-ativo-editar" data-patrimonio-id="' + UTILS.escapeHtml(a.id) + '">Editar</button>' +
        '<button type="button" class="btn-ghost btn-sm pat-btn-danger" data-action="patrimonio-ativo-excluir" data-patrimonio-id="' + UTILS.escapeHtml(a.id) + '">Excluir</button>' +
      '</div>' +
    '</article>';
  },

  _renderDivida: function(d) {
    return '<article class="pat-item pat-item--divida">' +
      '<div class="pat-item-main">' +
        '<span class="pat-item-icon pat-item-icon--divida">' + this._icon(PATRIMONIO.iconeDivida(d.tipo)) + '</span>' +
        '<div class="pat-item-info">' +
          '<h4 class="pat-item-title">' + UTILS.escapeHtml(d.nome) + '</h4>' +
          '<span class="pat-item-meta">' + UTILS.escapeHtml(PATRIMONIO.tipoDividaLabel(d.tipo)) + '</span>' +
        '</div>' +
        '<span class="pat-item-valor pat-item-valor--negativo">−' + UTILS.formatarMoeda(d.valor) + '</span>' +
      '</div>' +
      '<div class="pat-item-actions">' +
        '<button type="button" class="btn-ghost btn-sm" data-action="patrimonio-divida-editar" data-patrimonio-id="' + UTILS.escapeHtml(d.id) + '">Editar</button>' +
        '<button type="button" class="btn-ghost btn-sm pat-btn-danger" data-action="patrimonio-divida-excluir" data-patrimonio-id="' + UTILS.escapeHtml(d.id) + '">Excluir</button>' +
      '</div>' +
    '</article>';
  },

  render: function() {
    var el = document.getElementById('patrimonio-panel');
    if (!el || typeof PATRIMONIO === 'undefined') return;

    var liquido = PATRIMONIO.patrimonioLiquido();
    var ativos = PATRIMONIO.listarAtivos();
    var dividas = PATRIMONIO.listarDividas();
    var sugestoes = PATRIMONIO.sugerirDeContas();

    var html = '<div class="pat-hero' + (liquido >= 0 ? ' pat-hero--positivo' : ' pat-hero--negativo') + '">' +
      '<span class="pat-hero-label">Patrimônio líquido</span>' +
      '<strong class="pat-hero-valor">' + UTILS.formatarMoeda(liquido) + '</strong>' +
      '<div class="pat-hero-breakdown">' +
        '<span>Ativos: ' + UTILS.formatarMoeda(PATRIMONIO.totalAtivos()) + '</span>' +
        '<span>Dívidas: ' + UTILS.formatarMoeda(PATRIMONIO.totalDividas()) + '</span>' +
      '</div>' +
    '</div>';

    if (sugestoes.length > 0) {
      html += '<div class="pat-sugestoes"><p class="pat-sugestoes-title">Contas do app sem saldo cadastrado:</p>';
      sugestoes.forEach(function(s) {
        html += '<button type="button" class="pat-sugestao-chip" data-action="patrimonio-importar-conta" ' +
          'data-nome="' + UTILS.escapeHtml(s.nome) + '" data-tipo="' + UTILS.escapeHtml(s.tipo) + '" ' +
          'data-conta-id="' + UTILS.escapeHtml(s.contaId) + '">+ ' + UTILS.escapeHtml(s.nome) + '</button>';
      });
      html += '</div>';
    }

    html += '<div class="pat-colunas">' +
      '<div class="pat-coluna">' +
        '<div class="pat-coluna-header">' +
          '<h4><i data-lucide="trending-up" aria-hidden="true"></i> Ativos</h4>' +
          '<button type="button" class="btn-secundario btn-sm" data-action="patrimonio-ativo-nova">Adicionar</button>' +
        '</div>' +
        (ativos.length === 0
          ? '<p class="pat-empty">Cadastre contas, investimentos e outros bens.</p>'
          : '<div class="pat-list">' + ativos.map(function(a) { return INIT_PATRIMONIO._renderAtivo(a); }).join('') + '</div>') +
      '</div>' +
      '<div class="pat-coluna">' +
        '<div class="pat-coluna-header">' +
          '<h4><i data-lucide="trending-down" aria-hidden="true"></i> Dívidas</h4>' +
          '<button type="button" class="btn-secundario btn-sm" data-action="patrimonio-divida-nova">Adicionar</button>' +
        '</div>' +
        (dividas.length === 0
          ? '<p class="pat-empty">Empréstimos, financiamentos e cartões.</p>'
          : '<div class="pat-list">' + dividas.map(function(d) { return INIT_PATRIMONIO._renderDivida(d); }).join('') + '</div>') +
      '</div>' +
    '</div>';

    el.innerHTML = html;
    if (typeof renderLucideIconsNow === 'function') renderLucideIconsNow(el);
  },

  renderResumo: function() {
    var el = document.getElementById('dashboard-patrimonio-resumo');
    var sec = document.getElementById('secao-patrimonio-resumo');
    if (!el || typeof PATRIMONIO === 'undefined') return;

    var ativos = PATRIMONIO.listarAtivos();
    var dividas = PATRIMONIO.listarDividas();
    var vazio = ativos.length === 0 && dividas.length === 0;
    if (sec) sec.style.display = vazio ? 'none' : '';

    if (vazio) {
      el.innerHTML = '';
      return;
    }

    var liquido = PATRIMONIO.patrimonioLiquido();
    el.innerHTML =
      '<div class="pat-resumo-hero' + (liquido >= 0 ? ' pat-resumo-hero--positivo' : ' pat-resumo-hero--negativo') + '">' +
        '<span>Patrimônio líquido</span>' +
        '<strong>' + UTILS.formatarMoeda(liquido) + '</strong>' +
      '</div>' +
      '<div class="pat-resumo-grid">' +
        '<div><span>Ativos</span><strong>' + UTILS.formatarMoeda(PATRIMONIO.totalAtivos()) + '</strong></div>' +
        '<div><span>Dívidas</span><strong>' + UTILS.formatarMoeda(PATRIMONIO.totalDividas()) + '</strong></div>' +
      '</div>';
  },

  _optionsAtivo: function(selected) {
    return PATRIMONIO.TIPOS_ATIVO.map(function(t) {
      return '<option value="' + t + '"' + (selected === t ? ' selected' : '') + '>' +
        UTILS.escapeHtml(PATRIMONIO.tipoAtivoLabel(t)) + '</option>';
    }).join('');
  },

  _optionsDivida: function(selected) {
    return PATRIMONIO.TIPOS_DIVIDA.map(function(t) {
      return '<option value="' + t + '"' + (selected === t ? ' selected' : '') + '>' +
        UTILS.escapeHtml(PATRIMONIO.tipoDividaLabel(t)) + '</option>';
    }).join('');
  },

  abrirFormAtivo: function(presetOrId) {
    var preset = presetOrId;
    var editId = null;
    if (typeof presetOrId === 'string') {
      var existente = PATRIMONIO.obterAtivo(presetOrId);
      if (existente) {
        editId = presetOrId;
        preset = existente;
      }
    }
    preset = preset || {};

    var html =
      '<div class="meta-form">' +
        '<label class="form-label" for="pat-ativo-nome">Nome</label>' +
        '<input type="text" id="pat-ativo-nome" class="form-input" placeholder="Nubank, CDB, apartamento..." value="' + UTILS.escapeHtml(preset.nome || '') + '">' +
        '<label class="form-label" for="pat-ativo-tipo">Tipo</label>' +
        '<select id="pat-ativo-tipo" class="form-input">' + this._optionsAtivo(preset.tipo || 'corrente') + '</select>' +
        '<label class="form-label" for="pat-ativo-valor">Saldo atual (R$)</label>' +
        '<input type="text" id="pat-ativo-valor" class="form-input" placeholder="0,00" inputmode="numeric" value="' +
          (preset.valor !== undefined ? String(preset.valor).replace('.', ',') : '') + '">' +
        '<input type="hidden" id="pat-ativo-conta-id" value="' + UTILS.escapeHtml(preset.contaId || '') + '">' +
      '</div>';

    var self = this;
    INIT_MODALS.fpAlert(html, { trustedHtml: true, title: editId ? 'Editar ativo' : 'Novo ativo' });
    setTimeout(function() {
      var ov = document.querySelector('.modal-overlay');
      if (!ov) return;
      var ok = ov.querySelector('.modal-btn');
      if (!ok) return;
      ok.textContent = 'Salvar';
      ok.onclick = function() { self._salvarAtivo(ov, editId); };
    }, 80);
  },

  _salvarAtivo: function(overlay, editId) {
    try {
      var raw = document.getElementById('pat-ativo-valor').value.replace(/\./g, '').replace(',', '.');
      var dados = {
        nome: document.getElementById('pat-ativo-nome').value,
        tipo: document.getElementById('pat-ativo-tipo').value,
        valor: parseFloat(raw) || 0,
        contaId: document.getElementById('pat-ativo-conta-id').value || null
      };
      if (editId) PATRIMONIO.atualizarAtivo(editId, dados);
      else PATRIMONIO.criarAtivo(dados);
      overlay.remove();
      UTILS.mostrarToast(editId ? 'Ativo atualizado!' : 'Ativo adicionado!', 'success');
      this.render();
      this.renderResumo();
    } catch (e) {
      UTILS.mostrarToast(e.message || 'Erro', 'error');
    }
  },

  abrirFormDivida: function(presetOrId) {
    var preset = presetOrId;
    var editId = null;
    if (typeof presetOrId === 'string') {
      var existente = PATRIMONIO.obterDivida(presetOrId);
      if (existente) {
        editId = presetOrId;
        preset = existente;
      }
    }
    preset = preset || {};

    var html =
      '<div class="meta-form">' +
        '<label class="form-label" for="pat-div-nome">Nome</label>' +
        '<input type="text" id="pat-div-nome" class="form-input" placeholder="Financiamento, empréstimo..." value="' + UTILS.escapeHtml(preset.nome || '') + '">' +
        '<label class="form-label" for="pat-div-tipo">Tipo</label>' +
        '<select id="pat-div-tipo" class="form-input">' + this._optionsDivida(preset.tipo || 'emprestimo') + '</select>' +
        '<label class="form-label" for="pat-div-valor">Saldo devedor (R$)</label>' +
        '<input type="text" id="pat-div-valor" class="form-input" placeholder="0,00" inputmode="numeric" value="' +
          (preset.valor !== undefined ? String(preset.valor).replace('.', ',') : '') + '">' +
      '</div>';

    var self = this;
    INIT_MODALS.fpAlert(html, { trustedHtml: true, title: editId ? 'Editar dívida' : 'Nova dívida' });
    setTimeout(function() {
      var ov = document.querySelector('.modal-overlay');
      if (!ov) return;
      var ok = ov.querySelector('.modal-btn');
      if (!ok) return;
      ok.textContent = 'Salvar';
      ok.onclick = function() { self._salvarDivida(ov, editId); };
    }, 80);
  },

  _salvarDivida: function(overlay, editId) {
    try {
      var raw = document.getElementById('pat-div-valor').value.replace(/\./g, '').replace(',', '.');
      var dados = {
        nome: document.getElementById('pat-div-nome').value,
        tipo: document.getElementById('pat-div-tipo').value,
        valor: parseFloat(raw)
      };
      if (editId) PATRIMONIO.atualizarDivida(editId, dados);
      else PATRIMONIO.criarDivida(dados);
      overlay.remove();
      UTILS.mostrarToast(editId ? 'Dívida atualizada!' : 'Dívida adicionada!', 'success');
      this.render();
      this.renderResumo();
    } catch (e) {
      UTILS.mostrarToast(e.message || 'Erro', 'error');
    }
  },

  confirmarExcluirAtivo: function(id) {
    var a = PATRIMONIO.obterAtivo(id);
    if (!a) return;
    var self = this;
    var msg = 'Excluir ativo "' + a.nome + '"?';
    var fn = function() {
      PATRIMONIO.excluirAtivo(id);
      self.render();
      self.renderResumo();
      UTILS.mostrarToast('Ativo removido', 'info');
    };
    if (typeof INIT_MODALS !== 'undefined' && INIT_MODALS.confirm) INIT_MODALS.confirm(msg, fn);
    else if (window.confirm(msg)) fn();
  },

  confirmarExcluirDivida: function(id) {
    var d = PATRIMONIO.obterDivida(id);
    if (!d) return;
    var self = this;
    var msg = 'Excluir dívida "' + d.nome + '"?';
    var fn = function() {
      PATRIMONIO.excluirDivida(id);
      self.render();
      self.renderResumo();
      UTILS.mostrarToast('Dívida removida', 'info');
    };
    if (typeof INIT_MODALS !== 'undefined' && INIT_MODALS.confirm) INIT_MODALS.confirm(msg, fn);
    else if (window.confirm(msg)) fn();
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = INIT_PATRIMONIO;
}
