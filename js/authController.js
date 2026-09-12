/**
 * authController.js - UI de autenticacao e sessao.
 * Login em duas etapas (e-mail → senha) estilo app financeiro.
 */

var _authFocusTrap = null;
var _authDesbloqueadoNestaCarga = false;
/* Diálogo de biometria nativo tira o WebView de foco (visibilitychange=hidden).
   Sem esta trava, o bloqueio-ao-retomar tratava isso como "saiu do app" e
   reabria/retriggerava a biometria em loop, impedindo o login por senha. */
var _authBiometricInFlight = false;
/* Auto-biometria dispara só uma vez por retomada; se falhar (ex.: token
   expirado), o usuário entra com senha sem a tela reabrir sozinha. */
var _authBiometricAutoTried = false;
var AUTH_LAST_EMAIL_KEY = 'fp-auth-last-email';
var AUTH_DISPLAY_NAME_KEY = 'fp-auth-display-name';

function _authMarcarDesbloqueado() {
  _authDesbloqueadoNestaCarga = true;
}

function _authRevogarDesbloqueio() {
  _authDesbloqueadoNestaCarga = false;
}

function _authEstaDesbloqueado() {
  return _authDesbloqueadoNestaCarga;
}

function _authTemSessaoNuvem() {
  if (typeof SUPA_AUTH === 'undefined' || !SUPA_AUTH.isActive || !SUPA_AUTH.isActive()) return false;
  var sess = SUPA_AUTH.getSessionSync();
  return !!(sess && sess.user);
}

function _authLer(key) {
  try { return localStorage.getItem(key) || ''; } catch (e) { return ''; }
}

function _authSalvar(key, val) {
  try { if (val) localStorage.setItem(key, val); } catch (e) { /* noop */ }
}

function _authValidarEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function _authSupabaseAtivo() {
  return typeof SUPA_AUTH !== 'undefined' && SUPA_AUTH.isActive && SUPA_AUTH.isActive();
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
  if (typeof FP_SECURE_SCREEN !== 'undefined' && FP_SECURE_SCREEN.retain) {
    FP_SECURE_SCREEN.retain();
  }
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
  if (typeof FP_SECURE_SCREEN !== 'undefined' && FP_SECURE_SCREEN.release) {
    FP_SECURE_SCREEN.release();
  }
  if (_authFocusTrap) {
    _authFocusTrap.deactivate();
    _authFocusTrap = null;
  }
}

function _setAuthSubmitting(form, submitting, loadingLabel) {
  if (!form) return;
  var btn = form.querySelector('button[type="submit"]');
  form.setAttribute('aria-busy', submitting ? 'true' : 'false');
  if (btn) {
    btn.disabled = !!submitting;
    btn.setAttribute('aria-disabled', submitting ? 'true' : 'false');
    if (submitting && loadingLabel) {
      if (!btn.dataset.authDefaultLabel) btn.dataset.authDefaultLabel = btn.textContent;
      btn.textContent = loadingLabel;
    } else if (btn.dataset.authDefaultLabel) {
      btn.textContent = btn.dataset.authDefaultLabel;
    }
  }
}

/** Revoga desbloqueio, biometria e sessão — usar em logout e exclusão de conta. */
function authLimparAoSair() {
  _authRevogarDesbloqueio();
  if (typeof AUTH_BIOMETRIC !== 'undefined' && AUTH_BIOMETRIC.disable) {
    AUTH_BIOMETRIC.disable().catch(function() { /* noop */ });
  }
  if (typeof DADOS !== 'undefined' && DADOS.encerrarSessao) {
    DADOS.encerrarSessao();
  }
}

function _authMostrarReenviarEmail(mostrar, email) {
  var btn = document.getElementById('auth-resend-email-btn');
  if (!btn) return;
  btn.hidden = !mostrar;
  if (mostrar && email) btn.dataset.resendEmail = email;
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
  var resetPasswordForm = document.getElementById('auth-reset-password-form');
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
    if (message && !_offlineAtivo) {
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
    _atualizarBotaoSairAuth();
    if (_authFocusTrap && typeof _authFocusTrap.refresh === 'function') {
      _authFocusTrap.refresh();
    }
  }

  function showTotpStep(pendingToken) {
    _pendingTotpToken = pendingToken;
    tabs.forEach(function(tab) { tab.style.display = 'none'; });
    if (loginFlow) loginFlow.style.display = 'none';
    if (registerForm) { registerForm.style.display = 'none'; registerForm.hidden = true; }
    if (resetPasswordForm) { resetPasswordForm.style.display = 'none'; resetPasswordForm.hidden = true; }
    if (totpForm) {
      totpForm.style.display = '';
      totpForm.hidden = false;
      totpForm.removeAttribute('aria-hidden');
    }
    if (screenTitle) screenTitle.textContent = 'Verificação';
    if (message) message.textContent = 'Digite o código do app autenticador.';
    var codeInput = document.getElementById('auth-totp-code');
    if (codeInput) {
      codeInput.value = '';
      codeInput.focus();
    }
    if (_authFocusTrap && typeof _authFocusTrap.refresh === 'function') _authFocusTrap.refresh();
  }

  function hideTotpStep() {
    _pendingTotpToken = null;
    tabs.forEach(function(tab) { tab.style.display = ''; });
    if (loginFlow) loginFlow.style.display = '';
    if (totpForm) { totpForm.style.display = 'none'; totpForm.hidden = true; }
    showTab('login');
  }

  function _authOnSuccess(overlay, opts) {
    opts = opts || {};
    _authMarcarDesbloqueado();
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
    if (typeof INIT_2FA !== 'undefined' && INIT_2FA.refreshUI) {
      INIT_2FA.refreshUI();
    }
    atualizarBarraSessao();

    /* Oferta de biometria só depois de fechar o overlay — o modal (z-index 500)
       ficava atrás da tela de login (z-index 900+) e o app parecia travado. */
    if (!opts.viaBiometric
        && typeof AUTH_BIOMETRIC !== 'undefined'
        && AUTH_BIOMETRIC.offerEnableAfterLogin) {
      setTimeout(function() {
        AUTH_BIOMETRIC.offerEnableAfterLogin().catch(function() {});
      }, 400);
    }
  }

  /** Sessão AAL1 com MFA ativo → pede TOTP antes de entrar no app. */
  function _authGateMfaThenSuccess(overlay, opts) {
    opts = opts || {};
    var finish = function() { _authOnSuccess(overlay, opts); };
    if (typeof SUPA_AUTH === 'undefined' || !SUPA_AUTH.needsMfa) {
      finish();
      return Promise.resolve();
    }
    return SUPA_AUTH.needsMfa().then(function(need) {
      if (need && need.factorId) {
        showTotpStep(need.factorId);
        return;
      }
      finish();
    }).catch(function() {
      finish();
    });
  }

  function _authOnError(err, fallbackMsg) {
    var msg = (err && err.message) || fallbackMsg;
    if (message) message.textContent = msg;
    UTILS.mostrarToast(msg, 'error');
    var emailInput = document.getElementById('auth-login-email');
    var email = emailInput ? emailInput.value.trim() : '';
    _authMostrarReenviarEmail(/confirme seu e-mail/i.test(msg), email);
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

  /**
   * Pinga o servidor e devolve se ele está ao alcance.
   *
   * O retorno importa: quem já tem sessão guardada neste aparelho não pode
   * depender de rede para ver os próprios lançamentos, que estão no disco
   * local. Sem esta resposta, o boot mandava todo mundo para o formulário de
   * senha — e a senha só se confere no servidor.
   *
   * @returns {Promise<boolean>} true se o servidor respondeu.
   */
  function _checkCloudReachable() {
    if (typeof SUPA_AUTH === 'undefined' || !SUPA_AUTH.isActive || !SUPA_AUTH.isActive()) {
      return Promise.resolve(true);
    }
    return SUPA_AUTH.ping().then(function() {
      if (warning) {
        warning.style.display = 'none';
        warning.textContent = '';
      }
      return true;
    }).catch(function(err) {
      if (warning) {
        warning.style.display = 'block';
        warning.textContent = (err && err.message)
          || 'Não foi possível conectar ao servidor. Verifique sua internet.';
      }
      return false;
    });
  }

  /**
   * Sem rede, com sessão guardada: entra no app usando só o que está aqui.
   *
   * O PIN, quando configurado, continua guardando a entrada — ele é uma tela
   * própria (verificarPinAoAbrir) que roda offline com PBKDF2 e rate limit, e
   * não passa por aqui. A biometria também confere identidade sem rede. O que
   * este caminho remove é a exigência de SENHA, que é a única que precisa do
   * servidor para ser conferida.
   */
  /**
   * Enquanto ligado, showLoginStep não reescreve a mensagem da tela.
   *
   * Sem isto, o texto de "sem conexão" durava um instante: _prefillLogin e o
   * showLoginStep que vem junto dele rodam depois e devolviam o genérico
   * "Digite seu e-mail para continuar", deixando o botão offline sem
   * explicação nenhuma ao lado.
   */
  var _offlineAtivo = false;

  /** Liga/desliga os elementos exclusivos do modo sem conexão. */
  function _alternarUiOffline(mostrar) {
    _offlineAtivo = !!mostrar;
    var btn = document.getElementById('auth-offline-btn');
    var hint = document.getElementById('auth-offline-hint');
    if (btn) btn.hidden = !mostrar;
    if (hint) hint.hidden = !mostrar;
  }

  function _entrarOffline(overlay) {
    if (message) {
      message.textContent = 'Você entrou sem conexão. Os dados são os deste aparelho.';
    }
    _alternarUiOffline(false);
    _authOnSuccess(overlay, { viaBiometric: true, offline: true });
    if (typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
      UTILS.mostrarToast(
        'Sem conexão — usando os dados deste aparelho. A sincronização volta quando a internet voltar.',
        'info',
      );
    }
  }

  /**
   * Painel de desbloqueio quando o servidor está fora de alcance.
   * Esconde o campo de senha (que não tem como ser conferido offline) e
   * oferece biometria + entrada direta.
   */
  function _mostrarEntradaOffline(overlay) {
    var sess = (typeof SUPA_AUTH !== 'undefined' && SUPA_AUTH.isActive && SUPA_AUTH.isActive())
      ? SUPA_AUTH.getSessionSync()
      : DADOS.getSessao();
    var emailInput = document.getElementById('auth-login-email');
    if (sess && sess.user && sess.user.email && emailInput) {
      emailInput.value = sess.user.email;
      if (sess.user.name) _authSalvar(AUTH_DISPLAY_NAME_KEY, sess.user.name);
    }

    /* Liga antes de mexer na tela: a partir daqui showLoginStep não reescreve
       a mensagem, nem agora nem quando o prefill rodar depois. */
    _alternarUiOffline(true);
    showTab('login');
    showLoginStep('password');

    /* A senha não confere offline — deixar o campo à vista seria um convite a
       um erro que o app não tem como julgar. */
    if (loginForm) {
      loginForm.hidden = true;
      loginForm.style.display = 'none';
    }
    if (message) {
      message.textContent = 'Sem conexão com o servidor. Você pode continuar com os dados deste aparelho.';
    }
    if (typeof renderLucideIconsNow === 'function') renderLucideIconsNow(overlay);
    if (_authFocusTrap && typeof _authFocusTrap.refresh === 'function') _authFocusTrap.refresh();

    /* Biometria funciona offline quando a sessão já está em cache: o
       verifyIdentity é do aparelho e o validate() só lê o storage. */
    setTimeout(_tentarBiometriaAutomatica, 350);
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
  var offlineBtnEl = document.getElementById('auth-offline-btn');
  if (offlineBtnEl && offlineBtnEl.dataset.offlineBound !== '1') {
    offlineBtnEl.dataset.offlineBound = '1';
    offlineBtnEl.addEventListener('click', function() { _entrarOffline(overlay); });
  }
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
    if (message && !_offlineAtivo) {
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
    _atualizarBotaoSairAuth();
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

  function _tentarBiometriaAutomatica() {
    if (_authBiometricAutoTried || _authBiometricInFlight) return;
    if (typeof AUTH_BIOMETRIC === 'undefined' || !AUTH_BIOMETRIC.isEnabled || !AUTH_BIOMETRIC.isEnabled()) return;
    if (!AUTH_BIOMETRIC.tryLogin) return;
    _authBiometricAutoTried = true;
    AUTH_BIOMETRIC.isAvailable().then(function(ok) {
      if (!ok) return;
      _authBiometricInFlight = true;
      AUTH_BIOMETRIC.tryLogin().then(function(result) {
        var emailInput = document.getElementById('auth-login-email');
        if (emailInput && result && result.email) emailInput.value = result.email;
        _authGateMfaThenSuccess(overlay, { viaBiometric: true });
      }).catch(function() {
        /* Falhou/cancelou: silencioso. O usuário conclui com senha e a tela
           NÃO reabre sozinha (guardas _authBiometricAutoTried/InFlight). */
      }).finally(function() {
        _authBiometricInFlight = false;
      });
    });
  }

  function _mostrarResetSenha() {
    tabs.forEach(function(tab) { tab.style.display = 'none'; });
    if (loginFlow) { loginFlow.style.display = 'none'; loginFlow.hidden = true; }
    if (registerForm) { registerForm.style.display = 'none'; registerForm.hidden = true; }
    if (totpForm) { totpForm.style.display = 'none'; totpForm.hidden = true; }
    if (resetPasswordForm) { resetPasswordForm.style.display = ''; resetPasswordForm.hidden = false; }
    if (screenTitle) screenTitle.textContent = 'Nova senha';
    if (message) message.textContent = 'Defina uma nova senha para continuar.';
    _abrirAuthOverlay(overlay);
    var passInput = document.getElementById('auth-reset-password');
    if (passInput) {
      passInput.value = '';
      passInput.focus();
    }
    if (_authFocusTrap && typeof _authFocusTrap.refresh === 'function') _authFocusTrap.refresh();
  }

  /**
   * @param {Promise<boolean>} [alcance] Ping já em andamento, para não repetir.
   */
  function _mostrarDesbloqueioSessao(alcance) {
    var emailInput = document.getElementById('auth-login-email');
    var sess = (typeof SUPA_AUTH !== 'undefined' && SUPA_AUTH.isActive && SUPA_AUTH.isActive())
      ? SUPA_AUTH.getSessionSync()
      : DADOS.getSessao();
    if (sess && sess.user && sess.user.email && emailInput) {
      emailInput.value = sess.user.email;
      if (sess.user.name) _authSalvar(AUTH_DISPLAY_NAME_KEY, sess.user.name);
    }
    showTab('login');
    showLoginStep('password');
    /* Voltou o sinal depois de uma sessão offline: some com a saída offline e
       devolve o campo de senha (showLoginStep já reexibe o formulário). */
    _alternarUiOffline(false);
    if (message) {
      message.textContent = 'Por segurança, confirme sua identidade para continuar.';
    }
    setTimeout(_tentarBiometriaAutomatica, 350);

    /* O caminho rápido aparece na hora; a saída offline só entra em cena
       quando o ping confirma que o servidor não responde. Assim a rede lenta
       não atrasa quem está online, e quem está sem sinal não fica preso. */
    (alcance || _checkCloudReachable()).then(function(online) {
      if (online) return;
      if (_authEstaDesbloqueado()) return; // biometria já resolveu
      _mostrarEntradaOffline(overlay);
    });
  }

  overlay.addEventListener('fp-auth-reopen', function() {
    showTab('login');
  });

  overlay.addEventListener('fp-auth-unlock', function() {
    _mostrarDesbloqueioSessao();
  });

  if (typeof window !== 'undefined') {
    window.addEventListener('fp-auth-recovery', function() {
      _mostrarResetSenha();
    });
  }

  if (emailStepForm) {
    emailStepForm.addEventListener('submit', function(e) {
      e.preventDefault();
      var email = document.getElementById('auth-login-email').value.trim();
      if (!email) return;
      if (!_authValidarEmail(email)) {
        var errMsg = 'Digite um e-mail válido.';
        if (message) message.textContent = errMsg;
        UTILS.mostrarToast(errMsg, 'warning');
        return;
      }
      showLoginStep('password');
    });
  }

  if (changeEmailBtn) {
    changeEmailBtn.addEventListener('click', function() {
      showLoginStep('email');
      _authMostrarReenviarEmail(false);
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
        /* O retorno precisa aparecer NA TELA: o toast fica sobre o overlay só
           depois do ajuste de z-index, e mesmo assim some em 3s. Sem a mensagem
           fixa, tocar em "Esqueci minha senha" parecia não fazer nada. */
        forgotBtn.disabled = true;
        if (message) message.textContent = 'Enviando link de redefinição…';
        SUPA_AUTH.resetPasswordEmail(email).then(function() {
          var aviso = 'Link enviado para ' + _mascararEmail(email)
            + '. Abra o e-mail neste aparelho para definir a nova senha.';
          if (message) message.textContent = aviso;
          UTILS.mostrarToast(aviso, 'info');
        }).catch(function(err) {
          if (message) {
            message.textContent = (err && err.message)
              || 'Não foi possível enviar o e-mail de recuperação.';
          }
          _authOnError(err, 'Não foi possível enviar o e-mail de recuperação.');
        }).finally(function() {
          forgotBtn.disabled = false;
        });
        return;
      }
      UTILS.mostrarToast('Recuperação de senha disponível apenas com login na nuvem.', 'info');
    });
  }

  var resendEmailBtn = document.getElementById('auth-resend-email-btn');
  if (resendEmailBtn && resendEmailBtn.dataset.bound !== '1') {
    resendEmailBtn.dataset.bound = '1';
    resendEmailBtn.addEventListener('click', function() {
      var email = resendEmailBtn.dataset.resendEmail
        || (document.getElementById('auth-login-email') || {}).value || '';
      email = String(email).trim();
      if (!email) {
        UTILS.mostrarToast('Informe seu e-mail na etapa anterior.', 'warning');
        showLoginStep('email');
        return;
      }
      if (typeof SUPA_AUTH === 'undefined' || !SUPA_AUTH.resendSignupEmail) {
        UTILS.mostrarToast('Reenvio disponível apenas com login na nuvem.', 'info');
        return;
      }
      resendEmailBtn.disabled = true;
      SUPA_AUTH.resendSignupEmail(email).then(function() {
        UTILS.mostrarToast('E-mail de confirmação reenviado para ' + email + '.', 'info');
        _authMostrarReenviarEmail(false);
      }).catch(function(err) {
        _authOnError(err, 'Não foi possível reenviar o e-mail.');
      }).finally(function() {
        resendEmailBtn.disabled = false;
      });
    });
  }

  if (biometricBtn) {
    biometricBtn.addEventListener('click', function() {
      if (typeof AUTH_BIOMETRIC === 'undefined' || !AUTH_BIOMETRIC.tryLogin) return;
      biometricBtn.disabled = true;
      _authBiometricInFlight = true;
      AUTH_BIOMETRIC.tryLogin().then(function(result) {
        var emailInput = document.getElementById('auth-login-email');
        if (emailInput && result && result.email) emailInput.value = result.email;
        _authGateMfaThenSuccess(overlay, { viaBiometric: true });
      }).catch(function(err) {
        var msg = (err && err.message) || 'Biometria não reconhecida.';
        if (!/cancel|user cancel/i.test(msg)) {
          UTILS.mostrarToast(msg, 'error');
        }
      }).finally(function() {
        _authBiometricInFlight = false;
        biometricBtn.disabled = false;
      });
    });
  }

  if (loginForm) {
    loginForm.addEventListener('submit', function(e) {
      e.preventDefault();
      var email = document.getElementById('auth-login-email').value.trim();
      var password = document.getElementById('auth-login-password').value;
      _setAuthSubmitting(loginForm, true, 'Entrando…');
      DADOS.loginApi(email, password).then(function(data) {
        if (data && data.requiresTotp && data.pendingToken) {
          showTotpStep(data.pendingToken);
          return;
        }
        _authMostrarReenviarEmail(false);
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
      _setAuthSubmitting(totpForm, true, 'Verificando…');
      DADOS.verifyTotpLoginApi(_pendingTotpToken, code).then(function() {
        hideTotpStep();
        _authOnSuccess(overlay);
      }).catch(function(err) {
        UTILS.mostrarToast(err.message || 'Código inválido', 'error');
      }).finally(function() {
        _setAuthSubmitting(totpForm, false);
      });
    });
  }

  /* Perdeu o autenticador: um código de recuperação desliga o 2FA e devolve o
     acesso. A sessão já está autenticada (AAL1) — só falta o segundo fator,
     que o código dispensa uma única vez. */
  var totpRecoveryBtn = document.getElementById('auth-totp-recovery');
  if (totpRecoveryBtn) {
    totpRecoveryBtn.addEventListener('click', function() {
      if (typeof SUPA_AUTH === 'undefined' || !SUPA_AUTH.mfaRecoveryConsume) {
        UTILS.mostrarToast('Recuperação indisponível nesta versão.', 'warning');
        return;
      }
      /* INIT_MODALS não tem prompt: montar um com fpAlert + input, mesmo
         padrão usado no setup do TOTP (init-2fa.js). */
      var pedir = function(cb) {
        if (typeof INIT_MODALS === 'undefined' || !INIT_MODALS.fpAlert) {
          cb(window.prompt('Código de recuperação:') || '');
          return;
        }
        var html =
          '<div class="totp-setup">' +
            '<p>Digite um dos códigos que você guardou ao ativar a verificação em duas etapas.</p>' +
            '<label class="auth-field" for="auth-recovery-code"><span>Código de recuperação</span>' +
              '<input type="text" id="auth-recovery-code" autocomplete="one-time-code" ' +
              'autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX">' +
            '</label>' +
          '</div>';
        INIT_MODALS.fpAlert(html, {
          title: 'Entrar com código de recuperação',
          trustedHtml: true,
          okLabel: 'Usar código',
        });
        var input = document.getElementById('auth-recovery-code');
        if (input) input.focus();
        var btn = document.querySelector('.modal-overlay .modal-btn');
        if (btn) {
          btn.onclick = function() {
            var valor = (document.getElementById('auth-recovery-code') || {}).value || '';
            var ov = document.querySelector('.modal-overlay');
            if (ov) ov.remove();
            cb(valor.trim());
          };
        }
      };
      pedir(function(codigo) {
        if (!codigo) return;
        if (message) message.textContent = 'Verificando código de recuperação…';
        totpRecoveryBtn.disabled = true;
        SUPA_AUTH.mfaRecoveryConsume(codigo).then(function() {
          hideTotpStep();
          if (message) {
            message.textContent = 'Código aceito. A verificação em duas etapas foi desligada — '
              + 'reative nas configurações assim que possível.';
          }
          UTILS.mostrarToast('2FA desligado por código de recuperação. Reative nas configurações.', 'warning');
          _authOnSuccess(overlay);
        }).catch(function(err) {
          if (message) {
            message.textContent = (err && err.message) || 'Código de recuperação inválido.';
          }
          _authOnError(err, 'Código de recuperação inválido.');
        }).finally(function() {
          totpRecoveryBtn.disabled = false;
        });
      });
    });
  }

  var totpBack = document.getElementById('auth-totp-back');
  if (totpBack) {
    totpBack.addEventListener('click', function() {
      var done = function() { hideTotpStep(); };
      if (typeof SUPA_AUTH !== 'undefined' && SUPA_AUTH.logout) {
        SUPA_AUTH.logout().then(done).catch(done);
      } else {
        done();
      }
    });
  }

  /* Medidor de força: informa, não bloqueia. Quem decide o que é aceito é
     PASSWORD_POLICY.validar() no submit. */
  function _montarMedidorSenha(inputId) {
    var input = document.getElementById(inputId);
    if (!input || input.dataset.medidor === '1') return;
    if (typeof PASSWORD_POLICY === 'undefined' || !PASSWORD_POLICY.forca) return;
    input.dataset.medidor = '1';

    var wrap = document.createElement('div');
    wrap.className = 'senha-medidor';
    wrap.hidden = true;
    wrap.innerHTML = '<div class="senha-medidor-barra"><i></i></div>'
      + '<span class="senha-medidor-rotulo" aria-live="polite"></span>';

    var campo = input.closest('.auth-field') || input.parentNode;
    if (campo && campo.parentNode) campo.parentNode.insertBefore(wrap, campo.nextSibling);

    var barra = wrap.querySelector('i');
    var rotulo = wrap.querySelector('.senha-medidor-rotulo');

    input.addEventListener('input', function() {
      var valor = input.value || '';
      if (!valor) { wrap.hidden = true; return; }
      var f = PASSWORD_POLICY.forca(valor);
      wrap.hidden = false;
      wrap.setAttribute('data-nota', String(f.nota));
      barra.style.width = (f.nota * 25) + '%';
      rotulo.textContent = f.rotulo;
    });
  }

  _montarMedidorSenha('auth-register-password');
  _montarMedidorSenha('auth-reset-password');

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
      _setAuthSubmitting(registerForm, true, 'Criando conta…');
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
          _authMostrarReenviarEmail(true, email);
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

  if (resetPasswordForm) {
    resetPasswordForm.addEventListener('submit', function(e) {
      e.preventDefault();
      var password = document.getElementById('auth-reset-password').value;
      if (typeof VALIDATIONS !== 'undefined' && VALIDATIONS.validarSenha) {
        var senhaVal = VALIDATIONS.validarSenha(password);
        if (!senhaVal.valido) {
          UTILS.mostrarToast(senhaVal.erro, 'error');
          return;
        }
      }
      if (typeof SUPA_AUTH === 'undefined' || !SUPA_AUTH.updatePassword) {
        UTILS.mostrarToast('Redefinição indisponível.', 'error');
        return;
      }
      _setAuthSubmitting(resetPasswordForm, true, 'Salvando…');
      SUPA_AUTH.updatePassword(password).then(function() {
        if (SUPA_AUTH.clearRecoveryPending) SUPA_AUTH.clearRecoveryPending();
        UTILS.mostrarToast('Senha atualizada. Entre com a nova senha.', 'success');
        if (resetPasswordForm) { resetPasswordForm.style.display = 'none'; resetPasswordForm.hidden = true; }
        tabs.forEach(function(tab) { tab.style.display = ''; });
        if (loginFlow) { loginFlow.style.display = ''; loginFlow.hidden = false; }
        showTab('login');
        showLoginStep('password');
        if (message) message.textContent = 'Digite sua nova senha para continuar.';
      }).catch(function(err) {
        _authOnError(err, 'Não foi possível salvar a nova senha.');
      }).finally(function() {
        _setAuthSubmitting(resetPasswordForm, false);
      });
    });
  }

  if (warning) {
    if (window.location.protocol === 'file:') {
      warning.style.display = 'block';
      warning.textContent = 'Modo local (file://). Login e sincronização na nuvem exigem o app instalado ou https://app.financaspro.com.';
    } else {
      warning.style.display = 'none';
      warning.textContent = '';
    }
  }

  if (typeof SUPA_AUTH !== 'undefined' && SUPA_AUTH.isActive()) {
    if (totpForm) {
      totpForm.hidden = true;
      totpForm.style.display = 'none';
    }
    var alcance = _checkCloudReachable();
    _abrirAuthOverlay(overlay);
    var bootAuth = (SUPA_AUTH.consumeAuthCallback)
      ? SUPA_AUTH.consumeAuthCallback()
      : Promise.resolve(null);
    bootAuth.then(function(type) {
      if (type === 'recovery' || (SUPA_AUTH.isRecoveryPending && SUPA_AUTH.isRecoveryPending())) {
        _mostrarResetSenha();
        return;
      }
      /**
       * A saída offline NÃO espera o validate().
       *
       * Quando o access_token já venceu — o caso normal de abrir o app no dia
       * seguinte — o getSession() do supabase-js tenta renovar, e sem rede ele
       * entra em retry com backoff: a promessa fica pendente por dezenas de
       * segundos. Todo o boot ficava pendurado nela e a pessoa encarava uma
       * tela de login parada, sem saber que os dados dela estão no aparelho.
       *
       * Quem decide aqui é o ping, que tem teto de tempo próprio. Se o
       * servidor não responde e existe sessão gravada neste aparelho, a
       * entrada offline aparece na hora; o validate(), quando finalmente
       * resolver, encontra o `_resolvidoOffline` e não desfaz nada.
       */
      var _resolvidoOffline = false;
      alcance.then(function(online) {
        if (online || _authEstaDesbloqueado()) return;
        if (!(SUPA_AUTH.temSessaoPersistida && SUPA_AUTH.temSessaoPersistida())) return;
        _resolvidoOffline = true;
        _mostrarEntradaOffline(overlay);
      });

      return SUPA_AUTH.validate().then(function (logged) {
        if (_resolvidoOffline) return;
        if (!logged) {
          showTab('login');
          return;
        }
        if (!_authEstaDesbloqueado()) {
          /* Com servidor ao alcance, o desbloqueio normal por senha ou
             biometria. _mostrarDesbloqueioSessao ainda consulta o ping por
             conta própria, para o caso de a rede cair entre o boot e aqui. */
          _mostrarDesbloqueioSessao(alcance);
          return;
        }
        return _authGateMfaThenSuccess(overlay);
      }).then(function() {
        atualizarBarraSessao();
      });
    }).catch(function() {
      showTab('login');
      atualizarBarraSessao();
    });
    _authRegistrarBloqueioAoRetomar(overlay);
    return false;
  }

  var sessao = DADOS.getSessao();
  if (sessao && sessao.user) {
    if (DADOS._apiAtiva()) {
      DADOS.validarSessaoApi().then(function(ok) {
        if (ok && _authEstaDesbloqueado()) {
          _fecharAuthOverlay(overlay);
        } else if (ok) {
          _abrirAuthOverlay(overlay);
          _mostrarDesbloqueioSessao();
        } else {
          _abrirAuthOverlay(overlay);
          showTab('login');
        }
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
  setupLogoutButton();
  _atualizarBotaoSairAuth();
  return false;
}

/**
 * Antes: ao sair para outra aba/app e voltar, revogava o desbloqueio e pedia
 * senha/biometria de novo. Isso atrapalha uso normal (consultar algo e voltar).
 * Mantemos a sessão desbloqueada até logout explícito ou fim do processo.
 */
function _authRegistrarBloqueioAoRetomar(overlay) {
  if (!overlay) return;
  overlay.dataset.authResumeBound = '1';
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

function _executarLogout() {
  authLimparAoSair();
  var overlay = document.getElementById('auth-overlay');
  if (overlay) {
    _abrirAuthOverlay(overlay);
    overlay.dispatchEvent(new CustomEvent('fp-auth-reopen'));
  }
  atualizarBarraSessao();
  if (typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
    UTILS.mostrarToast('Você saiu da conta. Seus dados continuam neste aparelho.', 'info');
  }
}

function sairDaConta() {
  if (typeof INIT_MODALS !== 'undefined' && INIT_MODALS.confirm) {
    INIT_MODALS.confirm('Deseja sair da sua conta?', function() {
      _executarLogout();
    });
  } else {
    _executarLogout();
  }
}

function _atualizarBotaoSairAuth() {
  var btn = document.getElementById('auth-exit-btn');
  if (!btn) return;
  btn.hidden = !_authTemSessaoNuvem();
}

function setupLogoutButton() {
  var btn = document.getElementById('btn-logout');
  if (!btn || btn.dataset.logoutBound === '1') return;
  btn.dataset.logoutBound = '1';
  btn.addEventListener('click', sairDaConta);

  var authExit = document.getElementById('auth-exit-btn');
  if (authExit && authExit.dataset.logoutBound !== '1') {
    authExit.dataset.logoutBound = '1';
    authExit.addEventListener('click', sairDaConta);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    setupAuthUI: setupAuthUI,
    authLimparAoSair: authLimparAoSair,
    atualizarBarraSessao: atualizarBarraSessao,
    setupLogoutButton: setupLogoutButton,
    sairDaConta: sairDaConta,
  };
}
