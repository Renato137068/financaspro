// supabase/functions/_shared/billing-constants.ts
// Espelha config/plan-limits.json. Mantido por tests/trial-parity.test.js.

/** Trial do SKU da loja (Play Console / Stripe Checkout). */
export const TRIAL_DAYS = 7;

/**
 * Pro de boas-vindas: dias de PRO concedidos na criacao da conta, sem cartao.
 * Entitlement do proprio backend (status TRIALING), nao assinatura da loja --
 * por isso convive com TRIAL_DAYS sem conflitar com a politica da Play.
 */
export const WELCOME_TRIAL_DAYS = 14;
