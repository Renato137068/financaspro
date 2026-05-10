/**
 * @file config.js — Application constants & configuration
 * @module CONFIG
 * Tier 0. Sem dependências.
 *
 * Contém:
 * - Storage keys (localStorage namespace)
 * - Categorias slugs e labels (fonte única)
 * - Transaction types
 * - DEFAULT_CONFIG (template para novos usuários)
 */

const CONFIG = {
  APP_NAME: 'FinançasPro MVP',
  VERSION: '3.0.0',

  // Storage keys
  STORAGE_TRANSACOES: 'fp-transacoes',
  STORAGE_CONFIG: 'fp-config',
  STORAGE_CONTAS: 'fp-contas',
  STORAGE_APRENDIZADO: 'aprendizado_historico',
  STORAGE_RASCUNHO: '_rascunho_transacao',
  API_BASE_URL: '',
  API_FALLBACK_URL: 'http://localhost:4000',
  API_TOKEN_STORAGE: 'fp-api-token',
  API_USER_STORAGE: 'fp-api-user',

  // Transaction types
  TIPO_RECEITA: 'receita',
  TIPO_DESPESA: 'despesa',

  // Slugs canônicos de categoria — fonte única de verdade
  CATEGORIAS_RECEITA_SLUGS: ['salario','freelance','investimentos','vendas','outros'],
  CATEGORIAS_DESPESA_SLUGS: ['alimentacao','transporte','moradia','saude','educacao','lazer','outro'],

  // Labels legíveis — indexados por slug
  CATEGORIAS_LABELS: {
    salario: 'Salário', freelance: 'Freelance', investimentos: 'Investimentos',
    vendas: 'Vendas', outros: 'Outros',
    alimentacao: 'Alimentação', transporte: 'Transporte', moradia: 'Moradia',
    saude: 'Saúde', educacao: 'Educação', lazer: 'Lazer', outro: 'Outro',
    entretenimento: 'Entretenimento', compras: 'Compras', vestuario: 'Vestuário',
    viagem: 'Viagem', pet: 'Pet', assinaturas: 'Assinaturas'
  },

  // Aliases para compatibilidade com código que ainda usa os nomes antigos
  get CATEGORIAS_RECEITA() { return this.CATEGORIAS_RECEITA_SLUGS; },
  get CATEGORIAS_DESPESA() { return this.CATEGORIAS_DESPESA_SLUGS; },

  // CATS_*_FORM derivados dinamicamente — evita manutenção duplicada
  get CATS_DESPESA_FORM() {
    return this.CATEGORIAS_DESPESA_SLUGS.map(function(v) {
      return { v: v, l: CONFIG._EMOJIS[v] + ' ' + CONFIG.CATEGORIAS_LABELS[v] };
    });
  },
  get CATS_RECEITA_FORM() {
    return this.CATEGORIAS_RECEITA_SLUGS.map(function(v) {
      return { v: v, l: CONFIG._EMOJIS[v] + ' ' + CONFIG.CATEGORIAS_LABELS[v] };
    });
  },

  // Emojis por slug (usados internamente pelos getters acima)
  _EMOJIS: {
    alimentacao: '🍔', transporte: '🚗', moradia: '🏠', saude: '⚕️',
    educacao: '📚', lazer: '🎬', outro: '📌', outros: '📌',
    salario: '💼', freelance: '💻', investimentos: '📈', vendas: '🛒'
  },

  // CATEGORIAS_MAP derivado: slug → "emoji label" (compat com código antigo)
  get CATEGORIAS_MAP() {
    var map = {};
    var self = this;
    Object.keys(this.CATEGORIAS_LABELS).forEach(function(slug) {
      var emoji = self._EMOJIS[slug] || '📌';
      map[slug] = emoji + ' ' + self.CATEGORIAS_LABELS[slug];
    });
    return Object.freeze(map);
  },

  /**
   * Slug de categoria → label legível.
   * Fallback: capitaliza primeira letra do slug.
   * @param {string} slug
   * @returns {string}
   */
  getCatLabel: function(slug) {
    return this.CATEGORIAS_LABELS[slug] || slug.charAt(0).toUpperCase() + slug.slice(1);
  },

  // Default user config
  DEFAULT_CONFIG: {
    nome: 'Usuário',
    moeda: 'BRL',
    tema: 'light',
    ultimoExportoDados: null
  },

  // Formato de moeda
  MOEDA_FORMATACAO: {
    BRL: { locale: 'pt-BR', currency: 'BRL' },
    USD: { locale: 'en-US', currency: 'USD' },
    EUR: { locale: 