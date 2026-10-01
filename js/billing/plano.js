/**
 * billing/plano.js — o plano em vigor: tier, direito persistido, limites e o que cada plano libera.
 *
 * Parte de BILLING (js/billing.js, que importa todas as partes): cada uma
 * acrescenta seus métodos ao mesmo objeto, criado em billing/base.js. Os
 * métodos continuam se chamando por BILLING.x.
 */

import { BILLING } from './base.js';
import { DADOS } from '../core/dados.js';

Object.assign(BILLING, {

  tierFromPlano: function(plano) {
    var raw = String(plano || 'free').toLowerCase().trim();
    if (raw === 'business' || raw === 'enterprise') return 'BUSINESS';
    if (raw === 'premium' || raw === 'pro' || raw === 'paid' || raw === 'plus') return 'PRO';
    return 'FREE';
  },

  planoFromTier: function(tier) {
    var t = String(tier || 'FREE').toUpperCase();
    if (t === 'BUSINESS') return 'business';
    if (t === 'PRO') return 'pro';
    return 'free';
  },

  isCloudUser: function() {
    if (typeof DADOS === 'undefined' || !DADOS._supabaseAtivo || !DADOS._supabaseAtivo()) return false;
    return !!(typeof SUPA_AUTH !== 'undefined' && SUPA_AUTH.getSessionSync
      && SUPA_AUTH.getSessionSync() && SUPA_AUTH.getSessionSync().user);
  },

  /**
   * A cobrança na nuvem é só pelo Supabase (Edge Functions via SUPA_BILLING).
   * O caminho pela API Express saiu com ela (ADR 0007).
   */
  _useSupabaseBilling: function() {
    return typeof DADOS !== 'undefined'
      && DADOS._supabaseAtivo && DADOS._supabaseAtivo()
      && typeof SUPA_BILLING !== 'undefined'
      && SUPA_BILLING.isActive && SUPA_BILLING.isActive();
  },

  /** Erro das operações de nuvem quando o Supabase não está ativo (modo local). */
  _semNuvem: function() {
    var err = new Error('Nuvem indisponível: entre na sua conta para usar a assinatura.');
    err.code = 'nuvem-indisponivel';
    return err;
  },

  _ENTITLEMENT_KEY: 'fp-entitlement-v1',
  /** Snapshot offline só vale por este prazo; depois exige sync (anti-forge casual). */
  _ENTITLEMENT_MAX_AGE_MS: 72 * 60 * 60 * 1000,
  /** Online: se o snap for mais velho que isto, trata como FREE até sync. */
  _ENTITLEMENT_ONLINE_GRACE_MS: 6 * 60 * 60 * 1000,

  /**
   * Snapshot local da assinatura verificada (sync/fetch). Usado offline para
   * não cair no `config.plano` forjável por backup (RISK-02).
   * Não é à prova de atacante local — só reduz spoof casual + TTL.
   */
  _persistEntitlement: function(sub) {
    try {
      if (!sub || !sub.plan || !sub.plan.tier || !BILLING._activeStatus(sub.status, sub)) {
        localStorage.removeItem(BILLING._ENTITLEMENT_KEY);
        return;
      }
      localStorage.setItem(BILLING._ENTITLEMENT_KEY, JSON.stringify({
        tier: sub.plan.tier,
        status: sub.status,
        billingInterval: sub.billingInterval || null,
        currentPeriodEnd: sub.currentPeriodEnd || null,
        trialEndsAt: sub.trialEndsAt || null,
        cancelAtPeriodEnd: !!sub.cancelAtPeriodEnd,
        /* Fingerprint leve: editar só o tier no DevTools sem o sid quebra o snap. */
        sidHint: (typeof sub.stripeSubId === 'string' && sub.stripeSubId)
          ? String(sub.stripeSubId).slice(0, 12)
          : null,
        v: 1,
        savedAt: Date.now(),
      }));
    } catch (e) { /* privado / quota */ }
  },

  _readPersistedEntitlement: function() {
    try {
      var raw = localStorage.getItem(BILLING._ENTITLEMENT_KEY);
      if (!raw) return null;
      var snap = JSON.parse(raw);
      if (!snap || !snap.tier) return null;
      var savedAt = Number(snap.savedAt) || 0;
      if (!savedAt || (Date.now() - savedAt) > BILLING._ENTITLEMENT_MAX_AGE_MS) {
        localStorage.removeItem(BILLING._ENTITLEMENT_KEY);
        return null;
      }
      if (!BILLING._activeStatus(snap.status, snap)) {
        localStorage.removeItem(BILLING._ENTITLEMENT_KEY);
        return null;
      }
      return snap;
    } catch (e) {
      return null;
    }
  },

  /** Intervalo da assinatura ativa: monthly | yearly | null. */
  getBillingInterval: function() {
    var sub = BILLING._cache.subscription;
    if (sub && sub.billingInterval) return sub.billingInterval;
    var snap = BILLING._readPersistedEntitlement();
    return (snap && snap.billingInterval) || null;
  },

  getTier: function() {
    if (BILLING._cache.tier) return BILLING._cache.tier;
    var sub = BILLING._cache.subscription;
    if (sub && sub.plan && sub.plan.tier && BILLING._activeStatus(sub.status, sub)) {
      return sub.plan.tier;
    }
    // Conta nuvem: só confia em entitlement verificado (memória ou snapshot).
    // `config.plano` é espelho de UX e pode ser forjado por backup (RISK-02).
    if (BILLING.isCloudUser()) {
      var snap = BILLING._readPersistedEntitlement();
      if (snap && snap.tier) {
        var online = typeof navigator === 'undefined' || navigator.onLine !== false;
        if (online) {
          var age = Date.now() - (Number(snap.savedAt) || 0);
          if (age > BILLING._ENTITLEMENT_ONLINE_GRACE_MS) return 'FREE';
        }
        return snap.tier;
      }
      return 'FREE';
    }
    if (typeof DADOS !== 'undefined' && DADOS.getConfig) {
      return BILLING.tierFromPlano(DADOS.getConfig().plano);
    }
    return 'FREE';
  },

  /**
   * A assinatura da o tier, ou ja expirou?
   *
   * TRIALING sozinho nao basta. O trial do Stripe e virado pelo webhook, mas o
   * Pro de boas-vindas nao tem assinatura de loja por tras: sem olhar
   * `trialEndsAt`, um trial vencido daria PRO para sempre -- e o mesmo vale se
   * um webhook do Stripe atrasar ou falhar. A data e a fonte da verdade.
   */
  _activeStatus: function(status, sub) {
    // Rede de segurança quando o webhook atrasa: period end no passado
    // não deve manter Pro só porque status ainda diz ACTIVE.
    if (status === 'ACTIVE') {
      var fimAtivo = sub && sub.currentPeriodEnd;
      if (fimAtivo) {
        var tAtivo = new Date(fimAtivo).getTime();
        if (!isNaN(tAtivo) && tAtivo < Date.now()) return false;
      }
      return true;
    }
    // PAST_DUE: Stripe ainda tenta cobrar; mantém Pro só enquanto o período
    // já pago não acabou. Sem currentPeriodEnd, não inventa acesso.
    if (status === 'PAST_DUE') {
      var fimDue = sub && sub.currentPeriodEnd;
      if (!fimDue) return false;
      var tDue = new Date(fimDue).getTime();
      if (isNaN(tDue)) return false;
      return tDue >= Date.now();
    }
    if (status !== 'TRIALING') return false;
    var fim = sub && sub.trialEndsAt;
    if (!fim) return true;
    var t = new Date(fim).getTime();
    if (isNaN(t)) return true;
    return t > Date.now();
  },

  getLimits: function() {
    return BILLING.PLAN_LIMITS[BILLING.getTier()] || BILLING.PLAN_LIMITS.FREE;
  },

  hasTier: function(minTier) {
    var current = BILLING.TIER_ORDER[BILLING.getTier()] || 0;
    var required = BILLING.TIER_ORDER[minTier] || 0;
    return current >= required;
  },

  /**
   * Flags de plano. Vale igual dentro e fora da nuvem.
   *
   * Antes, `if (!isCloudUser()) return true` liberava tudo no modo local. O
   * efeito pratico era um segundo plano gratuito, mais generoso que o da
   * nuvem: criar conta PIORAVA a experiencia, e o funil local -> nuvem -> pago
   * tinha o incentivo economico apontando ao contrario.
   */
  canUse: function(feature) {
    var limits = BILLING.getLimits();
    return !!limits[feature];
  },

  /**
   * Janela de analise disponivel no plano atual.
   *
   * Restringe GRAFICO, RELATORIO e COMPARATIVO -- nunca o extrato, a busca ou a
   * exportacao. O dado que o usuario digitou continua inteiro e exportavel para
   * sempre: limite de analise e limite justo, esconder dado e sequestro.
   *
   * @returns {{ meses: number, desde: Date|null, limitado: boolean }}
   */
  janelaAnalitica: function() {
    var meses = BILLING.getLimits().historyMonths;
    if (meses === Infinity || !isFinite(meses)) {
      return { meses: Infinity, desde: null, limitado: false };
    }
    var d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    d.setMonth(d.getMonth() - (meses - 1));
    return { meses: meses, desde: d, limitado: true };
  },

  /** Limites numericos valem para todo mundo abaixo de PRO, com ou sem login. */
  shouldEnforceLimits: function() {
    return !BILLING.hasTier('PRO');
  },
});
