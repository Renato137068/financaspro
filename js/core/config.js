/**
 * @file config.js — Application constants & configuration
 *
 * FP_BUILD_MODE:
 *   'cloud' — Play Store / sync Supabase (padrão)
 *   'local' — piloto offline sem login (scripts/set-build-mode.cjs local)
 * Runtime: localStorage fp-force-local=1 também força modo local (dev).
 *
 * Credenciais cloud: defaults abaixo (anon key pública). Override no build via
 * SUPABASE_URL + SUPABASE_ANON_KEY ? scripts/inject-supabase-env.cjs.
 */

var FP_BUILD_MODE = 'cloud';

function _fpWantLocal() {
  if (FP_BUILD_MODE === 'local') return true;
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('fp-force-local') === '1') {
      return true;
    }
  } catch (e) { /* noop */ }
  try {
    if (typeof window !== 'undefined' && window.__FP_FORCE_LOCAL__ === true) return true;
  } catch (e2) { /* noop */ }
  return false;
}

/* Preenchidos por inject-supabase-env.cjs quando as env vars existem; senão ''. */
var _FP_ENV_URL = '';
var _FP_ENV_ANON = '';

var _FP_CLOUD_URL = _FP_ENV_URL || 'https://nubvlksibmpryltkfpei.supabase.co';
var _FP_CLOUD_ANON = _FP_ENV_ANON || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51YnZsa3NpYm1wcnlsdGtmcGVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1MzQ1NjEsImV4cCI6MjA5MjExMDU2MX0.lVA2ms3WvWPZ1fStgQC9-32CCLqNFVtSr8LNYZrfwq0';
var _fpLocal = _fpWantLocal();

const CONFIG = {
  APP_NAME: 'FinançasPro',
  VERSION: '11.3.19',
  BUILD_MODE: _fpLocal ? 'local' : 'cloud',

  /** Open Finance em produção (Belvo). Enquanto false, o card some do Perfil. */
  FEATURE_OPEN_FINANCE: false,

  STORAGE_TRANSACOES: 'fp-transacoes',
  STORAGE_CONFIG: 'fp-config',
  STORAGE_CONTAS: 'fp-contas',
  STORAGE_OUTBOX: 'fp-outbox',
  STORAGE_SYNC_CURSOR: 'fp-sync-cursor',
  STORAGE_APRENDIZADO: 'aprendizado_historico',
  STORAGE_RASCUNHO: '_rascunho_transacao',
  API_BASE_URL: '',
  API_FALLBACK_URL: 'http://localhost:4000',
  API_TOKEN_STORAGE: 'fp-api-token',
  API_REFRESH_TOKEN_STORAGE: 'fp-refresh-token',
  API_USER_STORAGE: 'fp-api-user',

  // Supabase: vazios = local-first (sem login forçado). Cloud = Play Store.
  SUPABASE_URL: _fpLocal ? '' : _FP_CLOUD_URL,
  SUPABASE_ANON_KEY: _fpLocal ? '' : _FP_CLOUD_ANON,

  TIPO_RECEITA: 'receita',
  TIPO_DESPESA: 'despesa',
  // Movimentação entre contas do próprio usuário. Não é ganho nem gasto: só
  // muda de lugar. Como todos os agregadores do app filtram por 'receita' ou
  // 'despesa', um tipo próprio é automaticamente ignorado por eles — receitas,
  // despesas, orçamento 50/30/20 e relatórios seguem corretos sem alteração.
  TIPO_TRANSFERENCIA: 'transferencia',

  CATEGORIAS_RECEITA_SLUGS: ['salario','freelance','investimentos','vendas','reembolsos','beneficios','presentes','aluguel_recebido','premios','outros'],
  CATEGORIAS_DESPESA_SLUGS: ['alimentacao','transporte','moradia','saude','educacao','lazer','assinaturas','seguros','impostos','servicos_financeiros','compras','vestuario','viagem','pet','familia','doacoes','beleza','outro'],

  CATEGORIAS_LABELS: {
    salario: 'Salário', freelance: 'Freelance', investimentos: 'Investimentos',
    vendas: 'Vendas', reembolsos: 'Reembolsos', beneficios: 'Benefícios', presentes: 'Presentes', aluguel_recebido: 'Aluguel Recebido', premios: 'Prêmios', outros: 'Outros',
    alimentacao: 'Alimentação', transporte: 'Transporte', moradia: 'Moradia',
    saude: 'Saúde', educacao: 'Educação', lazer: 'Lazer', outro: 'Outros',
    entretenimento: 'Entretenimento', compras: 'Compras', vestuario: 'Vestuário',
    viagem: 'Viagem', pet: 'Pet', assinaturas: 'Assinaturas', seguros: 'Seguros',
    impostos: 'Impostos e Taxas', servicos_financeiros: 'Serviços Financeiros',
    familia: 'Família', doacoes: 'Doações', beleza: 'Beleza e Cuidados'
  },

  get CATEGORIAS_RECEITA() { return this.CATEGORIAS_RECEITA_SLUGS; },
  get CATEGORIAS_DESPESA() { return this.CATEGORIAS_DESPESA_SLUGS; },

  get CATS_DESPESA_FORM() {
    return this.CATEGORIAS_DESPESA_SLUGS.map(function(v) {
      return { v: v, l: CONFIG.CATEGORIAS_LABELS[v] };
    });
  },
  get CATS_RECEITA_FORM() {
    return this.CATEGORIAS_RECEITA_SLUGS.map(function(v) {
      return { v: v, l: CONFIG.CATEGORIAS_LABELS[v] };
    });
  },

  _LUCIDE_ICONS: {
    alimentacao: 'utensils', transporte: 'car', moradia: 'home', saude: 'pill',
    educacao: 'book-open', lazer: 'film', outro: 'pin', outros: 'pin',
    salario: 'wallet', freelance: 'laptop', investimentos: 'trending-up', vendas: 'shopping-cart',
    reembolsos: 'rotate-ccw', beneficios: 'gift', presentes: 'gift', aluguel_recebido: 'home',
    premios: 'trophy', assinaturas: 'tv', seguros: 'shield', impostos: 'receipt',
    servicos_financeiros: 'landmark', compras: 'shopping-bag', vestuario: 'shirt',
    viagem: 'plane', pet: 'paw', familia: 'users', doacoes: 'heart', beleza: 'sparkles'
  },

  /** @deprecated Use _LUCIDE_ICONS ? mantido para compatibilidade legada */
  get _EMOJIS() { return this._LUCIDE_ICONS; },

  get CATEGORIAS_MAP() {
    var map = {};
    var self = this;
    Object.keys(this.CATEGORIAS_LABELS).forEach(function(slug) {
      map[slug] = self.CATEGORIAS_LABELS[slug];
    });
    return Object.freeze(map);
  },

  CATEGORIAS_INTERNAS_MAP: {
    supermercado: 'alimentacao', delivery: 'alimentacao', restaurante: 'alimentacao', cafeteria: 'alimentacao',
    transporte_app: 'transporte', transporte_publico: 'transporte', combustivel: 'transporte', pedagio: 'transporte', estacionamento: 'transporte',
    aluguel: 'moradia', condominio: 'moradia', energia: 'moradia', agua: 'moradia', gas: 'moradia', internet: 'moradia', telefone: 'moradia',
    farmacia: 'saude', consultas: 'saude', exames: 'saude', plano_saude: 'saude', academia: 'saude',
    cursos: 'educacao', livros: 'educacao', mensalidade: 'educacao',
    streaming: 'assinaturas', software: 'assinaturas',
    taxas_bancarias: 'servicos_financeiros', juros: 'servicos_financeiros', tarifas: 'servicos_financeiros',
    roupas: 'vestuario', calcados: 'vestuario', hotel: 'viagem', passagens: 'viagem',
    veterinario: 'pet', racao: 'pet', salao: 'beleza', cosmeticos: 'beleza',
    salario_fixo: 'salario', bonus: 'salario', comissoes: 'vendas',
    dividendos: 'investimentos', rendimentos: 'investimentos', cashback: 'reembolsos', estorno: 'reembolsos'
  },

  normalizeCategoriaFinal: function(slug, tipo) {
    var s = String(slug || '').trim().toLowerCase();
    if (!s) return tipo === this.TIPO_RECEITA ? 'outros' : 'outro';
    var mapped = this.CATEGORIAS_INTERNAS_MAP[s] || s;
    var lista = tipo === this.TIPO_RECEITA ? this.CATEGORIAS_RECEITA_SLUGS : this.CATEGORIAS_DESPESA_SLUGS;
    if (lista.indexOf(mapped) !== -1) return mapped;
    // Categorias criadas pelo usuário: não colapsar em "outro(s)".
    var custom = this.resolveCustomCategoria(slug, tipo);
    if (custom) return custom;
    return tipo === this.TIPO_RECEITA ? 'outros' : 'outro';
  },

  /** Slug estável a partir do nome exibido (custom). */
  slugifyCategoria: function(nome) {
    var raw = String(nome || '').trim().toLowerCase();
    if (!raw) return '';
    try {
      raw = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    } catch (e) { /* IE/legado */ }
    return raw.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  },

  /**
   * Se nome/slug bate com uma categoria custom do tipo, devolve o slug a gravar.
   * @returns {string|null}
   */
  resolveCustomCategoria: function(nomeOuSlug, tipo) {
    var lista = null;
    try {
      if (typeof DADOS !== 'undefined' && DADOS.getConfig) {
        var cc = (DADOS.getConfig().categoriasCustom) || {};
        lista = cc[tipo] || cc[String(tipo || '').toLowerCase()] || null;
      }
    } catch (e) { lista = null; }
    if (!lista || !lista.length) return null;
    var alvo = String(nomeOuSlug || '').trim().toLowerCase();
    var slugAlvo = this.slugifyCategoria(nomeOuSlug);
    for (var i = 0; i < lista.length; i++) {
      var nome = lista[i];
      if (!nome) continue;
      if (String(nome).trim().toLowerCase() === alvo) return this.slugifyCategoria(nome) || null;
      if (this.slugifyCategoria(nome) === slugAlvo && slugAlvo) return slugAlvo;
    }
    return null;
  },

  /** Nome amigável: whitelist, depois custom, senão a própria chave crua. */
  getCatLabel: function(slug) {
    if (this.CATEGORIAS_LABELS[slug]) return this.CATEGORIAS_LABELS[slug];
    var tipos = [this.TIPO_DESPESA, this.TIPO_RECEITA];
    for (var t = 0; t < tipos.length; t++) {
      try {
        if (typeof DADOS === 'undefined' || !DADOS.getConfig) break;
        var lista = ((DADOS.getConfig().categoriasCustom) || {})[tipos[t]] || [];
        for (var i = 0; i < lista.length; i++) {
          if (this.slugifyCategoria(lista[i]) === slug) return lista[i];
        }
      } catch (e) { /* */ }
    }
    // Slug desconhecido (sem rótulo na whitelist nem custom): devolve a chave
    // como veio, sem fabricar um nome capitalizado. Preserva o contrato de
    // labelCategoria (chave desconhecida volta crua).
    return String(slug || '');
  },

  DEFAULT_CONFIG: {
    nome: 'Usuário',
    moeda: 'BRL',
    tema: 'light',
    plano: 'free',
    ultimoExportoDados: null,
    metas: [],
    contasPagar: [],
    assinaturas: [],
    patrimonio: { ativos: [], dividas: [] },
    openFinance: { connections: [], lastSync: null },
    syncV2Enabled: true,
  },

  /** Lote de transações por página no pull incremental (espelha backend). */
  SYNC_DELTA_BATCH_SIZE: 500,

  /** Meses de histórico mantidos no localStorage (resto permanece no servidor). */
  LOCAL_TX_WINDOW_MONTHS: 24,

  MOEDA_FORMATACAO: {
    BRL: { locale: 'pt-BR', currency: 'BRL' },
    USD: { locale: 'en-US', currency: 'USD' },
    EUR: { locale: 'pt-PT', currency: 'EUR' }
  },

  CORES_CATEGORIAS: {
    alimentacao: '#ef6c00', transporte: '#1565c0', moradia: '#2e7d32', saude: '#c62828',
    educacao: '#283593', lazer: '#7b1fa2', assinaturas: '#455a64', seguros: '#00897b',
    impostos: '#6d4c41', servicos_financeiros: '#3949ab', compras: '#8e24aa', vestuario: '#ad1457',
    viagem: '#0277bd', pet: '#5d4037', familia: '#43a047', doacoes: '#d81b60', beleza: '#ec407a',
    salario: '#12694E', investimentos: '#1b5e20', vendas: '#2e7d32', reembolsos: '#546e7a',
    beneficios: '#616161', presentes: '#8d6e63', aluguel_recebido: '#2e7d32', premios: '#f9a825',
    outro: '#78909c', outros: '#78909c'
  },

  NOMES_MESES: ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}
