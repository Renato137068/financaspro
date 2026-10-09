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
  /**
   * Desativa o orçamento da categoria na tabela da nuvem. Não é sobrescrito
   * pelo supabase-sync: delega ao SUPA_SYNC quando ele existe (Supabase ativo).
   */
  _deleteOrcamentoApi: function(categoria) {
    var sync = (typeof window !== 'undefined') ? window.SUPA_SYNC : undefined;
    if (sync && typeof sync.deleteBudget === 'function') return sync.deleteBudget(categoria);
    return Promise.resolve(true);
  },

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
      var mergedTx = SYNC_MERGE.mergeDelta(this.getTransacoesRaw(), [], txsPt);
      var pendTx = this._pendentesParaNuvem(mergedTx, txsPt);
      this._storageSetTransacoes(pendTx.lista);
      pendTx.excluir.forEach(function(id) { this._deleteTransacaoApi(id); }, this);
      pendTx.enviar.forEach(function(tx) { this._pushTransacaoApi(tx); }, this);
    }

    if (Array.isArray(snapshot.accounts)) {
      var contasPt = snapshot.accounts.map(function(ac) { return FINANCE_CONTRACT.contaEnToPt(ac); });
      // Raw (com as desativadas): com getContas() a conta desativada aqui não
      // entrava no merge e a cópia ativa da nuvem voltava como "nova".
      var mergedContas = SYNC_MERGE.mergeDelta(this.getContasRaw(), [], contasPt);
      this._storageSetRaw(CONFIG.STORAGE_CONTAS, JSON.stringify(mergedContas));
      this._pendentesParaNuvem(mergedContas, contasPt).enviar
        .forEach(function(c) { this._pushContasApi(c); }, this);
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

  /**
   * O que mudou neste aparelho e a nuvem ainda não tem.
   *
   * Os envios (push, exclusão) engolem a falha de rede de propósito, para não
   * travar quem está sem sinal; mas nada os repetia. A reconciliação do pull
   * só sobe registro que NÃO existe na nuvem, então editar ou excluir sem
   * rede ficava só neste aparelho para sempre (e a exclusão voltava). Depois
   * do merge, compara cada registro local com a cópia da nuvem:
   *   - local mais novo que a nuvem → reenviar;
   *   - marcado como excluído aqui e vivo na nuvem → reenviar a exclusão;
   *   - marcado como excluído e já fora da nuvem → a marca pode sair.
   * Um envio bem-sucedido grava na nuvem um updatedAt >= o local, então o
   * registro deixa de aparecer aqui no pull seguinte.
   *
   * @param {Array} lista  resultado do merge (formato do aparelho)
   * @param {Array} nuvem  o que veio da nuvem (formato do aparelho)
   * @returns {{lista: Array, enviar: Array, excluir: Array}}
   */
  _pendentesParaNuvem: function(lista, nuvem) {
    var naNuvem = {};
    (nuvem || []).forEach(function(r) { if (r && r.id != null) naNuvem[r.id] = r; });
    var ms = function(v) { var t = Date.parse(v); return isNaN(t) ? NaN : t; };
    var out = { lista: [], enviar: [], excluir: [] };
    (lista || []).forEach(function(r) {
      if (!r || r.id == null) return;
      var remoto = naNuvem[r.id];
      if (r.deletedAt) {
        if (remoto && !remoto.deletedAt) {
          out.excluir.push(r.id);
          out.lista.push(r);
        }
        return; // fora da nuvem (ou já excluído lá): a marca cumpriu o papel
      }
      out.lista.push(r);
      if (remoto && !remoto.deletedAt && ms(r.updatedAt) > ms(remoto.updatedAt)) {
        out.enviar.push(r);
      }
    });
    return out;
  },
};

export { DADOS_NUVEM };
export default DADOS_NUVEM;
