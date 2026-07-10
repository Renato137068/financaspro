/**
 * init-2fa.js — UI de verificação em duas etapas (TOTP / nuvem)
 */
const INIT_2FA = {
  _enabled: false,

  init: function() {
    this._bindToggle();
    this.refreshUI();
  },

  isAvailable: function() {
    return typeof DADOS !== 'undefined'
      && DADOS._apiAtiva && DADOS._apiAtiva()
      && DADOS.getSessao && DADOS.getSessao().user;
  },

  refreshUI: function() {
    var card = document.getElementById('perfil-2fa-card');
    var chk = document.getElementById('chk-2fa');
    var status = document.getElementById('perfil-2fa-status');
    if (!chk || !status) return;

    if (!this.isAvailable()) {
      if (card) card.classList.add('perfil-card-disabled');
      chk.disabled = true;
      chk.checked = false;
      status.textContent = 'Requer login na nuvem';
      return;
    }

    if (card) card.classList.remove('perfil-card-disabled');
    chk.disabled = false;

    var self = this;
    DADOS.totpStatusApi().then(function(st) {
      self._enabled = !!(st && st.enabled);
      chk.checked = self._enabled;
      status.textContent = self._enabled ? 'Ativo — app autenticador' : 'Desativado';
    }).catch(function() {
      chk.checked = false;
      status.textContent = 'Indisponível';
    });
  },

  _bindToggle: function() {
    var chk = document.getElementById('chk-2fa');
    if (!chk || chk.dataset.bound === '1') return;
    chk.dataset.bound = '1';
    var self = this;

    chk.addEventListener('change', function() {
      var wantOn = chk.checked;
      if (!self.isAvailable()) {
        chk.checked = false;
        return;
      }
      if (wantOn && !self._enabled) {
        chk.checked = false;
        self._abrirSetup();
      } else if (!wantOn && self._enabled) {
        chk.checked = true;
        self._abrirDisable();
      }
    });
  },

  _abrirSetup: function() {
    var self = this;
    if (!this.isAvailable()) return;

    DADOS._apiFetch('/api/v1/auth/totp/setup', { method: 'POST', body: '{}' })
      .then(function(resp) {
        var data = resp && resp.data ? resp.data : null;
        if (!data) throw new Error('Falha ao iniciar 2FA');
        self._modalSetup(data);
      })
      .catch(function(err) {
        UTILS.mostrarToast(err.message || 'Erro ao configurar 2FA', 'error');
      });
  },

  _modalSetup: function(data) {
    var self = this;
    var html =
      '<div class="totp-setup">' +
        '<p>Escaneie o QR code no Google Authenticator, Authy ou similar:</p>' +
        '<img src="' + UTILS.escapeHtml(data.qrCode) + '" alt="QR code 2FA" class="totp-qr" width="220" height="220">' +
        '<p class="totp-secret-label">Ou digite manualmente:</p>' +
        '<code class="totp-secret">' + UTILS.escapeHtml(data.secret) + '</code>' +
        '<label class="auth-field" for="totp-enable-code"><span>Código de 6 dígitos</span>' +
          '<input type="text" id="totp-enable-code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" placeholder="000000">' +
        '</label>' +
      '</div>';

    if (typeof INIT_MODALS !== 'undefined' && INIT_MODALS.fpAlert) {
      INIT_MODALS.fpAlert(html, { title: 'Ativar verificação em duas etapas', trustedHtml: true });
      var btn = document.querySelector('.modal-overlay .modal-btn');
      if (btn) {
        btn.textContent = 'Ativar';
        btn.onclick = function() {
          var code = (document.getElementById('totp-enable-code') || {}).value || '';
          DADOS.totpApi('enable', { code: code.trim() }).then(function() {
            document.querySelector('.modal-overlay').remove();
            UTILS.mostrarToast('2FA ativado com sucesso', 'success');
            self._enabled = true;
            self.refreshUI();
          }).catch(function(err) {
            UTILS.mostrarToast(err.message || 'Código inválido', 'error');
          });
        };
      }
    }
  },

  _abrirDisable: function() {
    var self = this;
    if (typeof INIT_MODALS === 'undefined' || !INIT_MODALS.fpAlert) return;

    var html =
      '<div class="totp-setup">' +
        '<p>Para desativar o 2FA, confirme sua senha e o código atual:</p>' +
        '<label class="auth-field" for="totp-disable-pass"><span>Senha</span>' +
          '<input type="password" id="totp-disable-pass" autocomplete="current-password">' +
        '</label>' +
        '<label class="auth-field" for="totp-disable-code"><span>Código 2FA</span>' +
          '<input type="text" id="totp-disable-code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="000000">' +
        '</label>' +
      '</div>';

    INIT_MODALS.fpAlert(html, { title: 'Desativar 2FA', trustedHtml: true });
    var btn = document.querySelector('.modal-overlay .modal-btn');
    if (btn) {
      btn.textContent = 'Desativar';
      btn.className = 'modal-btn btn-confirmar-danger';
      btn.onclick = function() {
        var pass = (document.getElementById('totp-disable-pass') || {}).value || '';
        var code = (document.getElementById('totp-disable-code') || {}).value || '';
        DADOS.totpApi('disable', { password: pass, code: code.trim() }).then(function() {
          document.querySelector('.modal-overlay').remove();
          UTILS.mostrarToast('2FA desativado', 'info');
          self._enabled = false;
          self.refreshUI();
        }).catch(function(err) {
          UTILS.mostrarToast(err.message || 'Falha ao desativar', 'error');
        });
      };
    }
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = INIT_2FA;
}
