/**
 * auth-biometric.js — login biométrico no app nativo (Capacitor/Android).
 * Guarda o refresh token do Supabase no Keystore, protegido por biometria.
 * No navegador/PWA é inerte (sem custo de serviço).
 */
(function() {
  'use strict';

  var SERVER = 'financaspro-auth';
  var PREF_KEY = 'fp-biometric-enabled';

  function _native() {
    if (typeof window === 'undefined' || !window.Capacitor) return null;
    if (typeof window.Capacitor.isNativePlatform === 'function'
        && !window.Capacitor.isNativePlatform()) return null;
    var plugins = window.Capacitor.Plugins || {};
    return plugins.NativeBiometric || null;
  }

  function _readPref() {
    try { return localStorage.getItem(PREF_KEY) === '1'; } catch (e) { return false; }
  }

  function _writePref(on) {
    try { localStorage.setItem(PREF_KEY, on ? '1' : '0'); } catch (e) { /* noop */ }
  }

  var AUTH_BIOMETRIC = {
    isNative: function() { return !!_native(); },

    isAvailable: function() {
      var nb = _native();
      if (!nb || typeof nb.isAvailable !== 'function') return Promise.resolve(false);
      return nb.isAvailable().then(function(r) {
        return !!(r && (r.isAvailable || r.biometryType));
      }).catch(function() { return false; });
    },

    isEnabled: function() {
      return _readPref();
    },

    refreshBiometricUI: function() {
      var card = document.getElementById('perfil-biometric-card');
      var chk = document.getElementById('chk-biometric');
      var status = document.getElementById('perfil-biometric-status');
      var btn = document.getElementById('auth-biometric-btn');
      var hint = document.getElementById('auth-biometric-hint');
      if (!card && !btn && !hint) return Promise.resolve();

      return AUTH_BIOMETRIC.isAvailable().then(function(ok) {
        var show = ok && typeof SUPA_AUTH !== 'undefined' && SUPA_AUTH.isActive && SUPA_AUTH.isActive();
        var enabled = _readPref();
        if (card) card.hidden = !show;
        if (chk) chk.checked = enabled;
        if (status) {
          status.textContent = !show
            ? 'Disponível no app Android'
            : (enabled ? 'Ativo neste aparelho' : 'Desativado');
        }
        if (btn) btn.hidden = !(show && enabled);
        if (hint) hint.hidden = !(show && !enabled);
      });
    },

    enable: function() {
      var nb = _native();
      if (!nb || typeof SUPA_AUTH === 'undefined' || !SUPA_AUTH.getRefreshToken) {
        return Promise.reject(new Error('Biometria indisponível neste dispositivo.'));
      }
      return AUTH_BIOMETRIC.isAvailable().then(function(ok) {
        if (!ok) throw new Error('Este aparelho não suporta biometria.');
        return nb.verifyIdentity({
          reason: 'Ativar login com biometria no FinançasPro',
          title: 'FinançasPro',
          subtitle: 'Confirme sua identidade',
          description: '',
        });
      }).then(function() {
        return SUPA_AUTH.getRefreshToken();
      }).then(function(token) {
        if (!token) throw new Error('Faça login com senha antes de ativar a biometria.');
        var sess = SUPA_AUTH.getSessionSync();
        var email = sess && sess.user && sess.user.email;
        if (!email) throw new Error('Sessão inválida. Entre com senha novamente.');
        return nb.setCredentials({
          username: email,
          password: token,
          server: SERVER,
        }).then(function() {
          _writePref(true);
          return AUTH_BIOMETRIC.refreshBiometricUI();
        });
      });
    },

    disable: function() {
      var nb = _native();
      _writePref(false);
      if (nb && typeof nb.deleteCredentials === 'function') {
        return nb.deleteCredentials({ server: SERVER }).catch(function() {})
          .then(function() { return AUTH_BIOMETRIC.refreshBiometricUI(); });
      }
      return AUTH_BIOMETRIC.refreshBiometricUI();
    },

    tryLogin: function() {
      var nb = _native();
      if (!nb || !_readPref()) {
        return Promise.reject(new Error('Biometria não configurada.'));
      }
      return nb.verifyIdentity({
        reason: 'Entrar no FinançasPro',
        title: 'FinançasPro',
        subtitle: 'Use sua biometria',
        description: '',
      }).then(function() {
        /* O Supabase rotaciona o refresh token e invalida o anterior. Ao reabrir
           o app, o próprio cliente já renovou a sessão a partir do storage — e o
           token guardado no Keystore virou "already used". Chamar setSession com
           ele derrubava o login biométrico com um erro que nem aparecia na tela.

           Então: se já existe sessão válida, a biometria só confirma identidade.
           O Keystore só é usado quando realmente não há sessão. */
        if (typeof SUPA_AUTH === 'undefined' || !SUPA_AUTH.validate) return false;
        return SUPA_AUTH.validate().catch(function() { return false; });
      }).then(function(temSessao) {
        var sess = (typeof SUPA_AUTH !== 'undefined' && SUPA_AUTH.getSessionSync)
          ? SUPA_AUTH.getSessionSync() : null;
        if (temSessao && sess && sess.user) {
          // Regrava o token atual: o do Keystore pode ter ficado para trás.
          AUTH_BIOMETRIC.onLoginSuccess(sess);
          return { email: sess.user.email };
        }
        return AUTH_BIOMETRIC._loginComKeystore(nb);
      }).catch(function(err) {
        var msg = String((err && err.message) || err);
        if (/not found|no credentials/i.test(msg)) {
          return AUTH_BIOMETRIC.disable().then(function() { throw err; });
        }
        /* Token vencido ou já usado: a biometria continua ativa e volta a
           funcionar sozinha depois de UM login por senha (onLoginSuccess
           regrava o token novo). O usuário precisa saber disso. */
        if (/already used|invalid refresh token|refresh_token_not_found|expired/i.test(msg)) {
          throw new Error('Sua sessão expirou. Entre com a senha uma vez para reativar a biometria.');
        }
        throw err;
      });
    },

    /** Sem sessão no cliente: restaura a partir do token guardado no Keystore. */
    _loginComKeystore: function(nb) {
      return nb.getCredentials({ server: SERVER }).then(function(creds) {
        if (!creds || !creds.username || !creds.password) {
          throw new Error('Credenciais biométricas não encontradas.');
        }
        if (typeof SUPA_AUTH === 'undefined' || !SUPA_AUTH.restoreSession) {
          throw new Error('Login na nuvem indisponível.');
        }
        return SUPA_AUTH.restoreSession(creds.password).then(function(sess) {
          // A restauração já rotacionou o token — guardar o novo agora.
          AUTH_BIOMETRIC.onLoginSuccess(sess);
          return { email: creds.username };
        });
      });
    },

    onLoginSuccess: function(sess) {
      if (!_readPref() || !_native()) return Promise.resolve();
      return SUPA_AUTH.getRefreshToken().then(function(token) {
        if (!token) return;
        var email = sess && sess.user && sess.user.email;
        if (!email) return;
        return _native().setCredentials({
          username: email,
          password: token,
          server: SERVER,
        });
      }).catch(function() { /* não bloqueia login */ });
    },

    offerEnableAfterLogin: function() {
      if (_readPref() || !_native()) return Promise.resolve(false);
      return AUTH_BIOMETRIC.isAvailable().then(function(ok) {
        if (!ok) return false;
        return new Promise(function(resolve) {
          var msg = 'Deseja entrar com biometria facial ou digital nas próximas vezes?';
          var onYes = function() {
            AUTH_BIOMETRIC.enable().then(function() { resolve(true); }).catch(function(err) {
              if (typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
                UTILS.mostrarToast((err && err.message) || 'Não foi possível ativar a biometria.', 'error');
              }
              resolve(false);
            });
          };
          var onNo = function() { resolve(false); };
          if (typeof INIT_MODALS !== 'undefined' && INIT_MODALS.fpConfirm) {
            INIT_MODALS.fpConfirm(msg, onYes, onNo, {
              okLabel: 'Ativar',
              cancelLabel: 'Agora não',
            });
            return;
          }
          if (window.confirm(msg)) onYes();
          else onNo();
        });
      });
    },

    setupPerfilToggle: function() {
      var chk = document.getElementById('chk-biometric');
      if (!chk || chk.dataset.bound === '1') return;
      chk.dataset.bound = '1';
      chk.addEventListener('change', function() {
        var turningOn = chk.checked;
        var action = turningOn ? AUTH_BIOMETRIC.enable() : AUTH_BIOMETRIC.disable();
        action.catch(function(err) {
          chk.checked = !turningOn;
          if (typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
            UTILS.mostrarToast((err && err.message) || 'Não foi possível alterar a biometria.', 'error');
          }
        });
      });
      AUTH_BIOMETRIC.refreshBiometricUI();
    },
  };

  window.AUTH_BIOMETRIC = AUTH_BIOMETRIC;
})();
