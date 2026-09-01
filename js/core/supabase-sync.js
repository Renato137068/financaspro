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

  /**
   * PostgREST devolve QUOTA_EXCEEDED:* via RAISE EXCEPTION (P0001).
   * O lançamento local já foi salvo em DADOS.salvarTransacao antes do push;
   * aqui só avisamos e não propagamos o erro (nuvem fica pendente).
   */
  function isQuotaExceededError(err) {
    if (!err) return false;
    var msg = String(err.message || err.details || err.hint || '');
    return err.code === 'P0001' || /QUOTA_EXCEEDED:(transaction|account|budget)/.test(msg);
  }

  function handleQuotaExceeded(err) {
    if (!isQuotaExceededError(err)) return false;
    var msg = String(err.message || '');
    var kind = (msg.match(/QUOTA_EXCEEDED:(\w+)/) || [])[1] || 'transaction';
    var labels = {
      transaction: 'lançamentos este mês',
      account: 'contas/cartões',
      budget: 'orçamentos',
    };
    var texto = 'Limite de ' + (labels[kind] || 'uso')
      + ' no plano gratuito. Assine o Pro para continuar.';
    if (typeof BILLING !== 'undefined' && BILLING.onPaymentRequired) {
      BILLING.onPaymentRequired({ message: texto });
    } else if (typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
      UTILS.mostrarToast(texto, 'warning');
    }
    return true;
  }

  function afterPushError(err, fallback) {
    if (handleQuotaExceeded(err)) return fallback;
    console.warn('Supabase push falhou:', err && err.message);
    return fallback;
  }

  // Constrói a linha EN preservando o updatedAt local (para reconciliação sem clobber).
  function txRow(tx, u, validAccIds) {
    var en = (typeof FINANCE_CONTRACT !== 'undefined') ? FINANCE_CONTRACT.txPtToEn(tx) : {};
    var row = clean(Object.assign({}, en, { id: tx.id, userId: u, updatedAt: tx.updatedAt || nowIso() }));
    // Evita falha de FK: zera contas que não existem (nem na nuvem nem locais a subir).
    if (validAccIds) {
      if (row.accountId && !validAccIds.has(row.accountId)) delete row.accountId;
      if (row.targetAccountId && !validAccIds.has(row.targetAccountId)) delete row.targetAccountId;
    }
    return row;
  }
  function contaRow(c, u) {
    var en = (typeof FINANCE_CONTRACT !== 'undefined') ? FINANCE_CONTRACT.contaPtToEn(c) : {};
    return clean(Object.assign({}, en, { id: c.id, userId: u, updatedAt: c.updatedAt || nowIso() }));
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
        // Reconciliação: sobe pra nuvem o que é só-local (antes de sinalizar pronto).
        return SUPA_SYNC._reconcileUp(snapshot).then(function () {
          if (typeof APP_STORE !== 'undefined' && typeof ACTIONS !== 'undefined') {
            APP_STORE.dispatch(ACTIONS.SYNC_CONCLUIR);
          } else {
            if (typeof TRANSACOES !== 'undefined') TRANSACOES.init();
            if (typeof ORCAMENTO !== 'undefined') ORCAMENTO.init();
            if (typeof CONTAS !== 'undefined') CONTAS.init();
            if (typeof RENDER !== 'undefined') RENDER.init();
          }
          return true;
        });
      }).catch(function (err) {
        console.warn('Supabase pull falhou, dados locais preservados:', err && err.message);
        if (typeof APP_STORE !== 'undefined' && typeof ACTIONS !== 'undefined') {
          APP_STORE.dispatch(ACTIONS.SYNC_FALHAR, { erro: err && err.message });
        }
        return false;
      }).finally(function () { _pulling = false; });
    },

    /** Sobe para a nuvem os itens locais ausentes lá (contas → transações → config). */
    _reconcileUp: function (cloud) {
      var u = uid();
      if (!u) return Promise.resolve();

      var cloudAccIds = {};
      (cloud.accounts || []).forEach(function (a) { if (a && a.id) cloudAccIds[a.id] = 1; });
      var localAcc = (DADOS.getContas && DADOS.getContas()) || [];
      // Ids de conta válidos (na nuvem + locais que vão subir) para checagem de FK.
      var validAccIds = { has: function (id) { return !!cloudAccIds[id] || localAcc.some(function (a) { return a && a.id === id; }); } };

      var accToPush = localAcc
        .filter(function (a) { return a && a.id && !cloudAccIds[a.id]; })
        .map(function (a) { return contaRow(a, u); });

      var cloudTxIds = {};
      (cloud.transactions || []).forEach(function (t) { if (t && t.id) cloudTxIds[t.id] = 1; });
      var localTx = (DADOS.getTransacoesRaw && DADOS.getTransacoesRaw()) || [];
      var txToPush = localTx
        .filter(function (t) { return t && t.id && !t.deletedAt && !cloudTxIds[t.id]; })
        .map(function (t) { return txRow(t, u, validAccIds); });

      // Contas primeiro (FK das transações), depois transações, depois config.
      var chain = accToPush.length
        ? SB.from('Account').upsert(accToPush, { onConflict: 'id' })
        : Promise.resolve({});
      return chain.then(function () {
        if (txToPush.length) return SB.from('Transaction').upsert(txToPush, { onConflict: 'id' });
      }).then(function () {
        var cfg = (DADOS.getConfig && DADOS.getConfig()) || {};
        return SUPA_SYNC.pushConfig(cfg);
      }).then(function () {
        if (accToPush.length || txToPush.length) {
          console.log('Reconciliação: subiu', accToPush.length, 'contas e', txToPush.length, 'transações locais.');
        }
        return { contas: accToPush.length, transacoes: txToPush.length };
      }).catch(function (e) {
        if (handleQuotaExceeded(e)) return;
        console.warn('Reconciliação (subida) falhou:', e && e.message);
      });
    },

    pushTx: function (tx) {
      var u = uid();
      if (!u || !tx) return Promise.resolve(tx);
      var en = (typeof FINANCE_CONTRACT !== 'undefined') ? FINANCE_CONTRACT.txPtToEn(tx) : {};
      var row = clean(Object.assign({}, en, { id: tx.id, userId: u, updatedAt: nowIso() }));
      return SB.from('Transaction').upsert(row, { onConflict: 'id' }).then(function (r) {
        if (r.error) throw r.error; return tx;
      }).catch(function (e) { return afterPushError(e, tx); });
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
      }).catch(function (e) { return afterPushError(e, conta); });
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
        }).catch(function (e) { return afterPushError(e, undefined); });
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
      if (typeof BILLING !== 'undefined' && BILLING.sync) {
        BILLING.sync().catch(function () {});
      }
      if (typeof INIT_CONFIG !== 'undefined' && INIT_CONFIG.aplicarVisibilidadeNuvem) {
        INIT_CONFIG.aplicarVisibilidadeNuvem();
      }
    }
  });
})();
