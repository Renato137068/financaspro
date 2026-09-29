/**
 * init-open-finance.js — UI de conexões Open Finance (sandbox)
 *
 * ES Module (ADR 0005): chega sob demanda no chunk 'conta'
 * (js/esm/chunks/conta.js, via LAZY.load), que o publica em window.
 */

import { UTILS } from '../core/utils.js';
import { OPEN_FINANCE } from '../open-finance.js';

const INIT_OPEN_FINANCE = {
  _overlay: null,
  _focusTrap: null,

  init: function() {
    INIT_OPEN_FINANCE.refreshCard();
    if (!INIT_OPEN_FINANCE._ouvindoTelas) {
      // Conexões chega com o chunk 'config' (js/core/telas.js).
      INIT_OPEN_FINANCE._ouvindoTelas = true;
      var self = INIT_OPEN_FINANCE;
      document.addEventListener('fp:tela-carregada', function(e) {
        if (e.detail.nome === 'config-conexoes') self.refreshCard();
      });
    }
  },

  refreshCard: function() {
    var el = document.getElementById('perfil-open-finance-status');
    if (!el || typeof OPEN_FINANCE === 'undefined') return;
    el.textContent = OPEN_FINANCE.getStatusLabel();
  },

  abrir: function() {
    var self = INIT_OPEN_FINANCE;
    INIT_OPEN_FINANCE._fechar();

    var openModal = function() {
      self._buildModal();
    };

    if (typeof OPEN_FINANCE !== 'undefined' && OPEN_FINANCE.refreshFromApi) {
      OPEN_FINANCE.refreshFromApi().then(openModal).catch(openModal);
      return;
    }
    openModal();
  },

  _buildModal: function() {
    var self = INIT_OPEN_FINANCE;
    var ov = document.createElement('div');
    ov.className = 'modal-overlay of-overlay';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-labelledby', 'of-title');
    ov.innerHTML =
      '<div class="modal-box of-modal">' +
        '<button type="button" class="of-close" data-action="of-fechar" aria-label="Fechar">&times;</button>' +
        '<div class="of-header">' +
          '<span class="of-badge"><i data-lucide="landmark" aria-hidden="true"></i> Open Finance</span>' +
          '<h2 id="of-title">Conectar contas</h2>' +
          '<p class="of-lead">Importe transações automaticamente. Sandbox para testes; Belvo para bancos reais (quando configurado no servidor).</p>' +
        '</div>' +
        '<div class="of-actions" id="of-actions">' +
          '<button type="button" class="btn-primario" data-action="of-conectar-sandbox">' +
            '<i data-lucide="plus" aria-hidden="true"></i> Conectar banco demo' +
          '</button>' +
        '</div>' +
        '<div class="of-connections" id="of-connections"></div>' +
        '<p class="of-footnote">Na nuvem, conexões são salvas no servidor. Belvo requer credenciais no backend.</p>' +
      '</div>';

    document.body.appendChild(ov);
    INIT_OPEN_FINANCE._overlay = ov;

    ov.addEventListener('click', function(e) {
      if (e.target === ov) self._fechar();
    });
    ov.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-action]');
      if (!btn) return;
      var action = btn.dataset.action;
      if (action === 'of-fechar') self._fechar();
      if (action === 'of-conectar-sandbox') self._conectarSandbox(ov);
      if (action === 'of-conectar-belvo') self._conectarBelvo(ov);
      if (action === 'of-sync') self._sync(btn.dataset.id, ov);
      if (action === 'of-desconectar') self._desconectar(btn.dataset.id, ov);
    });
    ov.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        self._fechar();
      }
    });

    if (typeof FocusTrap !== 'undefined') {
      INIT_OPEN_FINANCE._focusTrap = new FocusTrap(ov);
      INIT_OPEN_FINANCE._focusTrap.activate();
    }

    if (typeof renderLucideIconsNow === 'function') renderLucideIconsNow(ov);
    INIT_OPEN_FINANCE._renderConnections(ov);
    INIT_OPEN_FINANCE._renderProviderActions(ov);
  },

  _renderProviderActions: function(ov) {
    var box = ov.querySelector('#of-actions');
    if (!box || typeof OPEN_FINANCE === 'undefined') return;

    OPEN_FINANCE.fetchProviders().then(function(providers) {
      if (!providers || !providers.belvo) return;
      if (box.querySelector('[data-action="of-conectar-belvo"]')) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-secundario';
      btn.setAttribute('data-action', 'of-conectar-belvo');
      btn.innerHTML = '<i data-lucide="building-2" aria-hidden="true"></i> Conectar banco real (Belvo)';
      box.appendChild(btn);
      if (typeof renderLucideIconsNow === 'function') renderLucideIconsNow(box);
    });
  },

  _conectarBelvo: function(ov) {
    if (typeof OPEN_FINANCE === 'undefined') return;
    var self = INIT_OPEN_FINANCE;
    OPEN_FINANCE.connectBelvo().then(function() {
      if (typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
        UTILS.mostrarToast('Complete a conexão na janela Belvo.', 'info');
      }
    }).catch(function(err) {
      if (typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
        UTILS.mostrarToast(err.message || 'Falha ao abrir Belvo.', 'error');
      }
    });

    var poll = setInterval(function() {
      if (!OPEN_FINANCE._belvoPopup || OPEN_FINANCE._belvoPopup.closed) {
        clearInterval(poll);
        OPEN_FINANCE.refreshFromApi().then(function() {
          self.refreshCard();
          self._renderConnections(ov);
        });
      }
    }, 1500);
  },

  _conectarSandbox: function(ov) {
    if (typeof OPEN_FINANCE === 'undefined') return;
    var self = INIT_OPEN_FINANCE;
    OPEN_FINANCE.connectSandbox('Banco Demo').then(function() {
      self.refreshCard();
      self._renderConnections(ov);
      if (typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
        UTILS.mostrarToast('Conta demo conectada. Toque em Sincronizar para importar.', 'success');
      }
    }).catch(function(err) {
      if (typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
        UTILS.mostrarToast(err.message || 'Falha ao conectar.', 'error');
      }
    });
  },

  _sync: function(connectionId, ov) {
    if (!connectionId || typeof OPEN_FINANCE === 'undefined') return;
    var self = INIT_OPEN_FINANCE;
    OPEN_FINANCE.syncConnection(connectionId).then(function(result) {
      self.refreshCard();
      self._renderConnections(ov, result);
      if (typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
        UTILS.mostrarToast(
          result.imported + ' importada(s), ' + result.skipped + ' ignorada(s) (duplicadas).',
          result.imported > 0 ? 'success' : 'info'
        );
      }
    }).catch(function(err) {
      if (typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
        UTILS.mostrarToast(err.message || 'Falha ao sincronizar.', 'error');
      }
    });
  },

  _desconectar: function(connectionId, ov) {
    if (!connectionId || typeof OPEN_FINANCE === 'undefined') return;
    var self = INIT_OPEN_FINANCE;
    OPEN_FINANCE.disconnect(connectionId).then(function() {
      self.refreshCard();
      self._renderConnections(ov);
      if (typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
        UTILS.mostrarToast('Conta desconectada.', 'info');
      }
    });
  },

  _renderConnections: function(ov, lastResult) {
    var box = ov.querySelector('#of-connections');
    if (!box || typeof OPEN_FINANCE === 'undefined') return;

    var conns = OPEN_FINANCE.listConnections();
    if (!conns.length) {
      box.innerHTML = '<p class="of-empty">Nenhuma conta conectada ainda.</p>';
      return;
    }

    var html = '';
    conns.forEach(function(conn) {
      var syncLabel = conn.lastSync
        ? 'Última sync: ' + new Date(conn.lastSync).toLocaleString('pt-BR')
        : 'Nunca sincronizado';
      var providerLabel = conn.provider === 'belvo' ? 'Belvo' : 'Demo';
      html +=
        '<div class="of-connection-card">' +
          '<div class="of-connection-info">' +
            '<strong>' + UTILS.escapeHtml(conn.bankName || 'Conta') + '</strong>' +
            '<span class="of-connection-meta">' + UTILS.escapeHtml(providerLabel + ' · ' + syncLabel) + '</span>' +
          '</div>' +
          '<div class="of-connection-actions">' +
            '<button type="button" class="btn-secundario btn-sm" data-action="of-sync" data-id="' + UTILS.escapeHtml(conn.id) + '">Sincronizar</button>' +
            '<button type="button" class="btn-ghost btn-sm" data-action="of-desconectar" data-id="' + UTILS.escapeHtml(conn.id) + '">Desconectar</button>' +
          '</div>' +
        '</div>';
    });

    if (lastResult) {
      html += '<p class="of-sync-result" role="status">' +
        lastResult.imported + ' transação(ões) importada(s), ' + lastResult.skipped + ' duplicada(s).</p>';
    }

    box.innerHTML = html;
    if (typeof renderLucideIconsNow === 'function') renderLucideIconsNow(box);
  },

  _fechar: function() {
    if (INIT_OPEN_FINANCE._focusTrap) {
      INIT_OPEN_FINANCE._focusTrap.deactivate();
      INIT_OPEN_FINANCE._focusTrap = null;
    }
    if (INIT_OPEN_FINANCE._overlay) {
      INIT_OPEN_FINANCE._overlay.remove();
      INIT_OPEN_FINANCE._overlay = null;
    }
  },
};

export { INIT_OPEN_FINANCE };
export default INIT_OPEN_FINANCE;
