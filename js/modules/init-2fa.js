/**
 * init-2fa.js — UI de verificação em duas etapas (TOTP)
 * Express: /api/v1/auth/totp/*
 * Supabase: auth.mfa.* (TOTP)
 */
const INIT_2FA = {
  _enabled: false,
  _factorId: null,
  _enrollFactorId: null,

  init: function() {
    this._bindToggle();
    this.refreshUI();
  },

  _isSupabaseMode: function() {
    return typeof DADOS !== 'undefined'
      && DADOS._supabaseAtivo && DADOS._supabaseAtivo();
  },

  isAvailable: function() {
    if (this._isSupabaseMode()) {
      return typeof SUPA_AUTH !== 'undefined'
        && SUPA_AUTH.getSessionSync
        && !!(SUPA_AUTH.getSessionSync() && SUPA_AUTH.getSessionSync().user);
    }
    return typeof DADOS !== 'undefined'
      && DADOS._apiAtiva && DADOS._apiAtiva()
      && DADOS.getSessao && DADOS.getSessao().user;
  },

  refreshUI: function() {
    var card = document.getElementById('perfil-2fa-card');
    var chk = document.getElementById('chk-2fa');
    var status = document.getElementById('perfil-2fa-status');
    if (!chk || !status) return;

    if (card) {
      card.hidden = false;
      card.style.display = '';
    }

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
    var statusPromise = this._isSupabaseMode()
      ? SUPA_AUTH.mfaStatus()
      : DADOS.totpStatusApi();

    statusPromise.then(function(st) {
      self._enabled = !!(st && st.enabled);
      self._factorId = st && st.factorId ? st.factorId : null;
      chk.checked = self._enabled;
      status.textContent = self._enabled ? 'Ativo — app autenticador' : 'Desativado';
      self._refreshRecoveryUI();
    }).catch(function() {
      self._refreshRecoveryUI();
      chk.checked = false;
      status.textContent = 'Indisponível (ative MFA no painel Supabase se necessário)';
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

    var start = this._isSupabaseMode()
      ? SUPA_AUTH.mfaEnrollStart()
      : DADOS._apiFetch('/api/v1/auth/totp/setup', { method: 'POST', body: '{}' })
        .then(function(resp) {
          var data = resp && resp.data ? resp.data : null;
          if (!data) throw new Error('Falha ao iniciar 2FA');
          return data;
        });

    start.then(function(data) {
      self._enrollFactorId = data.factorId || null;
      self._modalSetup(data);
    }).catch(function(err) {
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
          var confirm = self._isSupabaseMode()
            ? SUPA_AUTH.mfaEnrollConfirm(self._enrollFactorId, code.trim())
            : DADOS.totpApi('enable', { code: code.trim() });
          confirm.then(function() {
            document.querySelector('.modal-overlay').remove();
            UTILS.mostrarToast('Verificação em duas etapas ativada', 'success');
            self._enabled = true;
            self.refreshUI();
            /* Entregar os códigos AGORA, não depois: ativar 2FA sem guardar
               código é o caminho mais curto para perder a conta. */
            if (self._isSupabaseMode() && typeof SUPA_AUTH !== 'undefined'
                && SUPA_AUTH.mfaRecoveryGenerate) {
              setTimeout(function() { self._gerarRecovery(); }, 400);
            }
          }).catch(function(err) {
            UTILS.mostrarToast(err.message || 'Código inválido', 'error');
          });
        };
      }
    }
  },

  /* ── Códigos de recuperação ────────────────────────────────────────────
     Perder o aparelho do autenticador não pode significar perder a conta. */

  _refreshRecoveryUI: function() {
    var card = document.getElementById('perfil-recovery-card');
    var status = document.getElementById('perfil-recovery-status');
    if (!card) return;

    // Só faz sentido com 2FA ligado e na nuvem.
    if (!this._enabled || !this._isSupabaseMode() || typeof SUPA_AUTH === 'undefined'
        || !SUPA_AUTH.mfaRecoveryCount) {
      card.hidden = true;
      return;
    }
    card.hidden = false;
    this._bindRecoveryBtn();
    if (status) status.textContent = 'Verificando…';
    SUPA_AUTH.mfaRecoveryCount().then(function(n) {
      if (!status) return;
      if (n === 0) {
        status.textContent = 'Nenhum código guardado — gere agora';
      } else {
        status.textContent = n + (n === 1 ? ' código restante' : ' códigos restantes');
      }
    }).catch(function(err) {
      if (status) status.textContent = (err && err.message) || 'Indisponível';
    });
  },

  _bindRecoveryBtn: function() {
    var btn = document.getElementById('btn-recovery-gerar');
    if (!btn || btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    var self = this;
    btn.addEventListener('click', function() {
      if (typeof INIT_MODALS === 'undefined' || !INIT_MODALS.fpConfirm) {
        self._gerarRecovery();
        return;
      }
      INIT_MODALS.fpConfirm(
        'Gerar novos códigos invalida os anteriores. A lista antiga para de funcionar. Continuar?',
        function() { self._gerarRecovery(); },
        null,
        { okLabel: 'Gerar novos', danger: true }
      );
    });
  },

  _gerarRecovery: function() {
    var self = this;
    var btn = document.getElementById('btn-recovery-gerar');
    if (btn) btn.disabled = true;
    return SUPA_AUTH.mfaRecoveryGenerate().then(function(codigos) {
      self._modalCodigos(codigos);
      self._refreshRecoveryUI();
    }).catch(function(err) {
      UTILS.mostrarToast((err && err.message) || 'Não foi possível gerar os códigos.', 'error');
    }).finally(function() {
      if (btn) btn.disabled = false;
    });
  },

  /** Mostra os códigos UMA vez — depois só existem como hash no servidor. */
  _modalCodigos: function(codigos) {
    if (!codigos || !codigos.length) return;
    var lista = codigos.map(function(c) {
      return '<li><code>' + UTILS.escapeHtml(c) + '</code></li>';
    }).join('');

    var html =
      '<div class="recovery-codes">' +
        '<p><strong>Guarde estes códigos agora.</strong> Eles não serão mostrados de novo.</p>' +
        '<ol class="recovery-codes-list">' + lista + '</ol>' +
        '<p class="recovery-codes-hint">Cada código serve uma vez e desliga a verificação em duas etapas ' +
          'para você voltar a entrar com a senha. Guarde fora do celular que tem o autenticador.</p>' +
        '<button type="button" class="btn-ghost" id="btn-recovery-copiar">Copiar todos</button>' +
      '</div>';

    if (typeof INIT_MODALS === 'undefined' || !INIT_MODALS.fpAlert) {
      UTILS.mostrarToast('Códigos gerados: ' + codigos.join(' '), 'info');
      return;
    }
    INIT_MODALS.fpAlert(html, { title: 'Códigos de recuperação', trustedHtml: true });

    var copiar = document.getElementById('btn-recovery-copiar');
    if (copiar) {
      copiar.addEventListener('click', function() {
        var texto = 'FinançasPro — códigos de recuperação\n\n' + codigos.join('\n');
        var done = function() { UTILS.mostrarToast('Códigos copiados', 'success'); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(texto).then(done).catch(function() {
            UTILS.mostrarToast('Não foi possível copiar. Anote manualmente.', 'warning');
          });
        } else {
          UTILS.mostrarToast('Copie manualmente: seu navegador não permite.', 'warning');
        }
      });
    }
  },

  _abrirDisable: function() {
    var self = this;
    if (typeof INIT_MODALS === 'undefined' || !INIT_MODALS.fpAlert) return;

    var html =
      '<div class="totp-setup">' +
        '<p>Para desativar o 2FA, confirme ' +
          (self._isSupabaseMode() ? 'o código atual do autenticador:' : 'sua senha e o código atual:') +
        '</p>' +
        (self._isSupabaseMode() ? '' :
          '<label class="auth-field" for="totp-disable-pass"><span>Senha</span>' +
            '<input type="password" id="totp-disable-pass" autocomplete="current-password">' +
          '</label>') +
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
        var code = (document.getElementById('totp-disable-code') || {}).value || '';
        var promessa;
        if (self._isSupabaseMode()) {
          promessa = SUPA_AUTH.mfaUnenroll(self._factorId, code.trim());
        } else {
          var pass = (document.getElementById('totp-disable-pass') || {}).value || '';
          promessa = DADOS.totpApi('disable', { password: pass, code: code.trim() });
        }
        promessa.then(function() {
          document.querySelector('.modal-overlay').remove();
          UTILS.mostrarToast('2FA desativado', 'info');
          self._enabled = false;
          self._factorId = null;
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
