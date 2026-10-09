/**
 * supabase-sync.js — sincronização de dados via supabase-js (RLS).
 *
 * O DADOS chama pontos de encaixe de transporte (sincronizarComApi,
 * _pushTransacaoApi, _pushContasApi…, js/core/dados-nuvem.js) que no modo
 * local não fazem nada. Com o Supabase ativo, este arquivo os sobrescreve para
 * gravar direto nas tabelas (protegidas por RLS: userId = auth.uid()),
 * reaproveitando o mapeamento PT↔EN (FINANCE_CONTRACT) e o merge local
 * (_mergeSnapshotLocal).
 *
 * Carrega depois de js/core/supabase.js (SB, SUPA_AUTH) e js/core/dados.js.
 */
(function () {
  'use strict';

  if (!window.SUPA_AUTH || !window.SUPA_AUTH.isActive || !window.SUPA_AUTH.isActive() || !window.SB) {
    return; // Supabase inativo → modo local, nada a sincronizar.
  }
  var SB = window.SB;

  function uid() {
    var s = window.SUPA_AUTH.getSessionSync();
    return s && s.user ? s.user.id : null;
  }
  function nowIso() { return new Date().toISOString(); }
  function clean(row) {
    Object.keys(row).forEach(function (k) { if (row[k] === undefined) delete row[k]; });
    // Nunca reenviar deletedAt:null num upsert. Um push de reconciliação (linha
    // ~203: registro que sumiu da nuvem por ter sido APAGADO em outro aparelho,
    // mas ainda existe localmente) traria deletedAt:null de txPtToEn e, como o
    // upsert onConflict faz UPDATE das colunas enviadas, ZERARIA o tombstone da
    // nuvem — ressuscitando a transação em todos os aparelhos. A exclusão de
    // verdade vai pelo caminho dedicado (.update({deletedAt: ...})), que não
    // passa por aqui, então remover o null aqui é seguro.
    if (row.deletedAt === null) delete row.deletedAt;
    return row;
  }

  /**
   * PostgREST devolve QUOTA_EXCEEDED:* via RAISE EXCEPTION (P0001).
   * O lançamento local já foi salvo em DADOS.salvarTransacao antes do push;
   * aqui só avisamos e não propagamos o erro (nuvem fica pendente).
   *
   * A lista de tipos precisa acompanhar o SQL. Quando a v3 passou a recusar
   * metas, contas a pagar, assinaturas e categorias, a cópia daqui continuou
   * com três tipos e o usuário lia "Limite de uso no plano gratuito" — frase
   * que não diz o que ele atingiu nem o que fazer a respeito.
   */
  var QUOTA_KINDS = 'transaction|account|budget|goal|recurring|bill|subscription|category';

  function _avisarCota(texto) {
    if (typeof BILLING !== 'undefined' && BILLING.onPaymentRequired) {
      BILLING.onPaymentRequired({ message: texto });
    } else if (typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
      UTILS.mostrarToast(texto, 'warning');
    }
    return true;
  }

  function isQuotaExceededError(err) {
    if (!err) return false;
    // P0001 é o SQLSTATE genérico de RAISE EXCEPTION — QUALQUER trigger/RPC de
    // validação usa o mesmo código. Identificar cota só pelo código engolia
    // erros legítimos e mostrava "assine o Pro" no lugar. O sinal confiável é o
    // marcador QUOTA_EXCEEDED:<tipo> na mensagem, que o SQL de cota emite.
    var msg = String(err.message || err.details || err.hint || '');
    return new RegExp('QUOTA_EXCEEDED:(' + QUOTA_KINDS + ')').test(msg);
  }

  function handleQuotaExceeded(err) {
    if (!isQuotaExceededError(err)) return false;
    var msg = String(err.message || '');
    var kind = (msg.match(/QUOTA_EXCEEDED:(\w+)/) || [])[1] || 'transaction';

    /* Mensagem do BILLING quando existe: ela nomeia o que o Pro FAZ, que é o
       que a pessoa lê no momento de decidir. O texto abaixo é só o plano B
       para quando o billing não carregou. */
    var doBilling = (typeof BILLING !== 'undefined' && BILLING._QUOTAS && BILLING._QUOTAS[kind])
      ? BILLING._QUOTAS[kind]
      : null;
    if (doBilling && BILLING.getLimits) {
      var teto = BILLING.getLimits()[doBilling.limite];
      if (isFinite(teto)) {
        return _avisarCota(doBilling.msg.replace('%L', String(teto)));
      }
    }

    var labels = {
      transaction: 'lançamentos este mês',
      account: 'contas/cartões',
      budget: 'orçamentos',
      goal: 'metas',
      recurring: 'lançamentos recorrentes',
      bill: 'contas a pagar',
      subscription: 'gastos fixos',
      category: 'categorias personalizadas',
    };
    return _avisarCota(
      'Limite de ' + (labels[kind] || 'uso')
      + ' no plano gratuito. Assine o Pro para continuar.',
    );
  }

  // Falha de sync que não é falta de rede (RLS, coluna, dado recusado) é dado
  // do cliente que não chega à nuvem: entra no relatório de erros.
  function relatarSync(contexto, err) {
    var msg = String((err && err.message) || err || '');
    if (/fetch|network|load failed|timeout|abort/i.test(msg)) return;
    if (typeof OBS !== 'undefined' && OBS.captureError) OBS.captureError(err, { contexto: contexto });
  }

  function afterPushError(err, fallback) {
    if (handleQuotaExceeded(err)) return fallback;
    console.warn('Supabase push falhou:', err && err.message);
    relatarSync('sync.push', err);
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

  /**
   * PostgREST limita ~1000 linhas por página — paginar pull de contas grandes.
   * Toda consulta paginada precisa de .order(): sem ordem, o Postgres não
   * garante que a página 2 continue de onde a 1 parou (linha repetida ou
   * pulada). A ordem é pela chave primária (id), que a RLS indexável de
   * 20261009120000_rls_initplan_desempenho.sql resolve em ~1 ms por página.
   */
  var PULL_PAGE_SIZE = 1000;

  function fetchAllRows(buildQuery) {
    var acc = [];
    function next(offset) {
      return buildQuery().range(offset, offset + PULL_PAGE_SIZE - 1).then(function (res) {
        if (res.error) throw res.error;
        var batch = res.data || [];
        acc = acc.concat(batch);
        if (batch.length < PULL_PAGE_SIZE) return acc;
        return next(offset + PULL_PAGE_SIZE);
      });
    }
    return next(0);
  }

  var _pulling = false;

  var SUPA_SYNC = {
    /** Puxa os dados do usuário e mescla no local (reusa _mergeSnapshotLocal). */
    pull: function () {
      var u = uid();
      if (!u || _pulling) return Promise.resolve(false);
      // Conta diferente da dona do aparelho: quem resolve é trocouDeConta(),
      // que apaga os dados daqui antes. Sincronizar antes disso misturaria as
      // duas contas (o DADOS.init do boot também chama o pull).
      var dono = window.SUPA_AUTH.donoDoAparelho ? window.SUPA_AUTH.donoDoAparelho() : null;
      if (dono && dono !== u) return Promise.resolve(false);
      _pulling = true;
      if (typeof APP_STORE !== 'undefined' && typeof ACTIONS !== 'undefined') {
        APP_STORE.dispatch(ACTIONS.SYNC_INICIAR);
      }
      return Promise.all([
        fetchAllRows(function () {
          // Inclui as excluídas: é assim que a exclusão feita em outro aparelho
          // chega aqui (SYNC_MERGE remove o que vem com deletedAt).
          return SB.from('Transaction').select('*').order('id');
        }),
        fetchAllRows(function () { return SB.from('Account').select('*').order('id'); }),
        fetchAllRows(function () { return SB.from('Budget').select('*').order('id'); }),
        fetchAllRows(function () { return SB.from('RecurringTransaction').select('*').order('id'); }),
        SB.from('UserConfig').select('data').eq('userId', u).maybeSingle()
      ]).then(function (res) {
        // maybeSingle() resolve {data:null, error} em vez de rejeitar; sem este
        // aviso, uma falha ao ler o UserConfig virava config {} em silêncio e o
        // usuário achava que sincronizou. As outras 4 queries já lançam via
        // fetchAllRows, então caem no catch.
        if (res[4] && res[4].error && typeof console !== 'undefined' && console.warn) {
          console.warn('Sync: falha ao ler UserConfig da nuvem —', res[4].error.message || res[4].error);
        }
        var snapshot = {
          transactions: res[0] || [],
          accounts: res[1] || [],
          budgets: res[2] || [],
          recurringTransactions: res[3] || [],
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
        relatarSync('sync.pull', err);
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
      // Ids de conta válidos (na nuvem + locais que vão subir) para checagem de
      // FK. Índice O(1): antes era localAcc.some() por transação → O(contas ×
      // transações) em todo pull/login.
      var localAccIds = {};
      localAcc.forEach(function (a) { if (a && a.id) localAccIds[a.id] = 1; });
      var validAccIds = { has: function (id) { return !!cloudAccIds[id] || !!localAccIds[id]; } };

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
          /* Diagnóstico de sincronização: único log fora de warn/error, e a
             única linha que reprovava `npm run lint:strict`. */
          // eslint-disable-next-line no-console
          console.info(
            'Reconciliação: subiu', accToPush.length, 'contas e',
            txToPush.length, 'transações locais.',
          );
        }
        return { contas: accToPush.length, transacoes: txToPush.length };
      }).catch(function (e) {
        if (handleQuotaExceeded(e)) return;
        console.warn('Reconciliação (subida) falhou:', e && e.message);
        relatarSync('sync.reconciliar', e);
      });
    },

    pushTx: function (tx) {
      var u = uid();
      if (!u || !tx) return Promise.resolve(tx);
      var en = (typeof FINANCE_CONTRACT !== 'undefined') ? FINANCE_CONTRACT.txPtToEn(tx) : {};
      var row = clean(Object.assign({}, en, { id: tx.id, userId: u, updatedAt: nowIso() }));
      // Salvar é ação explícita sobre um lançamento vivo (inclusive o que
      // voltou de um backup depois de excluído): a nuvem precisa limpar a
      // marca de exclusão, senão o próximo pull o apagaria de novo. O clean()
      // tira o null de propósito para a reconciliação; aqui ele volta.
      if (!tx.deletedAt) row.deletedAt = null;
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
      // active:true reativa o orçamento que foi excluído e depois recriado.
      var patch = { limit: Number(limite), active: true, updatedAt: nowIso() };
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

    /** Desativa o orçamento da categoria (o pull ignora os inativos). */
    deleteBudget: function (categoria) {
      var u = uid();
      if (!u || !categoria) return Promise.resolve(true);
      return SB.from('Budget').update({ active: false, updatedAt: nowIso() })
        .eq('userId', u).eq('category', categoria)
        .then(function (r) { if (r && r.error) throw r.error; return true; })
        .catch(function (e) { return afterPushError(e, false); });
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
    DADOS.sincronizarComApi = function () { return SUPA_SYNC.pull(); };
    DADOS._pushTransacaoApi = function (tx) { return SUPA_SYNC.pushTx(tx); };
    DADOS._deleteTransacaoApi = function (id) { return SUPA_SYNC.deleteTx(id); };
    DADOS._pushContasApi = function (conta) { return SUPA_SYNC.pushConta(conta); };
    DADOS._pushOrcamentoApi = function (cat, lim) { return SUPA_SYNC.pushBudget(cat, lim); };
    DADOS._pushConfigApi = function (cfg) { return SUPA_SYNC.pushConfig(cfg); };
  }

  /**
   * Outra conta entrou neste aparelho?
   *
   * O pull mescla a nuvem no que está no aparelho e a reconciliação sobe para
   * a nuvem o que só existe aqui. Com a conta de outra pessoa, isso mostrava
   * os lançamentos de quem usou o aparelho antes e os enviava, junto com o
   * perfil (nome, telefone, endereço), para a conta nova: "Sair" deixa os
   * dados no aparelho de propósito, para a mesma pessoa voltar.
   *
   * Regra: a primeira conta a entrar vira a dona (assim quem já usa o app
   * não perde nada ao atualizar, e quem começou sem conta leva os dados para
   * ela). Se entrar uma conta diferente da dona, os dados do aparelho são
   * apagados antes de qualquer sincronização e o app recarrega já com a conta
   * nova como dona. O que a conta anterior já tinha sincronizado continua na
   * nuvem dela.
   *
   * @returns {boolean} true quando a troca foi tratada (não sincronizar agora)
   */
  function trocouDeConta(session) {
    var novo = session && session.user && session.user.id;
    var auth = window.SUPA_AUTH;
    if (!novo || !auth.donoDoAparelho || !auth.definirDono) return false;
    var dono = auth.donoDoAparelho();
    if (!dono) { auth.definirDono(novo); return false; }
    if (dono === novo) return false;
    if (typeof DADOS !== 'undefined' && DADOS.limparTodos) {
      try { DADOS.limparTodos(); } catch (e) { console.warn('Troca de conta: limpeza falhou', e && e.message); }
    }
    auth.definirDono(novo);
    // Dá tempo de o IndexedDB terminar de apagar antes de recarregar.
    setTimeout(function () {
      if (window.location && typeof window.location.reload === 'function') window.location.reload();
    }, 500);
    return true;
  }

  // Puxa os dados ao entrar (login) e no boot com sessão existente.
  SB.auth.onAuthStateChange(function (evt, session) {
    if (session && (evt === 'SIGNED_IN' || evt === 'INITIAL_SESSION')) {
      if (trocouDeConta(session)) return;
      SUPA_SYNC.pull();
      if (typeof BILLING !== 'undefined' && BILLING.sync) {
        BILLING.sync().catch(function () {});
      }
      // Convite ?invite= gravado antes do login (fp-pending-invite).
      if (typeof INIT_BILLING !== 'undefined' && INIT_BILLING._consumePendingInvite) {
        INIT_BILLING._consumePendingInvite();
      }
      // Pro de boas-vindas: entrar na conta passa a DAR algo, em vez de
      // apenas mover o usuario para um plano com mais limites.
      if (typeof BILLING !== 'undefined' && BILLING.claimWelcomeTrial) {
        BILLING.claimWelcomeTrial().then(function(out) {
          if (out && typeof INIT_BILLING !== 'undefined' && INIT_BILLING.mostrarBoasVindasPro) {
            INIT_BILLING.mostrarBoasVindasPro(out);
          }
        }).catch(function() { /* nunca atrapalha o login */ });
      }
      if (typeof INIT_CONFIG !== 'undefined' && INIT_CONFIG.aplicarVisibilidadeNuvem) {
        INIT_CONFIG.aplicarVisibilidadeNuvem();
      }
    }
  });
})();
