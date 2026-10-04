/**
 * dados-nuvem.js — o que o DADOS sabe da nuvem, misturado a ele.
 *
 * A nuvem é o Supabase (ADR 0004 e 0007: a API Express saiu). Aqui ficam só os
 * pontos de encaixe, com o comportamento do modo local (sem nuvem, nada a
 * mandar nem a perguntar), e o que é igual nos dois modos:
 *
 *   - transporte: sincronizarComApi e os _push*Api. js/core/supabase-sync.js
 *     os sobrescreve quando o Supabase está ativo (os nomes ficaram do tempo
 *     da API; mudar quebraria a costura sem ganho);
 *   - autenticação: loginApi, registrarApi, verifyTotpLoginApi e
 *     totpStatusApi. js/core/supabase.js os sobrescreve; sem Supabase não há
 *     conta, e quem chamar recebe um erro claro em vez de um TypeError;
 *   - sessão: getSessao lê a do Supabase, e encerrarSessao limpa o que é do
 *     app (o logout do Supabase entra pela sobrescrita em supabase.js);
 *   - mesclagem do que vem da nuvem com o que está no aparelho
 *     (_mergeSnapshotLocal), que o pull do supabase-sync usa.
 *
 * Os métodos usam `this` como o DADOS: dados.js os copia com
 * `Object.assign(DADOS, DADOS_NUVEM)`. ES Module (ADR 0005).
 */
import { FINANCE_CONTRACT } from './finance-contract.js';
import { SYNC_MERGE } from './sync-merge.js';
import { CONFIG } from './config.js';
import { APP_STORE } from './store.js';
import { BILLING } from '../billing.js';

/** Chaves que o login da API Express gravava no aparelho. */
const CHAVES_SESSAO_EXPRESS = ['fp-api-token', 'fp-refresh-token', 'fp-api-user'];

function semNuvem() {
  var err = new Error('Login na nuvem indisponível neste modo do app.');
  err.code = 'nuvem-indisponivel';
  return Promise.reject(err);
}

const DADOS_NUVEM = {

  // ─── Transporte (sobrescrito por supabase-sync.js) ─────────────────────────

  sincronizarComApi: function() { return Promise.resolve(false); },
  _pushTransacaoApi: function(transacao) { return Promise.resolve(transacao); },
  _deleteTransacaoApi: function() { return Promise.resolve(true); },
  _pushContasApi: function(conta) { return Promise.resolve(conta); },
  _pushOrcamentoApi: function(categoria, limite) {
    return Promise.resolve({ categoria: categoria, limite: limite });
  },
  _pushConfigApi: function(config) { return Promise.resolve(config); },

  // ─── Autenticação (sobrescrita por supabase.js) ────────────────────────────

  loginApi: semNuvem,
  registrarApi: semNuvem,
  verifyTotpLoginApi: semNuvem,
  totpStatusApi: semNuvem,

  // ─── Sessão ────────────────────────────────────────────────────────────────

  /**
   * Sessão na nuvem, no formato { token, user: { id, email, name } }.
   *
   * Antes lia o usuário que o login da API Express gravava no aparelho. O app
   * da loja entra pelo Supabase, que nunca gravou ali: getSessao() voltava
   * sem usuário para todo mundo, e "Excluir conta" respondia "Faça login na
   * nuvem" a quem estava logado.
   */
  getSessao: function() {
    try {
      if (typeof SUPA_AUTH !== 'undefined' && SUPA_AUTH.isActive && SUPA_AUTH.isActive()
          && SUPA_AUTH.getSessionSync) {
        var s = SUPA_AUTH.getSessionSync();
        if (s && s.user) return { token: s.token || null, user: s.user };
      }
    } catch (e) { /* sem sessão */ }
    return { token: null, user: null };
  },

  encerrarSessao: function() {
    this._limparSessaoExpressLegada();
    if (typeof BILLING !== 'undefined' && BILLING.invalidateCache) BILLING.invalidateCache();
    if (typeof APP_STORE !== 'undefined') {
      APP_STORE.set('dados.sessao', { token: null, user: null }, { persist: false });
    }
  },

  /** Restos do login pela API Express, que saiu: não autenticam mais nada. */
  _limparSessaoExpressLegada: function() {
    CHAVES_SESSAO_EXPRESS.forEach(function(k) {
      try { localStorage.removeItem(k); } catch (e) { /* storage indisponível */ }
    });
  },

  // ─── Mesclagem do que vem da nuvem ─────────────────────────────────────────

  /**
   * Mescla um snapshot da nuvem (formato do banco, em inglês) no aparelho.
   * Merge por registro (SYNC_MERGE.mergeDelta, LWW por updatedAt), nunca
   * substituição inteira: o que só existe no aparelho fica.
   */
  _mergeSnapshotLocal: function(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return;

    if (Array.isArray(snapshot.transactions)) {
      var txsPt = snapshot.transactions.map(function(tx) { return FINANCE_CONTRACT.txEnToPt(tx); });
      this._storageSetTransacoes(SYNC_MERGE.mergeDelta(this.getTransacoesRaw(), [], txsPt));
    }

    if (Array.isArray(snapshot.accounts)) {
      var contasPt = snapshot.accounts.map(function(ac) { return FINANCE_CONTRACT.contaEnToPt(ac); });
      var mergedContas = SYNC_MERGE.mergeDelta(this.getContas(), [], contasPt);
      this._storageSetRaw(CONFIG.STORAGE_CONTAS, JSON.stringify(mergedContas));
    }

    var cfg = this.getConfig();
    if (snapshot.config && typeof snapshot.config === 'object') {
      cfg = Object.assign(cfg, snapshot.config);
    }
    if (Array.isArray(snapshot.recurringTransactions)) {
      var recPt = snapshot.recurringTransactions.map(function(r) { return FINANCE_CONTRACT.recorrenteEnToPt(r); });
      var localRec = Array.isArray(cfg.recorrentes) ? cfg.recorrentes : [];
      cfg.recorrentes = SYNC_MERGE.mergeDelta(localRec, [], recPt);
    }
    if (Array.isArray(snapshot.budgets)) {
      var budPt = snapshot.budgets.map(function(b) { return FINANCE_CONTRACT.budgetEnToPt(b); });
      var localOrc = SYNC_MERGE.orcamentosToArray(cfg.orcamentos || {});
      cfg.orcamentos = SYNC_MERGE.arrayToOrcamentos(SYNC_MERGE.mergeDelta(localOrc, [], budPt));
    }
    this._storageSetRaw(CONFIG.STORAGE_CONFIG, JSON.stringify(cfg));

    if (typeof APP_STORE !== 'undefined') APP_STORE.hydrateFromDados();
  },
};

export { DADOS_NUVEM };
export default DADOS_NUVEM;
