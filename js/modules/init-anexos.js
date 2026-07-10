/**
 * init-anexos.js — UI de anexos em transações
 */
const INIT_ANEXOS = {
  _bound: false,
  _pendentes: [],
  _transacaoAtual: null,
  _salvosAtual: [],

  init: function() {
    if (this._bound) return;
    this._bound = true;
    if (typeof ANEXOS !== 'undefined') ANEXOS.init();

    var self = this;
    document.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-action]');
      if (!btn) return;
      var action = btn.dataset.action;
      if (action === 'anexo-adicionar') {
        e.preventDefault();
        self._abrirSeletor();
      } else if (action === 'anexo-remover-pendente') {
        e.preventDefault();
        self._removerPendente(parseInt(btn.dataset.idx, 10));
      } else if (action === 'anexo-remover-salvo') {
        e.preventDefault();
        self._removerSalvo(btn.dataset.anexoId);
      } else if (action === 'anexo-ver') {
        e.preventDefault();
        e.stopPropagation();
        self.abrirVisualizador(btn.dataset.transacaoId);
      } else if (action === 'anexo-abrir') {
        e.preventDefault();
        self._abrirAnexo(btn.dataset.anexoId);
      }
    });

    var input = document.getElementById('anexo-file-input');
    if (input) {
      input.addEventListener('change', function(ev) {
        var files = ev.target.files;
        if (!files) return;
        for (var i = 0; i < files.length; i++) self.adicionarPendente(files[i]);
        input.value = '';
      });
    }
  },

  botaoVerHtml: function(transacaoId, count) {
    if (!count) return '';
    return '<button type="button" class="btn-anexo" data-action="anexo-ver" data-transacao-id="' +
      UTILS.escapeHtml(String(transacaoId)) + '" title="Ver anexo" aria-label="Ver anexo (' + count + ')">' +
      '<i data-lucide="paperclip" aria-hidden="true"></i></button>';
  },

  adicionarPendente: function(file) {
    if (!file) return;
    var validacao = ANEXOS.validarArquivo(file);
    if (!validacao.valido) {
      UTILS.mostrarToast(validacao.erro, 'error');
      return;
    }
    var total = this._pendentes.length;
    if (this._transacaoAtual) {
      ANEXOS.listarMeta(this._transacaoAtual).then(function(salvos) {
        if (salvos.length + total >= ANEXOS.MAX_POR_TX) {
          UTILS.mostrarToast('Máximo de ' + ANEXOS.MAX_POR_TX + ' anexos por transação', 'warning');
          return;
        }
        INIT_ANEXOS._pendentes.push(file);
        INIT_ANEXOS._renderPreview();
      });
    } else {
      if (total >= ANEXOS.MAX_POR_TX) {
        UTILS.mostrarToast('Máximo de ' + ANEXOS.MAX_POR_TX + ' anexos por transação', 'warning');
        return;
      }
      this._pendentes.push(file);
      this._renderPreview();
    }
  },

  limparPendentes: function() {
    this._pendentes = [];
    this._transacaoAtual = null;
    this._salvosAtual = [];
    this._renderPreview();
  },

  carregarParaTransacao: function(transacaoId) {
    var self = this;
    this._transacaoAtual = transacaoId;
    this._pendentes = [];
    ANEXOS.listarMeta(transacaoId).then(function(lista) {
      self._salvosAtual = lista;
      self._renderPreview();
    });
  },

  salvarPendentes: function(transacaoId) {
    var self = this;
    if (!this._pendentes.length) return Promise.resolve();
    var chain = Promise.resolve();
    this._pendentes.forEach(function(file) {
      chain = chain.then(function() { return ANEXOS.salvar(transacaoId, file); });
    });
    return chain.then(function() {
      self._pendentes = [];
      self._transacaoAtual = transacaoId;
      return ANEXOS.listarMeta(transacaoId);
    }).then(function(lista) {
      self._salvosAtual = lista;
      self._renderPreview();
      if (lista.length > 0) UTILS.mostrarToast('Comprovante anexado', 'success');
    }).catch(function(err) {
      UTILS.mostrarToast(err.message || 'Erro ao salvar anexo', 'error');
    });
  },

  _abrirSeletor: function() {
    var input = document.getElementById('anexo-file-input');
    if (input) input.click();
  },

  _removerPendente: function(idx) {
    if (idx < 0 || idx >= this._pendentes.length) return;
    this._pendentes.splice(idx, 1);
    this._renderPreview();
  },

  _removerSalvo: function(anexoId) {
    var self = this;
    ANEXOS.excluir(anexoId).then(function() {
      if (self._transacaoAtual) {
        return ANEXOS.listarMeta(self._transacaoAtual);
      }
      return [];
    }).then(function(lista) {
      self._salvosAtual = lista;
      self._renderPreview();
      UTILS.mostrarToast('Anexo removido', 'info');
    });
  },

  _renderPreview: function() {
    var el = document.getElementById('anexo-preview-list');
    if (!el) return;
    var html = '';
    var salvos = this._salvosAtual || [];

    salvos.forEach(function(a) {
      html += '<div class="anexo-chip anexo-chip--salvo">' +
        '<i data-lucide="paperclip" aria-hidden="true"></i> ' +
        '<span>' + UTILS.escapeHtml(a.nome) + '</span>' +
        '<button type="button" class="anexo-chip-remove" data-action="anexo-remover-salvo" data-anexo-id="' +
          UTILS.escapeHtml(a.id) + '" aria-label="Remover anexo">×</button>' +
      '</div>';
    });

    this._pendentes.forEach(function(f, i) {
      html += '<div class="anexo-chip anexo-chip--pendente">' +
        '<i data-lucide="clock" aria-hidden="true"></i> ' +
        '<span>' + UTILS.escapeHtml(f.name || 'Novo arquivo') + '</span>' +
        '<button type="button" class="anexo-chip-remove" data-action="anexo-remover-pendente" data-idx="' + i +
          '" aria-label="Remover">×</button>' +
      '</div>';
    });

    el.innerHTML = html || '<span class="anexo-hint">Nenhum comprovante anexado</span>';
    if (typeof renderLucideIconsNow === 'function') renderLucideIconsNow(el);
  },

  abrirVisualizador: function(transacaoId) {
    var self = this;
    ANEXOS.listarMeta(transacaoId).then(function(lista) {
      if (!lista.length) {
        UTILS.mostrarToast('Nenhum anexo nesta transação', 'info');
        return;
      }
      self._mostrarModal(lista);
    });
  },

  _mostrarModal: function(lista) {
    var html = '<div class="anexo-viewer-list">';
    lista.forEach(function(a) {
      var icon = a.mimeType === 'application/pdf' ? 'file-text' : 'image';
      html += '<button type="button" class="anexo-viewer-item" data-action="anexo-abrir" data-anexo-id="' +
        UTILS.escapeHtml(a.id) + '">' +
        '<i data-lucide="' + icon + '" aria-hidden="true"></i>' +
        '<span>' + UTILS.escapeHtml(a.nome) + '</span>' +
        '<small>' + INIT_ANEXOS._formatBytes(a.tamanho) + '</small>' +
      '</button>';
    });
    html += '</div>';
    INIT_MODALS.fpAlert(html, { trustedHtml: true, title: 'Comprovantes' });
    setTimeout(function() {
      if (typeof renderLucideIconsNow === 'function') renderLucideIconsNow(document.querySelector('.modal-overlay'));
    }, 50);
  },

  _abrirAnexo: function(anexoId) {
    ANEXOS.obter(anexoId).then(function(reg) {
      if (!reg || !reg.blob) {
        UTILS.mostrarToast('Anexo não encontrado', 'error');
        return;
      }
      var blob = new Blob([reg.blob], { type: reg.mimeType });
      var url = URL.createObjectURL(blob);
      if (reg.mimeType === 'application/pdf') {
        window.open(url, '_blank', 'noopener');
      } else {
        var html = '<div class="anexo-img-wrap"><img src="' + url + '" alt="' + UTILS.escapeHtml(reg.nome) + '"></div>';
        INIT_MODALS.fpAlert(html, { trustedHtml: true, title: reg.nome });
      }
      setTimeout(function() { URL.revokeObjectURL(url); }, 60000);
    });
  },

  _formatBytes: function(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    return Math.round(bytes / 1024) + ' KB';
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = INIT_ANEXOS;
}
