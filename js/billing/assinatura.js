/**
 * billing/assinatura.js — assinatura na nuvem: planos, organização, trial, checkout, cancelamento, portal e os avisos de ciclo.
 *
 * Parte de BILLING (js/billing.js, que importa todas as partes): cada uma
 * acrescenta seus métodos ao mesmo objeto, criado em billing/base.js. Os
 * métodos continuam se chamando por BILLING.x.
 */

import { BILLING } from './base.js';
import { FUNIL } from '../utilities/funil.js';
import { DADOS } from '../core/dados.js';

Object.assign(BILLING, {

  listPlans: function() {
    var self = BILLING;
    // A tabela Plan dá os preços; os textos da vitrine são sempre os do app
    // (STATIC_PLANS), para a tela não prometer o que o plano grátis já tem.
    var copyPorTier = {};
    BILLING.STATIC_PLANS.forEach(function(p) { copyPorTier[p.tier] = p.features; });
    var onlyVitrine = function(plans) {
      return (plans || []).filter(function(p) {
        return p && p.tier !== 'BUSINESS';
      }).map(function(p) {
        if (!copyPorTier[p.tier]) return p;
        return Object.assign({}, p, { features: copyPorTier[p.tier].slice() });
      });
    };
    if (BILLING._cache.plans) return Promise.resolve(onlyVitrine(BILLING._cache.plans));
    if (!BILLING._useSupabaseBilling()) {
      return Promise.resolve(onlyVitrine(BILLING.STATIC_PLANS.slice()));
    }
    return SUPA_BILLING.listPlans().then(function(plans) {
      self._cache.plans = plans.length ? plans : self.STATIC_PLANS.slice();
      return onlyVitrine(self._cache.plans);
    }).catch(function() {
      return onlyVitrine(self.STATIC_PLANS.slice());
    });
  },

  ensureOrg: function() {
    var self = BILLING;
    if (BILLING._cache.orgId) return Promise.resolve(BILLING._cache.orgId);
    if (!BILLING._useSupabaseBilling()) return Promise.reject(BILLING._semNuvem());
    return SUPA_BILLING.ensureOrg().then(function(orgId) {
      self._cache.orgId = orgId;
      return orgId;
    });
  },

  fetchSubscription: function() {
    var self = BILLING;
    return BILLING.ensureOrg().then(function(orgId) {
      return SUPA_BILLING.fetchSubscription(orgId);
    }).then(function(sub) {
      self._cache.subscription = sub;
      if (sub && sub.plan && sub.plan.tier && self._activeStatus(sub.status, sub)) {
        self._cache.tier = sub.plan.tier;
      } else {
        self._cache.tier = 'FREE';
      }
      self._persistEntitlement(sub);
      return sub;
    }).catch(function(err) {
      if (err && err.status === 404) {
        self._cache.subscription = null;
        self._cache.tier = 'FREE';
        self._persistEntitlement(null);
        return null;
      }
      throw err;
    });
  },

  _WELCOME_KEY: 'fp-welcome-trial-pedido',

  /**
   * E o Pro de boas-vindas, e nao o trial do SKU da loja?
   *
   * Importa para a copy: no trial da loja o cartao ja esta no arquivo e a
   * cobranca comeca sozinha; no de boas-vindas nao ha cartao nenhum e nada
   * sera cobrado. Dizer "sua cobranca comeca em 2 dias" para quem nunca deu
   * cartao e alarme falso -- e alarme falso em app financeiro custa confianca.
   */
  isWelcomeTrial: function(sub) {
    sub = sub || BILLING._cache.subscription;
    return !!(sub && typeof sub.stripeSubId === 'string'
      && sub.stripeSubId.indexOf('welcome:') === 0);
  },

  /** Assinatura gerenciada pelo Google Play (chave play:<token>). */
  isPlayManaged: function(sub) {
    sub = sub || BILLING._cache.subscription;
    return !!(sub && typeof sub.stripeSubId === 'string'
      && sub.stripeSubId.indexOf('play:') === 0);
  },

  _PLAY_SUBSCRIPTIONS_URL:
    'https://play.google.com/store/account/subscriptions?package=com.financaspro.mobile',

  _openPlaySubscriptions: function() {
    var url = BILLING._PLAY_SUBSCRIPTIONS_URL;
    if (typeof window !== 'undefined' && window.open) window.open(url, '_blank');
    return url;
  },

  /**
   * Pede o Pro de boas-vindas: WELCOME_TRIAL_DAYS dias de PRO, sem cartao.
   *
   * Idempotente em duas camadas. No servidor, uma linha por usuario para
   * sempre (fp_welcome_trial_grant) -- sair e entrar de novo nao renova. No
   * cliente, uma marca local que evita bater na Edge a cada login: 409 nao e
   * erro, e a resposta esperada de quem ja recebeu.
   *
   * Falha em silencio de proposito: nao ganhar o brinde nao pode atrapalhar o
   * login de ninguem.
   */
  claimWelcomeTrial: function() {
    var self = BILLING;
    if (!BILLING.isCloudUser()) return Promise.resolve(null);
    try {
      if (localStorage.getItem(BILLING._WELCOME_KEY)) return Promise.resolve(null);
    } catch (e) { /* modo privado: tenta e deixa o servidor decidir */ }

    if (!BILLING._useSupabaseBilling()) return Promise.resolve(null);

    var marcar = function() {
      try { localStorage.setItem(self._WELCOME_KEY, '1'); } catch (e) { /* */ }
    };

    return BILLING.ensureOrg().then(function(orgId) {
      return SUPA_BILLING.invoke('welcome-trial', { orgId: orgId });
    }).then(function(out) {
      marcar();
      self.invalidateCache();
      return self.sync().then(function() {
        if (typeof FUNIL !== 'undefined') {
          FUNIL.marco(FUNIL.E.TRIAL_INICIADO, { origem: 'boas-vindas' });
        }
        return out;
      });
    }).catch(function(err) {
      // 409 = ja concedido, ou ja existe assinatura. Nos dois casos nao ha o
      // que fazer de novo, e insistir a cada login so gasta rede.
      if (err && err.status === 409) marcar();
      return null;
    });
  },

  sync: function() {
    var self = BILLING;
    if (!BILLING.isCloudUser()) return Promise.resolve(null);
    return BILLING.fetchSubscription().then(function(sub) {
      var plano = 'free';
      if (sub && sub.plan && sub.plan.tier && self._activeStatus(sub.status, sub)) {
        plano = self.planoFromTier(sub.plan.tier);
      }
      if (typeof DADOS !== 'undefined' && DADOS.getConfig && DADOS.salvarConfig) {
        var atual = DADOS.getConfig().plano;
        if (atual !== plano) DADOS.salvarConfig({ plano: plano });
      }
      if (typeof INIT_CONFIG !== 'undefined' && INIT_CONFIG.refreshPerfil) {
        INIT_CONFIG.refreshPerfil();
      }
      if (typeof INIT_BILLING !== 'undefined' && INIT_BILLING.refreshPlanoCard) {
        INIT_BILLING.refreshPlanoCard();
      }
      return sub;
    });
  },

  createCheckout: function(planTier, interval) {
    var base = window.location.href.split('#')[0].split('?')[0];
    return BILLING.ensureOrg().then(function(orgId) {
      return SUPA_BILLING.invoke('stripe-checkout', {
        orgId: orgId,
        planTier: planTier,
        interval: interval || 'monthly',
        successUrl: base + '?billing=success',
        cancelUrl: base + '?billing=cancel',
      });
    });
  },

  checkoutOrSubscribe: function(planTier, interval) {
    return BILLING.createCheckout(planTier, interval).then(function(session) {
      if (session && session.url) {
        window.location.href = session.url;
        return { redirected: true };
      }
      var miss = new Error('Checkout indisponível. Tente novamente em instantes.');
      miss.code = 'checkout-unavailable';
      throw miss;
    });
  },

  cancelSubscription: function() {
    var self = BILLING;
    // Roteia pela FONTE do entitlement — não por “é Capacitor”.
    // No Android com trial welcome:/Stripe, abrir a Play Store era um beco sem saída.
    if (BILLING.isPlayManaged()) {
      BILLING._openPlaySubscriptions();
      return Promise.resolve(self._cache.subscription);
    }
    return BILLING.ensureOrg().then(function(orgId) {
      return SUPA_BILLING.invoke('stripe-cancel', { orgId: orgId });
    }).then(function(sub) {
      self._cache.subscription = sub;
      return self.sync().then(function() { return sub; });
    });
  },

  /** Desfaz cancel_at_period_end (Stripe). No Play, o usuário reativa na loja. */
  resumeSubscription: function() {
    var self = BILLING;
    if (BILLING.isPlayManaged()) {
      BILLING._openPlaySubscriptions();
      return Promise.resolve(self._cache.subscription);
    }
    return BILLING.ensureOrg().then(function(orgId) {
      return SUPA_BILLING.invoke('stripe-resume', { orgId: orgId });
    }).then(function(sub) {
      self._cache.subscription = sub;
      return self.sync().then(function() { return sub; });
    });
  },

  openPortal: function() {
    if (BILLING.isPlayManaged()) {
      BILLING._openPlaySubscriptions();
      return Promise.resolve(BILLING._cache.subscription);
    }
    var returnUrl = window.location.href.split('#')[0];
    return BILLING.ensureOrg().then(function(orgId) {
      return SUPA_BILLING.invoke('stripe-portal', {
        orgId: orgId,
        returnUrl: returnUrl,
      });
    }).then(function(session) {
      if (session && session.url) {
        window.location.href = session.url;
      } else {
        throw new Error('Portal de pagamento indisponível');
      }
    });
  },

  getStatusLabel: function() {
    var sub = BILLING._cache.subscription;
    if (!sub) {
      return BILLING.isCloudUser() ? 'Gratuito na nuvem' : 'Gratuito · uso local';
    }
    var name = (sub.plan && sub.plan.name) ? sub.plan.name : BILLING.getTier();
    if (sub.status === 'TRIALING' && sub.trialEndsAt) {
      var d = new Date(sub.trialEndsAt);
      return BILLING.isWelcomeTrial(sub)
        ? name + ' · cortesia até ' + d.toLocaleDateString('pt-BR')
        : name + ' · trial até ' + d.toLocaleDateString('pt-BR');
    }
    if (sub.cancelAtPeriodEnd && sub.currentPeriodEnd) {
      var fim = new Date(sub.currentPeriodEnd);
      var diasRest = Math.ceil((fim.getTime() - Date.now()) / 86400000);
      if (!isNaN(diasRest) && diasRest >= 0) {
        if (diasRest === 0) return name + ' · último dia (cancelado)';
        return name + ' · mais ' + diasRest + ' dia' + (diasRest === 1 ? '' : 's') + ' (cancelado)';
      }
      return name + ' · cancela em ' + fim.toLocaleDateString('pt-BR');
    }
    if (sub.status === 'PAST_DUE') return name + ' · pagamento pendente';
    return name;
  },

  /**
   * Alerta de ciclo de vida da assinatura (dunning / trial acabando / cancelamento).
   * Prioridade alta para banner no dashboard.
   */
  getLifecycleAlert: function() {
    var sub = BILLING._cache.subscription;
    if (!sub || !BILLING.isCloudUser()) return null;

    if (sub.status === 'PAST_DUE') {
      var aindaNoPeriodo = BILLING._activeStatus('PAST_DUE', sub);
      return {
        severity: 'warn',
        title: 'Pagamento pendente',
        message: aindaNoPeriodo
          ? 'Atualize o método de pagamento. O Pro continua até o fim do período já pago.'
          : 'Atualize o método de pagamento para reativar o Pro.',
        cta: 'portal',
        ctaLabel: 'Atualizar pagamento',
      };
    }

    if (sub.status === 'TRIALING' && sub.trialEndsAt) {
      var ends = new Date(sub.trialEndsAt).getTime();
      if (!isNaN(ends)) {
        var daysLeft = Math.ceil((ends - Date.now()) / 86400000);
        if (daysLeft >= 0 && daysLeft <= 3) {
          if (BILLING.isWelcomeTrial(sub)) {
            return {
              severity: 'info',
              title: daysLeft === 0
                ? 'Seus dias de Pro acabam hoje'
                : ('Seus dias de Pro acabam em ' + daysLeft + ' dia' + (daysLeft === 1 ? '' : 's')),
              message: 'Nada será cobrado — você volta ao plano gratuito. Quer continuar com o Pro?',
              cta: 'paywall',
              ctaLabel: 'Continuar no Pro',
            };
          }
          return {
            severity: 'warn',
            title: daysLeft === 0 ? 'Trial acaba hoje' : ('Trial acaba em ' + daysLeft + ' dia' + (daysLeft === 1 ? '' : 's')),
            message: 'Depois disso a cobrança do Pro começa automaticamente.',
            cta: 'portal',
            ctaLabel: 'Gerenciar assinatura',
          };
        }
      }
    }

    if (sub.cancelAtPeriodEnd && sub.currentPeriodEnd) {
      var fim = new Date(sub.currentPeriodEnd);
      var dias = Math.ceil((fim.getTime() - Date.now()) / 86400000);
      if (isNaN(dias) || dias < 0) {
        return {
          severity: 'info',
          title: 'Assinatura cancelada',
          message: 'Você volta ao gratuito na nuvem. O Pro já não renova.',
          cta: 'paywall',
          ctaLabel: 'Ver planos',
        };
      }
      return {
        severity: 'info',
        title: dias === 0
          ? 'Último dia de Pro'
          : ('Mais ' + dias + ' dia' + (dias === 1 ? '' : 's') + ' de Pro'),
        message: dias === 0
          ? 'Sua assinatura foi cancelada. Depois de hoje você volta ao gratuito.'
          : ('Você cancelou a renovação. Continua no Pro até '
            + fim.toLocaleDateString('pt-BR')
            + ', depois volta ao gratuito.'),
        cta: 'paywall',
        ctaLabel: 'Reativar Pro',
      };
    }

    return null;
  },
});
