/**
 * authController.js - UI de autenticacao e sessao.
 * Mantem as funcoes publicas usadas pelo bootstrap.
 */

var _authFocusTrap = null;

function _abrirAuthOverlay(overlay) {
  if (!overlay) return;
  overlay.style.display = 'flex';
  document.body.classList.add('auth-overlay-open');
  var first = document.getElementById('auth-login-email') || overlay.querySelector('input, button');
  if (first) first.focus();
  if (typeof FocusTrap !== 'undefined') {
    _authFocusTrap = new FocusTrap(overlay);
    _authFocusTrap.activate();
  }
}

function _fecharAuthOverlay(overlay) {
  if (!overlay) return;
  overlay.style.display = 'none';
  document.body.classList.remove('auth-overlay-open');
  if (_authFocusTrap) {
    _authFocusTrap.deactivate();
    _authFocusTrap = null;
  }
}

function _setAuthSubmitting(form, submitting) {
  if (!form) return;
  var btn = form.querySelector('button[type="submit"]');
  form.setAttribute('aria-busy', submitting ? 'true' : 'false');
  if (btn) {
    btn.disabled = !!submitting;
    btn.setAttribute('aria-disabled', submitting ? 'true' : 'false');
  }
}

function setupAuthUI() {
  var overlay = document.getElementById('auth-overlay');
  if (!overlay) return false;
  if (overlay.dataset.authBound === '1') {
    return !(overlay.style.display === 'flex');
  }
  overlay.dataset.authBound = '1';

  var tabs = overlay.querySelectorAll('.auth-tab');
  var loginForm = document.getElementById('auth-login-form');
  var totpForm = document.getElementById('auth-totp-form');
  var registerForm = document.getElementById('auth-register-form');
  var message = document.getElementById('auth-message');
  var warning = document.getElementById('auth-env-warning');
  var _pendingTotpToken = null;

  function showTotpStep(pendingToken) {
    _pendingTotpToken = pendingToken;
    tabs.forEach(function(tab) { tab.style.display = 'none'; });
    if (loginForm) { loginForm.style.display = 'none'; loginForm.hidden = true; }
    if (registerForm) { registerForm.style.display = 'none'; registerForm.hidden = true; }
    if (totpForm) { totpForm.style.display = ''; totpForm.hidden = false; }
    if (message) message.textContent = 'Digite o código do app autenticador.';
    var codeInput = document.getElementById('auth-totp-code');
    if (codeInput) codeInput.focus();
    if (_authFocusTrap && typeof _authFocusTrap.refresh === 'function') _authFocusTrap.refresh();
  }

  function hideTotpStep() {
    _pendingTotpToken = null;
    tabs.forEach(function(tab) { tab.style.display = ''; });
    if (totpForm) { totpForm.style.display = 'none'; totpForm.hidden = true; }
    showTab('login');
  }

  function showTab(name) {
    tabs.forEach(function(tab) {
      var active = tab.dataset.authTab === name;
      tab.classList.toggle('ativo', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    if (loginForm) {
      loginForm.style.display = name === 'login' ? '' : 'none';
      loginForm.hidden = name !== 'login';
    }
    if (registerForm) {
      registerForm.style.display = name === 'register' ? '' : 'none';
      registerForm.hidden = name !== 'register';
    }
    if (totpForm) {
      totpForm.style.display = 'none';
      totpForm.hidden = true;
    }
    if (message) {
      message.textContent = name === 'login'
        ? 'Entre para continuar seu controle financeiro.'
        : 'Crie sua conta para começar a organizar seus dados.';
    }
    var focusTarget = name === 'login'
      ? document.getElementById('auth-login-email')
      : document.getElementById('auth-register-name');
    if (focusTarget) focusTarget.focus();
    if (_authFocusTrap && typeof _authFocusTrap.refresh === 'function') {
      _authFocusTrap.refresh();
    }
  }

  tabs.forEach(function(tab) {
    tab.addEventListener('click', function() {
      showTab(tab.dataset.authTab || 'login');
    });
  });

  overlay.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && overlay.style.display === 'flex') {
      e.preventDefault();
      if (typeof ariaLive !== 'undefined' && typeof ariaLive.announce === 'function') {
        ariaLive.announce('Autenticação necessária para continuar.', 'assertive');
      }
    }
  });

  if (loginForm) {
    loginForm.addEventListener('submit', function(e) {
      e.preventDefault();
      var email = document.getElementById('auth-login-email').value.trim();
      var password = document.getElementById('auth-login-password').value;
      _setAuthSubmitting(loginForm, true);
      DADOS.loginApi(email, password).then(function(data) {
        if (data && data.requiresTotp && data.pendingToken) {
          showTotpStep(data.pendingToken);
          return;
        }
        _fecharAuthOverlay(overlay);
        if (typeof BILLING !== 'undefined' && BILLING.sync) {
          BILLING.sync().catch(function() {});
        }
        if (typeof APP_BOOTSTRAP !== 'undefined') APP_BOOTSTRAP.ativarApp();
      }).catch(function(err) {
        console.error('Login falhou:', err);
        UTILS.mostrarToast(err.message || 'Falha no login', 'error');
        if (typeof ariaLive !== 'undefined' && typeof ariaLive.announceError === 'function') {
          ariaLive.announceError(err.message || 'Falha no login');
        }
      }).finally(function() {
        _setAuthSubmitting(loginForm, false);
      });
    });
  }

  if (totpForm) {
    totpForm.addEventListener('submit', function(e) {
      e.preventDefault();
      if (!_pendingTotpToken) return;
      var code = document.getElementById('auth-totp-code').value.trim();
      _setAuthSubmitting(totpForm, true);
      DADOS.verifyTotpLoginApi(_pendingTotpToken, code).then(function() {
        _fecharAuthOverlay(overlay);
        hideTotpStep();
        if (typeof BILLING !== 'undefined' && BILLING.sync) BILLING.sync().catch(function() {});
        if (typeof INIT_2FA !== 'undefined' && INIT_2FA.refreshUI) INIT_2FA.refreshUI();
      }).catch(function(err) {
        UTILS.mostrarToast(err.message || 'Código inválido', 'error');
      }).finally(function() {
        _setAuthSubmitting(totpForm, false);
      });
    });
  }

  var totpBack = document.getElementById('auth-totp-back');
  if (totpBack) {
    totpBack.addEventListener('click', function() { hideTotpStep(); });
  }

  if (registerForm) {
    registerForm.addEventListener('submit', function(e) {
      e.preventDefault();
      var nome = document.getElementById('auth-register-name').value.trim();
      var email = document.getElementById('auth-register-email').value.trim();
      var password = document.getElementById('auth-register-password').value;
      _setAuthSubmitting(registerForm, true);
      DADOS.registrarApi(nome, email, password).then(function() {
        return DADOS.loginApi(email, password);
      }).then(function() {
        _fecharAuthOverlay(overlay);
        if (typeof APP_BOOTSTRAP !== 'undefined') APP_BOOTSTRAP.ativarApp();
      }).catch(function(err) {
        console.error('Cadastro falhou:', err);
        UTILS.mostrarToast(err.message || 'Falha no cadastro', 'error');
        if (typeof ariaLive !== 'undefined' && typeof ariaLive.announceError === 'function') {
          ariaLive.announceError(err.message || 'Falha no cadastro');
        }
      }).finally(function() {
        _setAuthSubmitting(registerForm, false);
      });
    });
  }

  if (warning) {
    if (window.location.protocol === 'file:') {
      warning.style.display = 'block';
      warning.textContent = 'Modo local ativado. Para login e sincronizacao, abra o app por http://localhost:4000/.';
    } else {
      warning.style.display = 'none';
      warning.textContent = '';
    }
  }

  var sessao = DADOS.getSessao();
  if (sessao && sessao.user) {
    if (DADOS._apiAtiva()) {
      DADOS.validarSessaoApi().then(function(ok) {
        if (ok) {
          _fecharAuthOverlay(overlay);
        } else {
          _abrirAuthOverlay(overlay);
        }
        showTab('login');
        atualizarBarraSessao();
      });
      return false;
    }
    _fecharAuthOverlay(overlay);
    showTab('login');
    atualizarBarraSessao();
    return true;
  }

  // Sem backend configurado (piloto em modo local): não força o login —
  // o app funciona offline com localStorage. Quando um backend for
  // configurado (CONFIG.API_BASE_URL), o login volta a ser exibido.
  if (!DADOS._apiAtiva()) {
    _fecharAuthOverlay(overlay);
    showTab('login');
    atualizarBarraSessao();
    return true;
  }

  _abrirAuthOverlay(overlay);
  showTab('login');
  atualizarBarraSessao();
  return false;
}

function atualizarBarraSessao() {
  var label = document.getElementById('user-session-label');
  var sessao = DADOS.getSessao();
  if (!label) return;
  if (sessao && sessao.user && sessao.user.name) {
    label.textContent = 'Logado como ' + sessao.user.name;
  } else {
    label.textContent = 'Sessão local';
  }
}

function setupLogoutButton() {
  var btn = document.getElementById('btn-logout');
  if (!btn || btn.dataset.logoutBound === '1') return;
  btn.dataset.logoutBound = '1';
  btn.addEventListener('click', function() {
    if (typeof INIT_MODALS !== 'undefined' && INIT_MODALS.confirm) {
      INIT_MODALS.confirm('Deseja sair da sua conta?', function() {
        DADOS.encerrarSessao();
        var overlay = document.getElementById('auth-overlay');
        if (overlay) _abrirAuthOverlay(overlay);
        atualizarBarraSessao();
        UTILS.mostrarToast('Sessão encerrada', 'info');
      });
    } else {
      DADOS.encerrarSessao();
      var overlay = document.getElementById('auth-overlay');
      if (overlay) _abrirAuthOverlay(overlay);
      atualizarBarraSessao();
      UTILS.mostrarToast('Sessão encerrada', 'info');
    }
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { setupAuthUI: setupAuthUI, atualizarBarraSessao: atualizarBarraSessao, setupLogoutButton: setupLogoutButton };
}
