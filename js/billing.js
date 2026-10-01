/**
 * billing.js — Planos SaaS, paywall e integração Stripe (backend)
 * Depende de: DADOS, CONFIG, UTILS
 *
 * ES Module (ADR 0005): os scripts clássicos o recebem como global por
 * js/esm/ponte.js.
 *
 * Dividido em billing/: o objeto e os dados nascem em base.js e cada parte
 * acrescenta os seus métodos — plano, cotas, assinatura, equipe.
 */

import { BILLING } from './billing/base.js';
import './billing/plano.js';
import './billing/cotas.js';
import './billing/assinatura.js';
import './billing/equipe.js';
import { DADOS } from './core/dados.js';

Object.assign(BILLING, {

  init: function() {
    var self = BILLING;
    if (typeof DADOS !== 'undefined' && DADOS._nuvemAtiva && DADOS._nuvemAtiva()) {
      if (BILLING.isCloudUser()) {
        self.sync().catch(function() {});
      }
    }
  },

  invalidateCache: function() {
    BILLING._cache = { orgId: null, subscription: null, plans: null, tier: null };
  },
});

export { BILLING };
export default BILLING;
