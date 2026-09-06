/**
 * supabase.js — cliente Supabase + adaptador de autenticação.
 *
 * Liga o login/cadastro/logout do app ao Supabase Auth SEM tocar na camada de
 * sincronização de dados (que segue local-first). Só sobrescreve os métodos de
 * AUTENTICAÇÃO do DADOS que o authController chama.
 *
 * Se CONFIG.SUPABASE_URL/ANON_KEY estiverem vazios, este módulo é inerte e o
 * app continua exatamente como antes (local-first, sem login forçado).
 *
 * Carrega DEPOIS de js/vendor/supabase.js (UMD, expõe window.supabase) e de
 * js/core/dados.js (expõe DADOS).
 */
(function () {
  'use strict';

  var url = (typeof CONFIG !== 'undefined' && CONFIG.SUPABASE_URL || '').trim();
  var key = (typeof CONFIG !== 'undefined' && CONFIG.SUPABASE_ANON_KEY || '').trim();
  var lib = window.supabase;

  if (!url || !key || !lib || typeof lib.createClient !== 'function') {
    window.SUPA_AUTH = { isActive: function () { return false; } };
    return; // Supabase não configurado → nada muda.
  }

  /* Uma constante, não um literal repetido: temSessaoPersistida() lê esta
     mesma chave direto do disco, e as duas não podem divergir em silêncio. */
  var STORAGE_KEY = 'fp-supabase-auth';

  var client = lib.createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: STORAGE_KEY
    }
  });
  window.SB = client;

  // Cache SÍNCRONO da sessão — o authController lê getSessao() de forma síncrona.
  var _session = null;
  var _pendingRecovery = false;

  function _authRedirectUrl() {
    if (typeof window !== 'undefined' && window.location && window.location.origin) {
      var origin = window.location.origin.replace(/\/$/, '');
      if (/^https:\/\/app\.financaspro\.com$/i.test(origin)
          || (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())) {
        return origin + '/';
      }
      if (window.location.protocol !== 'file:') {
        return origin + '/';
      }
    }
    return 'https://app.financaspro.com/';
  }

  function _emitRecoveryPending() {
    _pendingRecovery = true;
    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('fp-auth-recovery'));
      } catch (e) { /* noop */ }
    }
  }

  /** Consome tokens do hash (#access_token=…) após link de e-mail (reset, confirmação). */
  function _consumeAuthHashFromLocation(loc) {
    if (!loc || !loc.hash) return Promise.resolve(null);
    var raw = String(loc.hash).replace(/^#/, '');
    if (!raw || raw.indexOf('access_token=') < 0) return Promise.resolve(null);
    var params = new URLSearchParams(raw);
    var access = params.get('access_token');
    var refresh = params.get('refresh_token');
    var type = params.get('type') || '';
    if (!access || !refresh) return Promise.resolve(null);
    return client.auth.setSession({ access_token: access, refresh_token: refresh }).then(function (r) {
      if (r.error) throw new Error(_msg(r.error));
      _session = (r.data && r.data.session) || null;
      try {
        var clean = loc.pathname + (loc.search || '');
        window.history.replaceState({}, '', clean);
      } catch (e) { /* noop */ }
      if (type === 'recovery') _emitRecoveryPending();
      return type || 'session';
    });
  }

  function _toSessao(s) {
    if (!s || !s.user) return null;
    var u = s.user;
    var nome = (u.user_metadata && u.user_metadata.name) ||
      (u.email ? u.email.split('@')[0] : 'Usuário');
    return { user: { id: u.id, email: u.email, name: nome }, token: s.access_token };
  }

  // Popula o cache no boot e mantém atualizado.
  client.auth.getSession().then(function (r) {
    _session = (r && r.data && r.data.session) || null;
  }).catch(function () {});
  client.auth.onAuthStateChange(function (_evt, s) {
    _session = s || null;
    if (_evt === 'PASSWORD_RECOVERY') _emitRecoveryPending();
    if (typeof atualizarBarraSessao === 'function') atualizarBarraSessao();
    /* O Supabase rotaciona o refresh token a cada renovação. Se a biometria
       estiver ativa, precisamos regravar o token novo no Keystore — senão o
       guardado vira obsoleto e o login por biometria passa a falhar. */
    if (_evt === 'TOKEN_REFRESHED'
        && typeof AUTH_BIOMETRIC !== 'undefined'
        && AUTH_BIOMETRIC.isEnabled && AUTH_BIOMETRIC.isEnabled()
        && AUTH_BIOMETRIC.onLoginSuccess) {
      try { AUTH_BIOMETRIC.onLoginSuccess(_toSessao(s)); } catch (e) { /* noop */ }
    }
  });

  function _msg(e) {
    var m = (e && e.message) || 'Falha na autenticação';
    if (/failed to fetch|networkerror|network error|load failed/i.test(m)) {
      return 'Sem conexão com o servidor. Verifique sua internet e tente de novo.';
    }
    if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha inválidos.';
    if (/Email not confirmed/i.test(m)) return 'Confirme seu e-mail antes de entrar.';
    /* Nunca confirmar que um e-mail já tem conta: isso permite enumerar
       usuários do app. Mesma resposta para cadastro novo e repetido. */
    if (/User already registered|already registered/i.test(m)) {
      return 'Não foi possível concluir o cadastro. Confira o e-mail digitado e tente de novo.';
    }
    if (/Password should be|at least/i.test(m)) return 'Senha muito curta (mínimo 8 caracteres).';
    if (/rate limit|too many/i.test(m)) return 'Muitas tentativas. Aguarde um instante.';
    return m;
  }

  function _msgRecovery(e) {
    var m = String((e && e.message) || e);
    if (/MFA_REQUIRED/.test(m)) {
      return 'Confirme o código do autenticador antes de gerar novos códigos de recuperação.';
    }
    if (/NOT_AUTHENTICATED/.test(m)) return 'Sessão expirada. Entre novamente.';
    /* Teto de tentativas no servidor. A mensagem traz os segundos que faltam —
       dizer "tente mais tarde" sem o quanto é o tipo de aviso que não ajuda. */
    var limite = m.match(/RECOVERY_RATE_LIMITED:(\d+)/);
    if (limite) {
      var seg = parseInt(limite[1], 10) || 60;
      var min = Math.ceil(seg / 60);
      return 'Muitas tentativas com código de recuperação. Tente de novo em '
        + (min > 1 ? min + ' minutos.' : 'cerca de 1 minuto.');
    }
    if (/function .*does not exist|schema cache/i.test(m)) {
      return 'Recursos de recuperação ainda não instalados no servidor.';
    }
    return _msg(e);
  }

  var SUPA_AUTH = {
    isActive: function () { return true; },

    /**
     * O servidor está ao alcance?
     *
     * Tem teto de tempo porque a resposta decide se o app oferece a entrada
     * offline. Em rede que aceita a conexão e não responde — Wi‑Fi de hotel,
     * portal cativo, 3G morrendo — um fetch sem AbortController fica pendurado
     * até o timeout do sistema, e o usuário encara uma tela de login parada
     * sem saber que existe uma saída.
     */
    ping: function (timeoutMs) {
      var ctrl = (typeof AbortController === 'function') ? new AbortController() : null;
      var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs || 8000) : null;
      return fetch(url.replace(/\/$/, '') + '/auth/v1/health', {
        method: 'GET',
        headers: { apikey: key, Authorization: 'Bearer ' + key },
        signal: ctrl ? ctrl.signal : undefined,
      }).then(function (res) {
        if (!res.ok) throw new Error('servidor-indisponivel');
        return true;
      }).catch(function (err) {
        var e = new Error(_msg(err));
        e.cause = err;
        throw e;
      }).finally(function () {
        if (timer) clearTimeout(timer);
      });
    },

    login: function (email, password) {
      return client.auth.signInWithPassword({ email: email, password: password })
        .then(function (r) {
          if (r.error) throw new Error(_msg(r.error));
          _session = r.data.session;
          return SUPA_AUTH._mfaGateAfterPassword();
        });
    },

    /** Após senha/biometria: se a conta exige AAL2, devolve requiresTotp. */
    _mfaGateAfterPassword: function () {
      if (!client.auth.mfa || !client.auth.mfa.getAuthenticatorAssuranceLevel) {
        return Promise.resolve({});
      }
      return client.auth.mfa.getAuthenticatorAssuranceLevel().then(function (aal) {
        if (aal.error) throw new Error(_msg(aal.error));
        var cur = aal.data && aal.data.currentLevel;
        var next = aal.data && aal.data.nextLevel;
        if (cur !== 'aal1' || next !== 'aal2') return {};
        return client.auth.mfa.listFactors().then(function (factors) {
          if (factors.error) throw new Error(_msg(factors.error));
          var totp = factors.data && factors.data.totp && factors.data.totp[0];
          if (!totp) return {};
          return { requiresTotp: true, pendingToken: totp.id };
        });
      }).catch(function (err) {
        // MFA desabilitado no projeto Supabase → login segue sem 2FA.
        if (err && /mfa|not enabled|feature/i.test(String(err.message || err))) {
          return {};
        }
        throw err;
      });
    },

    needsMfa: function () {
      return this._mfaGateAfterPassword().then(function (r) {
        return r && r.requiresTotp ? { factorId: r.pendingToken } : null;
      });
    },

    verifyMfa: function (factorId, code) {
      if (!factorId || !code) return Promise.reject(new Error('Código inválido'));
      return client.auth.mfa.challengeAndVerify({
        factorId: factorId,
        code: String(code).trim(),
      }).then(function (r) {
        if (r.error) throw new Error(_msg(r.error));
        return client.auth.getSession().then(function (s) {
          _session = (s && s.data && s.data.session) || _session;
          return {};
        });
      });
    },

    mfaStatus: function () {
      return client.auth.mfa.listFactors().then(function (r) {
        if (r.error) throw new Error(_msg(r.error));
        var totp = (r.data && r.data.totp) || [];
        var verified = totp.filter(function (f) { return f.status === 'verified'; });
        return {
          enabled: verified.length > 0,
          factorId: verified[0] ? verified[0].id : null,
        };
      });
    },

    mfaEnrollStart: function () {
      return client.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'FinançasPro',
      }).then(function (r) {
        if (r.error) throw new Error(_msg(r.error));
        var totp = r.data && r.data.totp;
        var qr = totp && totp.qr_code;
        if (qr && !/^data:|^https?:/i.test(qr)) {
          qr = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(qr);
        }
        return {
          factorId: r.data.id,
          qrCode: qr,
          secret: totp && totp.secret,
        };
      });
    },

    mfaEnrollConfirm: function (factorId, code) {
      return this.verifyMfa(factorId, code);
    },

    /* ── Códigos de recuperação do 2FA ──────────────────────────────────
       Gerar exige AAL2; consumir funciona em AAL1, porque quem usa um código
       é justamente quem perdeu o autenticador. Ver
       supabase/migrations/20260903090000_mfa_recovery_codes.sql */

    mfaRecoveryGenerate: function () {
      return client.rpc('fp_mfa_recovery_generate').then(function (r) {
        if (r.error) throw new Error(_msgRecovery(r.error));
        return (r.data || []).map(function (row) {
          return typeof row === 'string' ? row : row.fp_mfa_recovery_generate;
        });
      });
    },

    mfaRecoveryCount: function () {
      return client.rpc('fp_mfa_recovery_count').then(function (r) {
        if (r.error) throw new Error(_msgRecovery(r.error));
        return Number(r.data) || 0;
      });
    },

    mfaRecoveryConsume: function (code) {
      var limpo = String(code || '').trim();
      if (!limpo) return Promise.reject(new Error('Digite um código de recuperação.'));
      return client.rpc('fp_mfa_recovery_consume', { p_code: limpo }).then(function (r) {
        if (r.error) throw new Error(_msgRecovery(r.error));
        if (r.data !== true) {
          throw new Error('Código de recuperação inválido ou já usado.');
        }
        // O fator sumiu: renova a sessão para o app enxergar o novo estado.
        return client.auth.getSession().then(function (s) {
          _session = (s && s.data && s.data.session) || _session;
          return true;
        });
      });
    },

    mfaUnenroll: function (factorId, code) {
      var self = this;
      return this.verifyMfa(factorId, code).then(function () {
        return client.auth.mfa.unenroll({ factorId: factorId }).then(function (r) {
          if (r.error) throw new Error(_msg(r.error));
          return true;
        });
      });
    },

    register: function (nome, email, password) {
      return client.auth.signUp({
        email: email,
        password: password,
        options: { data: { name: nome } }
      }).then(function (r) {
        if (r.error) throw new Error(_msg(r.error));
        /* identities vazio = o Supabase reconheceu um e-mail já cadastrado e
           devolveu um usuário fantasma, justamente para NÃO revelar isso.
           Seguimos o mesmo caminho do cadastro novo: quem já tem conta recebe
           o e-mail do Supabase avisando, e quem só chutou endereços não
           descobre nada. */
        _session = (r.data && r.data.session) || null;
        return {
          needsEmailConfirmation: !_session,
          email: email,
        };
      }).catch(function (err) {
        if (err && err.message) throw err;
        throw new Error(_msg(err));
      });
    },

    /** Encerra a sessão nos OUTROS aparelhos, mantendo este conectado. */
    signOutOthers: function () {
      return client.auth.signOut({ scope: 'others' }).then(function (r) {
        if (r && r.error) throw new Error(_msg(r.error));
        return true;
      });
    },

    logout: function () {
      return client.auth.signOut().then(function () { _session = null; })
        .catch(function () { _session = null; });
    },

    getSessionSync: function () { return _toSessao(_session); },

    validate: function () {
      return client.auth.getSession().then(function (r) {
        _session = (r && r.data && r.data.session) || null;
        return !!_session;
      }).catch(function () { return false; });
    },

    /**
     * Existe sessão gravada NESTE aparelho? Leitura pura do storage.
     *
     * validate() não serve para esta pergunta: quando o access_token já venceu
     * — o caso normal de quem abre o app no dia seguinte — o getSession tenta
     * renovar, a renovação precisa de rede, e sem rede ele devolve false. Aí o
     * app tratava um usuário conhecido como visitante e exigia senha, que
     * também só se confere no servidor. Nenhum caminho de volta.
     *
     * Aqui a pergunta é outra: "esta pessoa já entrou neste aparelho?". A
     * resposta está no disco e não depende de ninguém.
     */
    temSessaoPersistida: function () {
      try {
        var bruto = localStorage.getItem(STORAGE_KEY);
        if (!bruto) return false;
        var dados = JSON.parse(bruto);
        return !!(dados && (dados.refresh_token || (dados.user && dados.user.id)));
      } catch (e) {
        return false;
      }
    },

    getAccessToken: function () {
      if (_session && _session.access_token) return Promise.resolve(_session.access_token);
      return client.auth.getSession().then(function (r) {
        _session = (r && r.data && r.data.session) || null;
        return _session ? _session.access_token : null;
      }).catch(function () { return null; });
    },

    getRefreshToken: function () {
      if (_session && _session.refresh_token) return Promise.resolve(_session.refresh_token);
      return client.auth.getSession().then(function (r) {
        _session = (r && r.data && r.data.session) || null;
        return _session ? _session.refresh_token : null;
      }).catch(function () { return null; });
    },

    restoreSession: function (refreshToken) {
      if (!refreshToken) return Promise.reject(new Error('Sessão expirada. Entre com sua senha.'));
      return client.auth.setSession({ refresh_token: refreshToken }).then(function (r) {
        if (r.error) throw new Error(_msg(r.error));
        _session = (r.data && r.data.session) || null;
        if (!_session) throw new Error('Não foi possível restaurar a sessão.');
        return _toSessao(_session);
      });
    },

    resetPasswordEmail: function (email) {
      return client.auth.resetPasswordForEmail(email, { redirectTo: _authRedirectUrl() }).then(function (r) {
        if (r.error) throw new Error(_msg(r.error));
        return true;
      });
    },

    consumeAuthCallback: function (loc) {
      return _consumeAuthHashFromLocation(loc || (typeof window !== 'undefined' ? window.location : null));
    },

    isRecoveryPending: function () { return _pendingRecovery; },

    clearRecoveryPending: function () { _pendingRecovery = false; },

    updatePassword: function (newPassword) {
      return client.auth.updateUser({ password: newPassword }).then(function (r) {
        if (r.error) throw new Error(_msg(r.error));
        _pendingRecovery = false;
        /* Trocar a senha tem que expulsar quem estava dentro com a senha antiga
           — inclusive uma sessão roubada. 'others' preserva a sessão atual, que
           acabou de provar a identidade. Falha aqui não desfaz a troca. */
        return client.auth.signOut({ scope: 'others' })
          .catch(function () { /* sessão única ou rede instável */ })
          .then(function () { return true; });
      });
    },

    reauthWithPassword: function (email, password) {
      return client.auth.signInWithPassword({ email: email, password: password }).then(function (r) {
        if (r.error) throw new Error(_msg(r.error));
        _session = r.data.session;
        return true;
      });
    },

    resendSignupEmail: function (email) {
      return client.auth.resend({
        type: 'signup',
        email: email,
      }).then(function (r) {
        if (r.error) throw new Error(_msg(r.error));
        return true;
      });
    },

    /** LGPD / Play Store — apaga dados na nuvem e encerra sessão Supabase. */
    deleteAccount: function () {
      return client.rpc('fp_delete_own_account').then(function (r) {
        if (r.error) throw new Error(_msg(r.error));
        _session = null;
        return client.auth.signOut().catch(function () {});
      });
    }
  };
  window.SUPA_AUTH = SUPA_AUTH;

  // Roteia SÓ a autenticação do DADOS para o Supabase. Nada de dados/sync aqui.
  if (typeof DADOS !== 'undefined') {
    DADOS.loginApi = function (email, password) { return SUPA_AUTH.login(email, password); };
    DADOS.registrarApi = function (nome, email, password) { return SUPA_AUTH.register(nome, email, password); };
    DADOS.verifyTotpLoginApi = function (pendingToken, code) {
      return SUPA_AUTH.verifyMfa(pendingToken, code);
    };
    DADOS.totpStatusApi = function () {
      return SUPA_AUTH.mfaStatus();
    };
    var _origEncerrar = (typeof DADOS.encerrarSessao === 'function')
      ? DADOS.encerrarSessao.bind(DADOS) : function () {};
    DADOS.encerrarSessao = function () {
      try { SUPA_AUTH.logout(); } catch (e) { /* ignore */ }
      return _origEncerrar();
    };
  }

  if (typeof window !== 'undefined') {
    _consumeAuthHashFromLocation(window.location).catch(function () { /* noop */ });
    var appPlugin = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (appPlugin && appPlugin.addListener) {
      appPlugin.addListener('appUrlOpen', function (ev) {
        if (!ev || !ev.url) return;
        try {
          _consumeAuthHashFromLocation(new URL(ev.url)).catch(function () { /* noop */ });
        } catch (e) { /* noop */ }
      });
    }
  }
})();
