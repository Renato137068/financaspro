/**
 * supabase-sync.js — sincronização de dados via supabase-js (RLS).
 *
 * Substitui o pull/push da API Express quando o Supabase está ativo. Reaproveita
 * o mapeamento PT↔EN (FINANCE_CONTRACT) e o merge local (_mergeSnapshotLocal),
 * então só troca o "transporte": em vez de /api/v1/*, fala direto com o Supabase.
 *
 * Como em modo Supabase o _syncV2Ativo() é falso, as mutações do DADOS caem no
 * branch legado que chama _pushTransacaoApi/_pushContasApi/etc — que aqui são
 * sobrescritos para gravar no Supabase (protegido por RLS: userId = auth.uid()).
 *
 * Carrega depois de js/core/supabase.js (SB, SUPA_AUTH) e js/core/dados.js.
 */
(function () {
  'use strict';

  if (!window.SUPA_AUTH || !window.SUPA_AUTH.isActive || !window.SUPA_AUTH.isActive() || !window.SB) {
    return; // Supabase inativo → mantém o comportamento local/Express.
  }
  var SB = window.SB;

  function uid() {
    var s = window.SUPA_AUTH.getSessionSync();
    return s && s.user ? s.user.id : null;
  }
  function nowIso() { return new Date().toISOString(); }
  function clean(row) {
    Object.keys(row).forEach(function (k) { if (row[k] === undefined) delete row[k]; });
    return row;
  }

  var _pulling = false;

  var SUPA_SYNC = {
    /** Puxa os dados do usuário e mescla no local (reusa _mergeSnapshotLocal). */
    pull: function () {
      var u = uid();
      if (!u || _pulling) return Promise.resolve(false);
      _pulling = true;
      if (typeof APP_STORE !== 'undefined' && typeof ACTIONS !== 'undefined') {
        APP_STORE.dispatch(ACTIONS.SYNC_INICIAR);
      }
      return Promise.all([
        SB.from('Transaction').select('*').is('deletedAt', null),
        SB.from('Account').select('*'),
        SB.from('Budget').select('*'),
        SB.from('RecurringTransaction').select('*'),
        SB.from('UserConfig').select('data').eq('userId', u).maybeSingle()
      ]).then(function (res) {
        var snapshot = {
          transactions: res[0].data || [],
          accounts: res[1].data || [],
          budgets: res[2].data || [],
          recurringTransactions: res[3].data || [],
          config: (res[4].data && res[4].data.data) || {}
        };
        if (typeof DADOS !== 'undefined' && DADOS._mergeSnapshotLocal) {
          DADOS._mergeSnapshotLocal(snapshot);
        }
        if (typeof APP_STORE !== 'undefined' && typeof ACTIONS !== 'undefined') {
          APP_STORE.dispatch(ACTIONS.SYNC_CONCLUIR);
        } else {
          if (typeof TRANSACOES !== 'undefined') TRANSACOES.init();
          if (typeof ORCAMENTO !== 'undefined') ORCAMENTO.init();
          if (typeof CONTAS !== 'undefined') CONTAS.init();
          if (typeof RENDER !== 'undefined') RENDER.init();
        }
        return true;
      }).catch(function (err) {
        console.warn('Supabase pull falhou, dados locais preservados:', err && err.message);
        if (typeof APP_STORE !== 'undefined' && typeof ACTIONS !== 'undefined') {
          APP_STORE.dispatch(ACTIONS.SYNC_FALHAR, { erro: err && err.message });
        }
        return false;
      }).finally(function () { _pulling = false; });
    },

    pushTx: function (tx) {
      var u = uid();
      if (!u || !tx) return Promise.resolve(tx);
      var en = (typeof FINANCE_CONTRACT !== 'undefined') ? FINANCE_CONTRACT.txPtToEn(tx) : {};
      var row = clean(Object.assign({}, en, { id: tx.id, userId: u, updatedAt: nowIso() }));
      return SB.from('Transaction').upsert(row, { onConflict: 'id' }).then(function (r) {
        if (r.error) throw r.error; return tx;
      }).catch(function (e) { console.warn('push tx falhou:', e && e.message); return tx; });
    },

    deleteTx: function (id) {
      if (!id) return Promise.resolve(true);
      return SB.from('Transaction').update({ deletedAt: nowIso(), updatedAt: nowIso() }).eq('id', id)
        .then(function () { return true; })
        .catch(function (e) { console.warn('delete tx falhou:', e && e.message); return true; });
    },

    pushConta: function (conta) {
      var u = uid();
      if (!u || !conta) return Promise.resolve(conta);
      var en = (typeof FINANCE_CONTRACT !== 'undefined') ? FINANCE_CONTRACT.contaPtToEn(conta) : {};
      var row = clean(Object.assign({}, en, { id: conta.id, userId: u, updatedAt: nowIso() }));
      return SB.from('Account').upsert(row, { onConflict: 'id' }).then(function (r) {
        if (r.error) throw r.error; return conta;
      }).catch(function (e) { console.warn('push conta falhou:', e && e.message); return conta; });
    },

    pushBudget: function (categoria, limite) {
      var u = uid();
      if (!u) return Promise.resolve();
      var patch = { limit: Number(limite), updatedAt: nowIso() };
      return SB.from('Budget').select('id')
        .eq('userId', u).eq('category', categoria).eq('period', 'monthly').maybeSingle()
        .then(function (r) {
          if (r.data) return SB.from('Budget').update(patch).eq('id', r.data.id);
          var id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now());
          return SB.from('Budget').insert({
            id: id, userId: u, category: categoria, limit: Number(limite),
            period: 'monthly', updatedAt: nowIso()
          });
        }).catch(function (e) { console.warn('push budget falhou:', e && e.message); });
    },

    pushConfig: function (config) {
      var u = uid();
      if (!u) return Promise.resolve(config);
      var payload = Object.assign({}, config);
      delete payload.pinHash; delete payload.pinSalt; delete payload.pinAlgoritmo;
      return SB.from('UserConfig').select('userId').eq('userId', u).maybeSingle().then(function (r) {
        if (r.data) return SB.from('UserConfig').update({ data: payload, updatedAt: nowIso() }).eq('userId', u);
        return SB.from('UserConfig').insert({ userId: u, data: payload, updatedAt: nowIso() });
      }).then(function () { return config; })
        .catch(function (e) { console.warn('push config falhou:', e && e.message); return config; });
    }
  };
  window.SUPA_SYNC = SUPA_SYNC;

  // Sobrescreve o transporte do DADOS (só quando Supabase ativo).
  if (typeof DADOS !== 'undefined') {
    // Em modo Supabase NÃO usamos a API Express. Forçar _apiAtiva()=false manda
    // as mutações para o branch legado (que chama os _push*Api abaixo), usa o
    // merge simples no _mergeSnapshotLocal e evita tentativas de sync à API
    // morta (que geravam o toast "Falha ao sincronizar"). No dev, sem isso, o
    // _apiBaseUrl() cai no fallback localhost:4000 e liga o sync v2 por engano.
    DADOS._apiAtiva = function () { return false; };
    DADOS.sincronizarComApi = function () { return SUPA_SYNC.pull(); };
    DADOS._pushTransacaoApi = function (tx) { return SUPA_SYNC.pushTx(tx); };
    DADOS._deleteTransacaoApi = function (id) { return SUPA_SYNC.deleteTx(id); };
    DADOS._pushContasApi = function (conta) { return SUPA_SYNC.pushConta(conta); };
    DADOS._pushOrcamentoApi = function (cat, lim) { return SUPA_SYNC.pushBudget(cat, lim); };
    DADOS._pushConfigApi = function (cfg) { return SUPA_SYNC.pushConfig(cfg); };
  }

  // Puxa os dados ao entrar (login) e no boot com sessão existente.
  SB.auth.onAuthStateChange(function (evt, session) {
    if (session && (evt === 'SIGNED_IN' || evt === 'INITIAL_SESSION')) {
      SUPA_SYNC.pull();
    }
  });
})();
