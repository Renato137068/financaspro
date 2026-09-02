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

  var client = lib.createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'fp-supabase-auth'
    }
  });
  window.SB = client;

  // Cache SÍNCRONO da sessão — o authController lê getSessao() de forma síncrona.
  var _session = null;

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
    if (typeof atualizarBarraSessao === 'function') atualizarBarraSessao();
  });

  function _msg(e) {
    var m = (e && e.message) || 'Falha na autenticação';
    if (/failed to fetch|networkerror|network error|load failed/i.test(m)) {
      return 'Sem conexão com o servidor. Verifique sua internet e tente de novo.';
    }
    if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha inválidos.';
    if (/Email not confirmed/i.test(m)) return 'Confirme seu e-mail antes de entrar.';
    if (/User already registered|already registered/i.test(m)) return 'Este e-mail já está cadastrado.';
    if (/Password should be|at least/i.test(m)) return 'Senha muito curta (mínimo 6 caracteres).';
    if (/rate limit|too many/i.test(m)) return 'Muitas tentativas. Aguarde um instante.';
    return m;
  }

  var SUPA_AUTH = {
    isActive: function () { return true; },

    ping: function () {
      return fetch(url.replace(/\/$/, '') + '/auth/v1/health', {
        method: 'GET',
        headers: { apikey: key, Authorization: 'Bearer ' + key },
      }).then(function (res) {
        if (!res.ok) throw new Error('servidor-indisponivel');
        return true;
      }).catch(function (err) {
        var e = new Error(_msg(err));
        e.cause = err;
        throw e;
      });
    },

    login: function (email, password) {
      return client.auth.signInWithPassword({ email: email, password: password })
        .then(function (r) {
          if (r.error) throw new Error(_msg(r.error));
          _session = r.data.session;
          return {}; // sem etapa TOTP no fluxo Supabase
        });
    },

    register: function (nome, email, password) {
      return client.auth.signUp({
        email: email,
        password: password,
        options: { data: { name: nome } }
      }).then(function (r) {
        if (r.error) throw new Error(_msg(r.error));
        var user = r.data && r.data.user;
        if (user && user.identities && user.identities.length === 0) {
          throw new Error('Este e-mail já está cadastrado. Tente Entrar ou use outro e-mail.');
        }
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
      var redirect = (typeof window !== 'undefined' && window.location)
        ? (window.location.origin + '/')
        : undefined;
      return client.auth.resetPasswordForEmail(email, { redirectTo: redirect }).then(function (r) {
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
    DADOS.verifyTotpLoginApi = function () { return Promise.resolve(); };
    var _origEncerrar = (typeof DADOS.encerrarSessao === 'function')
      ? DADOS.encerrarSessao.bind(DADOS) : function () {};
    DADOS.encerrarSessao = function () {
      try { SUPA_AUTH.logout(); } catch (e) { /* ignore */ }
      return _origEncerrar();
    };
  }
})();
