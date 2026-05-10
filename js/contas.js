// FinançasPro — Contas e Cartões
// v11.0 — Depende de: config.js, dados.js, utils.js

var CONTAS = {
  _cache: [],

  init: function() {
    this._cache = DADOS.getContas();
  },

  getAll: function() { return this._cache; },

  getById: function(id) {
    for (var i = 0; i < this._cache.length; i++) {
      if (this._cache[i].id === id) return this._cache[i];
    }
    return null;
  },

  icone: function(tipo) {
    var map = { credito:'💳', debito:'💳', digital:'📱', poupanca:'💰', carteira:'👛', corrente:'🏦' };
    return map[tipo] || '🏦';
  },

  getNome: function(id) {
    var c = this.getById(id);
    if (!c) return '';
    return this.icone(c.tipo) + ' ' + c.nome;
  },

  salvar: function(dados) {
    var lista = DADOS.getContas();
    if (dados.id) {
      for (var i = 0; i < lista.length; i++) {
        if (lista[i].id === dados.id) { lista[i] = dados; break; }
      }
    } else {
      dados.id = UTILS.gerarId();
      lista.push(dados);
    }
    DADOS.salvarContas(lista);
    this._cache = lista;
    if (typeof DADOS._pushContasApi === 'function') {
      DADOS._pushContasApi(dados);
    }
    return dados;
  },

  deletar: function(id) {
    var lista = DADOS.getContas().filter(function(c) { return c.id !== id; });
    DADOS.salvarContas(lista);
    this._cache = lista;
  },

  renderSelect: function(selectId) {
    var sel = document.getElementById(selectId);
    if (!sel) return;
    var val = sel.value;
    var self = this;
    sel.innerHTML = '<option value="">— Sem conta —</option>' +
      this._cache.map(function(c) {
        return '<option value="' + UTILS.escapeHtml(c.id) + '">' +
          self.icone(c.tipo) + ' ' + UTILS.escapeHtml(c.nome) + '</option>';
      }).join('');
    if (val) sel.value = val;
  },

  _listenerAttached: false,

  renderLista: function() {
    var el = document.getElementById('contas-lista');
    if (!el) return;
    if (this._cache.length === 0) {
      el.innerHTML = '<p style="color:var(--text-light);font-size:13px;padding:8px 0">Nenhuma conta cadastrada</p>';
      return;
    }
    var self = this;
    el.innerHTML = this._cache.map(function(c) {
      var ico = self.icone(c.tipo);
      var tag = c.tipo === 'credito' ? 'Cartão Crédito'
              : c.tipo === 'debito' ? 'Cartão Débito'
              : c.tipo === 'poupanca' ? 'Poupança'
              : c.tipo === 'digital' ? 'Conta Digital'
              : c.tipo === 'carteira' ? 'Carteira'
              : 'Conta Corrente';
      var idEsc = UTILS.escapeHtml(c.id);
      return '<div class="conta-item">' +
        '<div class="conta-info">' +
          '<span style="font-size:20px;margin-right:8px">' + ico + '</span>' +
          '<div>' +
            '<strong>' + UTILS.escapeHtml(c.nome) + '</strong>' +
            '<small style="display:block;color:var(--text-light)">' + tag + '</small>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;gap:4px">' +
          '<button class="btn-icon" data-conta-action="editar" data-id="' + idEsc + '" aria-label="Editar">✏️</button>' +
          '<button class="btn-icon" style="color:var(--danger)" data-conta-action="deletar" data-id="' + idEsc + '" aria-label="Excluir">🗑️</button>' +
        '</div>' +
      '</div>';
    }).join('');

    if (!this._listenerAttached) {
      this._listenerAttached = true;
      el.addEventListener('click', function(ev) {
        var btn = ev.target.closest('[data-conta-action]');
        if (!btn) return;
        var id = btn.dataset.id;
        var act = btn.dataset.contaAction;
        if (act === 'editar') CONTAS.abrirModal(id);
        else if (act === 'deletar') CONTAS.confirmarDeletar(id);
      });
    }
  },

  abrirModal: function(id) {
    var c = id ? this.getById(id) : null;
    var old = document.getElementById('modal-conta-ov');
    if (old) old.remove();
    var ov = document.createElement('div');
    ov.id = 'modal-conta-ov';
    ov.className = 'modal-overlay';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.innerHTML =
      '<div class="modal-box">' +
        '<h3 style="margin:0 0 16px;font-size:16px">' + (id ? 'Editar' : 'Nova') + ' Conta / Cartão</h3>' +
        '<div class="form-group">' +
          '<label>Tipo</label>' +
          '<select id="mc-tipo" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:var(--radius-sm)">' +
            '<option value="corrente"' + (c && c.tipo==='corrente' ? ' selected':'') + '>🏦 Conta Corrente</option>' +
            '<option value="poupanca"' + (c && c.tipo==='poupanca' ? ' selected':'') + '>💰 Poupança</option>' +
            '<option value="digital"' + (c && c.tipo==='digital' ? ' selected':'') + '>📱 Conta Digital</option>' +
            '<option value="carteira"' + (c && c.tipo==='carteira' ? ' selected':'') + '>👛 Carteira</option>' +
            '<option value="credito"' + (c && c.tipo==='credito' ? ' selected':'') + '>💳 Cartão de Crédito</option>' +
            '<option value="debito"' + (c && c.tipo==='debito' ? ' selected':'') + '>💳 Cartão de Débito</option>' +
          '</select>' +
        '</div>' +
        '<div class="form-group">' +
          '<label>Nome *</label>' +
          '<input type="text" id="mc-nome" placeholder="Ex: Nubank, Inter, Visa..." value="' +
            (c ? UTILS.escapeHtml(c.nome) : '') + '" style="width:100%">' +
        '</div>' +
        '<div class="modal-actions">' +
          '<button class="btn-cancelar" data-modal-action="cancelar">Cancelar</button>' +
          '<button class="btn-confirmar" data-modal-action="salvar" data-id="' + UTILS.escapeHtml(id||'') + '">Salvar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);
    var inp = document.getElementById('mc-nome');
    if (inp) { inp.focus(); inp.select(); }
    ov.addEventListener('click', function(e) {
      if (e.target === ov) { CONTAS.fecharModal(); return; }
      var btn = e.target.closest('[data-modal-action]');
      if (!btn) return;
      var act = btn.dataset.modalAction;
      if (act === 'cancelar') CONTAS.fecharModal();
      else if (act === 'salvar') CONTAS.salvarModal(btn.dataset.id || '');
    });
    document.addEventListener('keydown', function h(e) {
      if (e.key === 'Escape') { CONTAS.fecharModal(); document.removeEventListener('keydown', h); }
    });
  },

  fecharModal: function() {
    var ov = document.getElementById('modal-conta-ov');
    if (ov) ov.remove();
  },

  salvarModal: function(id) {
    var nomeEl = document.getElementById('mc-nome');
    var tipoEl = document.getElementById('mc-tipo');
    if (!nomeEl || !nomeEl.value.trim()) {
      UTILS.mostrarToast('Informe o nome da conta', 'error');
      return;
    }
    var dados = { nome: nomeEl.value.trim(), tipo: tipoEl ? tipoEl.value : 'corrente' };
    if (id) dados.id = id;
    this.salvar(dados);
    this.fecharModal();
    this.renderLista();
    this.renderSelect('novo-conta');
    UTILS.mostrarToast('Conta salva! 🏦', 'success');
  },

  confirmarDeletar: function(id) {
    var c = this.getById(id);
    if (!c) return;
    fpConfirm('Remover "' + c.nome + '"?', function() {
      CONTAS.deletar(id);
      CONTAS.renderLista();
      CONTAS.renderSelect('novo-conta');
      UTILS.mostrarToast('Conta removida', 'info');
    });
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONTAS;
}
