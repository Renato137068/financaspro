/**
 * authController.js - UI de autenticacao e sessao.
 * Login em duas etapas (e-mail → senha) estilo app financeiro.
 */

var _authFocusTrap = null;
var AUTH_LAST_EMAIL_KEY = 'fp-auth-last-email';
var AUTH_DISPLAY_NAME_KEY = 'fp-auth-display-name';

function _authLer(key) {
  try { return localStorage.getItem(key) || ''; } catch (e) { return ''; }
}

function _authSalvar(key, val) {
  try { if (val) localStorage.setItem(key, val); } catch (e) { /* noop */ }
}

function _mascararEmail(email) {
  if (!email || email.indexOf('@') < 1) return email || '';
  var parts = email.split('@');
  var local = parts[0];
  var domain = parts[1];
  if (local.length <= 2) return '**@' + domain;
  return local.charAt(0) + '***' + local.charAt(local.length - 1) + '@' + domain;
}

function _primeiroNome(nome) {
  if (!nome) return '';
  return String(nome).trim().split(/\s+/)[0] || '';
}

function _abrirAuthOverlay(overlay) {
  if (!overlay) return;
  overlay.style.display = 'flex';
  document.body.classList.add('auth-overlay-open');
  var first = document.getElementById('auth-login-email')
    || document.getElementById('auth-login-password')
    || overlay.querySelector('input, button');
  if (typeof FocusTrap !== 'undefined') {
    _authFocusTrap = new FocusTrap(overlay);
    _authFocusTrap.activate(first || undefined);
  } else if (first) {
    first.focus();
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

function _lembrarUsuario(email, nome) {
  if (email) _authSalvar(AUTH_LAST_EMAIL_KEY, email.trim().toLowerCase());
  if (nome) _authSalvar(AUTH_DISPLAY_NAME_KEY, nome.trim());
}

function setupAuthUI() {
  var overlay = document.getElementById('auth-overlay');
  if (!overlay) return false;
  if (overlay.dataset.authBound === '1') {
    return !(overlay.style.display === 'flex');
  }
  overlay.dataset.authBound = '1';

  var tabs = overlay.querySelectorAll('.auth-tab');
  var loginFlow = document.getElementById('auth-login-flow');
  var emailStepForm = document.getElementById('auth-login-step-email');
  var loginForm = document.getElementById('auth-login-form');
  var totpForm = document.getElementById('auth-totp-form');
  var registerForm = document.getElementById('auth-register-form');
  var message = document.getElementById('auth-message');
  var warning = document.getElementById('auth-env-warning');
  var screenTitle = document.getElementById('auth-dialog-title');
  var biometricBtn = document.getElementById('auth-biometric-btn');
  var changeEmailBtn = document.getElementById('auth-change-email');
  var forgotBtn = document.getElementById('auth-forgot-password');
  var _pendingTotpToken = null;
  var _loginStep = 'email';

  function _atualizarSaudacao(email) {
    var nome = _authLer(AUTH_DISPLAY_NAME_KEY);
    var greetName = document.getElementById('auth-greeting-name');
    var greetEmail = document.getElementById('auth-greeting-email');
    if (greetName) {
      greetName.textContent = nome ? ('Olá, ' + _primeiroNome(nome).toUpperCase() + '!') : 'Olá!';
    }
    if (greetEmail) greetEmail.textContent = _mascararEmail(email);
  }

  function showLoginStep(step) {
    _loginStep = step;
    var emailInput = document.getElementById('auth-login-email');
    if (emailStepForm) {
      emailStepForm.hidden = step !== 'email';
      emailStepForm.style.display = step === 'email' ? '' : 'none';
    }
    if (loginForm) {
      loginForm.hidden = step !== 'password';
      loginForm.style.display = step === 'password' ? '' : 'none';
    }
    if (screenTitle) screenTitle.textContent = step === 'password' ? 'Entrar' : 'Entrar';
    if (message) {
      message.textContent = step === 'password'
        ? 'Digite sua senha para continuar.'
        : 'Digite seu e-mail para continuar.';
    }
    if (step === 'password' && emailInput) {
      _atualizarSaudacao(emailInput.value.trim());
      var passInput = document.getElementById('auth-login-password');
      if (passInput) {
        passInput.value = '';
        passInput.focus();
      }
    } else if (emailInput) {
      emailInput.focus();
    }
    if (typeof AUTH_BIOMETRIC !== 'undefined' && AUTH_BIOMETRIC.refreshBiometricUI) {
      AUTH_BIOMETRIC.refreshBiometricUI();
    }
    if (_authFocusTrap && typeof _authFocusTrap.refresh === 'function') {
      _authFocusTrap.refresh();
    }
  }

  function showTotpStep(pendingToken) {
    _pendingTotpToken = pendingToken;
    tabs.forEach(function(tab) { tab.style.display = 'none'; });
    if (loginFlow) loginFlow.style.display = 'none';
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
    if (loginFlow) loginFlow.style.display = '';
    if (totpForm) { totpForm.style.display = 'none'; totpForm.hidden = true; }
    showTab('login');
  }

  function _authOnSuccess(overlay) {
    var emailInput = document.getElementById('auth-login-email');
    var email = emailInput ? emailInput.value.trim() : '';
    var sess = (typeof SUPA_AUTH !== 'undefined' && SUPA_AUTH.isActive && SUPA_AUTH.isActive())
      ? SUPA_AUTH.getSessionSync()
      : DADOS.getSessao();
    var nome = (sess && sess.user && sess.user.name) || _authLer(AUTH_DISPLAY_NAME_KEY);
    if (email) _lembrarUsuario(email, nome);
    if (typeof AUTH_BIOMETRIC !== 'undefined' && AUTH_BIOMETRIC.onLoginSuccess) {
      AUTH_BIOMETRIC.onLoginSuccess(sess);
    }
    _fecharAuthOverlay(overlay);
    if (typeof BILLING !== 'undefined' && BILLING.sync) {
      BILLING.sync().catch(function() {});
    }
    if (typeof INIT_CONFIG !== 'undefined' && INIT_CONFIG.aplicarVisibilidadeNuvem) {
      INIT_CONFIG.aplicarVisibilidadeNuvem();
    }
    atualizarBarraSessao();
  }

  function _authOnError(err, fallbackMsg) {
    var msg = (err && err.message) || fallbackMsg;
    if (message) message.textContent = msg;
    UTILS.mostrarToast(msg, 'error');
    if (typeof ariaLive !== 'undefined' && typeof ariaLive.announceError === 'function') {
      ariaLive.announceError(msg);
    }
  }

  function _bindPasswordToggles(root) {
    if (!root) return;
    root.querySelectorAll('.auth-password-toggle').forEach(function(btn) {
      if (btn.dataset.bound === '1') return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', function() {
        var input = document.getElementById(btn.getAttribute('data-target') || '');
        if (!input) return;
        var show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.setAttribute('aria-pressed', show ? 'true' : 'false');
        btn.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
        var icon = btn.querySelector('[data-lucide]');
        if (icon) icon.setAttribute('data-lucide', show ? 'eye-off' : 'eye');
        if (typeof renderLucideIconsNow === 'function') renderLucideIconsNow(btn);
      });
    });
  }

  function _checkCloudReachable() {
    if (typeof SUPA_AUTH === 'undefined' || !SUPA_AUTH.isActive || !SUPA_AUTH.isActive()) return;
    if (!warning) return;
    SUPA_AUTH.ping().then(function() {
      warning.style.display = 'none';
      warning.textContent = '';
    }).catch(function(err) {
      warning.style.display = 'block';
      warning.textContent = (err && err.message)
        || 'Não foi possível conectar ao servidor. Verifique sua internet.';
    });
  }

  function _prefillLogin() {
    var emailInput = document.getElementById('auth-login-email');
    var last = _authLer(AUTH_LAST_EMAIL_KEY);
    if (emailInput && last) {
      emailInput.value = last;
      showLoginStep('password');
    } else {
      showLoginStep('email');
    }
  }

  _bindPasswordToggles(overlay);
  if (typeof renderLucideIconsNow === 'function') renderLucideIconsNow(overlay);
  if (typeof AUTH_BIOMETRIC !== 'undefined' && AUTH_BIOMETRIC.setupPerfilToggle) {
    AUTH_BIOMETRIC.setupPerfilToggle();
  }

  function showTab(name) {
    tabs.forEach(function(tab) {
      var active = tab.dataset.authTab === name;
      tab.classList.toggle('ativo', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
      tab.setAttribute('tabindex', active ? '0' : '-1');
    });
    if (loginFlow) {
      loginFlow.style.display = name === 'login' ? '' : 'none';
      loginFlow.hidden = name !== 'login';
    }
    if (registerForm) {
      registerForm.style.display = name === 'register' ? '' : 'none';
      registerForm.hidden = name !== 'register';
    }
    if (totpForm) {
      totpForm.style.display = 'none';
      totpForm.hidden = true;
    }
    if (screenTitle) {
      screenTitle.textContent = name === 'register' ? 'Criar conta' : 'Entrar';
    }
    if (message) {
      message.textContent = name === 'login'
        ? (_loginStep === 'password' ? 'Digite sua senha para continuar.' : 'Digite seu e-mail para continuar.')
        : 'Preencha os dados para começar.';
    }
    if (name === 'login') {
      _prefillLogin();
    } else {
      showLoginStep('email');
      var focusTarget = document.getElementById('auth-register-name');
      if (focusTarget) focusTarget.focus();
    }
    if (_authFocusTrap && typeof _authFocusTrap.refresh === 'function') {
      _authFocusTrap.refresh();
    }
  }

  tabs.forEach(function(tab) {
    tab.addEventListener('click', function() {
      showTab(tab.dataset.authTab || 'login');
    });
  });

  if (typeof TablistKeyboard !== 'undefined') {
    var authTablist = overlay.querySelector('[role="tablist"]');
    if (authTablist) {
      TablistKeyboard.init(authTablist, {
        onSelect: function(tab) {
          showTab(tab.dataset.authTab || 'login');
        }
      });
    }
  }

  overlay.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && overlay.style.display === 'flex') {
      e.preventDefault();
      if (typeof ariaLive !== 'undefined' && typeof ariaLive.announce === 'function') {
        ariaLive.announce('Autenticação necessária para continuar.', 'assertive');
      }
    }
  });

  overlay.addEventListener('fp-auth-reopen', function() {
    showTab('login');
  });

  if (emailStepForm) {
    emailStepForm.addEventListener('submit', function(e) {
      e.preventDefault();
      var email = document.getElementById('auth-login-email').value.trim();
      if (!email) return;
      showLoginStep('password');
    });
  }

  if (changeEmailBtn) {
    changeEmailBtn.addEventListener('click', function() {
      showLoginStep('email');
    });
  }

  if (forgotBtn) {
    forgotBtn.addEventListener('click', function() {
      var email = document.getElementById('auth-login-email').value.trim();
      if (!email) {
        UTILS.mostrarToast('Informe seu e-mail na etapa anterior.', 'warning');
        showLoginStep('email');
        return;
      }
      if (typeof SUPA_AUTH !== 'undefined' && SUPA_AUTH.resetPasswordEmail) {
        SUPA_AUTH.resetPasswordEmail(email).then(function() {
          UTILS.mostrarToast('Enviamos um link de redefinição para ' + email + '.', 'info');
        }).catch(function(err) {
          _authOnError(err, 'Não foi possível enviar o e-mail de recuperação.');
        });
        return;
      }
      UTILS.mostrarToast('Recuperação de senha disponível apenas com login na nuvem.', 'info');
    });
  }

  if (biometricBtn) {
    biometricBtn.addEventListener('click', function() {
      if (typeof AUTH_BIOMETRIC === 'undefined' || !AUTH_BIOMETRIC.tryLogin) return;
      biometricBtn.disabled = true;
      AUTH_BIOMETRIC.tryLogin().then(function(result) {
        var emailInput = document.getElementById('auth-login-email');
        if (emailInput && result && result.email) emailInput.value = result.email;
        _authOnSuccess(overlay);
      }).catch(function(err) {
        var msg = (err && err.message) || 'Biometria não reconhecida.';
        if (!/cancel|user cancel/i.test(msg)) {
          UTILS.mostrarToast(msg, 'error');
        }
      }).finally(function() {
        biometricBtn.disabled = false;
      });
    });
  }

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
        _authOnSuccess(overlay);
      }).catch(function(err) {
        console.error('Login falhou:', err);
        _authOnError(err, 'Falha no login');
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
      if (typeof VALIDATIONS !== 'undefined' && VALIDATIONS.validarSenha) {
        var senhaVal = VALIDATIONS.validarSenha(password);
        if (!senhaVal.valido) {
          UTILS.mostrarToast(senhaVal.erro, 'error');
          if (typeof ariaLive !== 'undefined' && typeof ariaLive.announceError === 'function') {
            ariaLive.announceError(senhaVal.erro);
          }
          return;
        }
      }
      _setAuthSubmitting(registerForm, true);
      var cloudReady = (typeof SUPA_AUTH !== 'undefined' && SUPA_AUTH.isActive && SUPA_AUTH.ping)
        ? SUPA_AUTH.ping().catch(function(err) {
          _authOnError(err, 'Servidor indisponível');
          throw err;
        })
        : Promise.resolve();
      cloudReady.then(function() {
        return DADOS.registrarApi(nome, email, password);
      }).then(function(result) {
        if (result && result.needsEmailConfirmation) {
          if (message) {
            message.textContent = 'Conta criada! Abra o e-mail de confirmação e depois toque em Entrar com a mesma senha.';
          }
          UTILS.mostrarToast('Confirme seu e-mail para entrar.', 'info');
          _lembrarUsuario(email, nome);
          showTab('login');
          var loginEmail = document.getElementById('auth-login-email');
          if (loginEmail) loginEmail.value = email;
          showLoginStep('password');
          return false;
        }
        _lembrarUsuario(email, nome);
        if (typeof SUPA_AUTH !== 'undefined' && SUPA_AUTH.isActive()
            && SUPA_AUTH.getSessionSync() && SUPA_AUTH.getSessionSync().user) {
          return true;
        }
        return DADOS.loginApi(email, password).then(function() { return true; });
      }).then(function(ok) {
        if (ok) _authOnSuccess(overlay);
      }).catch(function(err) {
        console.error('Cadastro falhou:', err);
        _authOnError(err, 'Falha no cadastro');
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

  if (typeof SUPA_AUTH !== 'undefined' && SUPA_AUTH.isActive()) {
    _checkCloudReachable();
    SUPA_AUTH.validate().then(function (logged) {
      if (logged) { _fecharAuthOverlay(overlay); }
      else { _abrirAuthOverlay(overlay); }
      showTab('login');
      atualizarBarraSessao();
    });
    return false;
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
  var sessao = (typeof SUPA_AUTH !== 'undefined' && SUPA_AUTH.isActive())
    ? SUPA_AUTH.getSessionSync() : DADOS.getSessao();
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
        if (overlay) {
          _abrirAuthOverlay(overlay);
          overlay.dispatchEvent(new CustomEvent('fp-auth-reopen'));
        }
        atualizarBarraSessao();
        UTILS.mostrarToast('Você saiu da conta. Seus dados continuam neste aparelho.', 'info');
      });
    } else {
      DADOS.encerrarSessao();
      var overlay = document.getElementById('auth-overlay');
      if (overlay) {
        _abrirAuthOverlay(overlay);
        overlay.dispatchEvent(new CustomEvent('fp-auth-reopen'));
      }
      atualizarBarraSessao();
      UTILS.mostrarToast('Você saiu da conta. Seus dados continuam neste aparelho.', 'info');
    }
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { setupAuthUI: setupAuthUI, atualizarBarraSessao: atualizarBarraSessao, setupLogoutButton: setupLogoutButton };
}
