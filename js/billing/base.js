/**
 * billing/base.js — o objeto BILLING com o cache e os dados dos planos (limites, ordem dos tiers, planos estáticos).
 *
 * As partes acrescentam os métodos a ele; billing.js junta tudo. Um
 * módulo próprio é o que deixa as partes importarem o objeto sem import
 * circular com billing.js.
 */


export const BILLING = {
  _cache: {
    orgId: null,
    subscription: null,
    plans: null,
    tier: null,
  },

  /**
   * Limites por plano. `Infinity` = ilimitado.
   *
   * Espelha config/plan-limits.json (fonte canonica), onde ilimitado e `null`.
   * A paridade e verificada por tests/plan-limits-parity.test.js.
   *
   * Regra de produto (2026-09): o limite e de PROFUNDIDADE e AUTOMACAO, nunca
   * de volume de uso. Por isso maxTransPerMonth e Infinity ate no FREE: travar
   * o registro no meio do mes quebra o habito que sustenta o produto inteiro.
   */
  PLAN_LIMITS: {
    FREE: {
      maxUsers: 1,
      maxTransPerMonth: Infinity,
      maxAccounts: 5,
      maxBudgets: 5,
      maxCustomCategories: 5,
      maxGoals: 1,
      maxRecurring: 3,
      maxBillsToPay: 5,
      maxSubscriptions: 5,
      maxAttachments: 10,
      maxDevices: 1,
      historyMonths: 3,
      ocrPerMonth: 5, // legado: espelha a coluna do banco (plan-limits-parity); OCR saiu do produto
      aiFeatures: false,
      teamFeatures: false,
      exportCsv: true,
      exportPdf: false,
      advancedAlerts: false,
      openFinance: false,
      learnedCategorization: false,
      futureInvoiceProjection: false,
      netWorthHistory: false,
    },
    PRO: {
      maxUsers: 2,
      maxTransPerMonth: Infinity,
      maxAccounts: Infinity,
      maxBudgets: Infinity,
      maxCustomCategories: Infinity,
      maxGoals: Infinity,
      maxRecurring: Infinity,
      maxBillsToPay: Infinity,
      maxSubscriptions: Infinity,
      maxAttachments: Infinity,
      maxDevices: Infinity,
      historyMonths: Infinity,
      ocrPerMonth: Infinity,
      aiFeatures: true,
      teamFeatures: true,
      exportCsv: true,
      exportPdf: true,
      advancedAlerts: true,
      openFinance: true,
      learnedCategorization: true,
      futureInvoiceProjection: true,
      netWorthHistory: true,
    },
    BUSINESS: {
      maxUsers: Infinity,
      maxTransPerMonth: Infinity,
      maxAccounts: Infinity,
      maxBudgets: Infinity,
      maxCustomCategories: Infinity,
      maxGoals: Infinity,
      maxRecurring: Infinity,
      maxBillsToPay: Infinity,
      maxSubscriptions: Infinity,
      maxAttachments: Infinity,
      maxDevices: Infinity,
      historyMonths: Infinity,
      ocrPerMonth: Infinity,
      aiFeatures: true,
      teamFeatures: true,
      exportCsv: true,
      exportPdf: true,
      advancedAlerts: true,
      openFinance: true,
      learnedCategorization: true,
      futureInvoiceProjection: true,
      netWorthHistory: true,
    },
  },

  /** Trial do SKU da loja (Play Console + Stripe Edge + Express + paywall). */
  TRIAL_DAYS: 7,

  /**
   * Pro de boas-vindas: dias de PRO concedidos na criacao da conta, SEM cartao.
   *
   * Trial reverso. O usuario forma habito COM os recursos pagos e depois os
   * perde, em vez de decidir sobre uma lista de features que nunca viu
   * funcionar. Concedido pelo backend como entitlement (status TRIALING), nao
   * pela loja -- por isso nao conflita com o trial de 7 dias do SKU.
   */
  WELCOME_TRIAL_DAYS: 14,

  TIER_ORDER: { FREE: 0, PRO: 1, BUSINESS: 2 },

  /**
   * Vitrine do paywall. Os precos reais vem da loja (Play getProductDetails) ou
   * do backend; isto e o fallback offline e a fonte da copy.
   *
   * A copy vende CAPACIDADE, nao remocao de limite. "Sem limites" posiciona a
   * assinatura como pedagio -- o usuario paga para desfazer um obstaculo que o
   * proprio app criou. O que converte e o que o Pro FAZ por ele.
   */
  STATIC_PLANS: [
    {
      tier: 'FREE',
      name: 'Gratuito',
      priceMonthly: 0,
      priceYearly: 0,
      features: [
        'Lançamentos ilimitados, sempre',
        'Orçamento 50/30/20 completo',
        '5 contas e cartões',
        'Últimos 3 meses de gráficos e relatórios',
        'Exportação CSV e backup livres',
      ],
    },
    {
      tier: 'PRO',
      name: 'Pro',
      priceMonthly: 16.99,
      priceYearly: 129.99,
      features: [
        'Todo o seu histórico, com comparativo ano a ano',
        'Previsão de fim de mês e do fluxo futuro',
        'Encontra assinaturas esquecidas que você ainda paga',
        'Categoriza sozinho, aprendendo com você',
        'Fatura do cartão projetada, parcelas incluídas',
        'Celular, tablet e navegador sincronizados',
        'Modo casal — duas pessoas, uma vida financeira',
      ],
    },
    // Business não é oferecido na vitrine (SHOW_BUSINESS_PLAN: false).
    // Mantido fora de STATIC_PLANS para o paywall ter só Grátis + Pro.
  ],
};
