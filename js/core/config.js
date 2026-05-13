/**
 * @file config.js — Application constants & configuration
 */

const CONFIG = {
  APP_NAME: 'FinancasPro MVP',
  VERSION: '3.0.0',

  STORAGE_TRANSACOES: 'fp-transacoes',
  STORAGE_CONFIG: 'fp-config',
  STORAGE_CONTAS: 'fp-contas',
  STORAGE_APRENDIZADO: 'aprendizado_historico',
  STORAGE_RASCUNHO: '_rascunho_transacao',
  API_BASE_URL: '',
  API_FALLBACK_URL: 'http://localhost:4000',
  API_TOKEN_STORAGE: 'fp-api-token',
  API_REFRESH_TOKEN_STORAGE: 'fp-refresh-token',
  API_USER_STORAGE: 'fp-api-user',

  TIPO_RECEITA: 'receita',
  TIPO_DESPESA: 'despesa',

  CATEGORIAS_RECEITA_SLUGS: ['salario','freelance','investimentos','vendas','reembolsos','beneficios','presentes','aluguel_recebido','premios','outros'],
  CATEGORIAS_DESPESA_SLUGS: ['alimentacao','transporte','moradia','saude','educacao','lazer','assinaturas','seguros','impostos','servicos_financeiros','compras','vestuario','viagem','pet','familia','doacoes','beleza','outro'],

  CATEGORIAS_LABELS: {
    salario: 'Salario', freelance: 'Freelance', investimentos: 'Investimentos',
    vendas: 'Vendas', reembolsos: 'Reembolsos', beneficios: 'Beneficios', presentes: 'Presentes', aluguel_recebido: 'Aluguel Recebido', premios: 'Premios', outros: 'Outros',
    alimentacao: 'Alimentacao', transporte: 'Transporte', moradia: 'Moradia',
    saude: 'Saude', educacao: 'Educacao', lazer: 'Lazer', outro: 'Outros',
    entretenimento: 'Entretenimento', compras: 'Compras', vestuario: 'Vestuario',
    viagem: 'Viagem', pet: 'Pet', assinaturas: 'Assinaturas', seguros: 'Seguros',
    impostos: 'Impostos e Taxas', servicos_financeiros: 'Servicos Financeiros',
    familia: 'Familia', doacoes: 'Doacoes', beleza: 'Beleza e Cuidados'
  },

  get CATEGORIAS_RECEITA() { return this.CATEGORIAS_RECEITA_SLUGS; },
  get CATEGORIAS_DESPESA() { return this.CATEGORIAS_DESPESA_SLUGS; },

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

  _EMOJIS: {
    alimentacao: '??', transporte: '??', moradia: '??', saude: '??',
    educacao: '??', lazer: '??', outro: '??', outros: '??',
    salario: '??', freelance: '??', investimentos: '??', vendas: '??',
    reembolsos: '??', beneficios: '??', presentes: '??', aluguel_recebido: '??', premios: '??',
    assinaturas: '??', seguros: '???', impostos: '??', servicos_financeiros: '??',
    compras: '??', vestuario: '??', viagem: '??', pet: '??', familia: '??',
    doacoes: '??', beleza: '??'
  },

  get CATEGORIAS_MAP() {
    var map = {};
    var self = this;
    Object.keys(this.CATEGORIAS_LABELS).forEach(function(slug) {
      var emoji = self._EMOJIS[slug] || '??';
      map[slug] = emoji + ' ' + self.CATEGORIAS_LABELS[slug];
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
    return tipo === this.TIPO_RECEITA ? 'outros' : 'outro';
  },

  getCatLabel: function(slug) {
    return this.CATEGORIAS_LABELS[slug] || slug.charAt(0).toUpperCase() + slug.slice(1);
  },

  DEFAULT_CONFIG: {
    nome: 'Usuario',
    moeda: 'BRL',
    tema: 'light',
    ultimoExportoDados: null
  },

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
    salario: '#00723F', investimentos: '#1b5e20', vendas: '#2e7d32', reembolsos: '#546e7a',
    beneficios: '#616161', presentes: '#8d6e63', aluguel_recebido: '#2e7d32', premios: '#f9a825',
    outro: '#78909c', outros: '#78909c'
  },

  NOMES_MESES: ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}
