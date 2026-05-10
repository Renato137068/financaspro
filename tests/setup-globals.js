/**
 * setup-globals.js — Ambiente global para todos os testes Jest
 * Executado antes de cada test suite (jest.setupFiles)
 */

// ── localStorage mock ─────────────────────────────────────────────────────────
const _lsStore = {};
const localStorageMock = {
  getItem:    key       => Object.prototype.hasOwnProperty.call(_lsStore, key) ? _lsStore[key] : null,
  setItem:    (key, val) => { _lsStore[key] = String(val); },
  removeItem: key        => { delete _lsStore[key]; },
  clear:      ()         => { Object.keys(_lsStore).forEach(k => delete _lsStore[k]); },
};
Object.defineProperty(global, 'localStorage', { value: localStorageMock, writable: true });

// ── fetch mock ────────────────────────────────────────────────────────────────
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ data: {} }),
    text: () => Promise.resolve(''),
  })
);

// ── CONFIG global (espelha js/config.js) ─────────────────────────────────────
global.CONFIG = {
  APP_NAME: 'FinançasPro MVP',
  VERSION: '3.0.0',
  STORAGE_TRANSACOES: 'fp-transacoes',
  STORAGE_CONFIG: 'fp-config',
  STORAGE_CONTAS: 'fp-contas',
  STORAGE_APRENDIZADO: 'aprendizado_historico',
  STORAGE_RASCUNHO: '_rascunho_transacao',
  API_BASE_URL: '',
  API_FALLBACK_URL: 'http://localhost:4000',
  API_TOKEN_STORAGE: 'fp-api-token',
  API_USER_STORAGE: 'fp-api-user',
  TIPO_RECEITA: 'receita',
  TIPO_DESPESA: 'despesa',
  CATEGORIAS_RECEITA_SLUGS: ['salario', 'freelance', 'investimentos', 'vendas', 'outros'],
  CATEGORIAS_DESPESA_SLUGS: ['alimentacao', 'transporte', 'moradia', 'saude', 'educacao', 'lazer', 'outro'],
  get CATEGORIAS_RECEITA() { return this.CATEGORIAS_RECEITA_SLUGS; },
  get CATEGORIAS_DESPESA() { return this.CATEGORIAS_DESPESA_SLUGS; },
  CATEGORIAS_LABELS: {
    salario: 'Salário', freelance: 'Freelance', investimentos: 'Investimentos',
    vendas: 'Vendas', outros: 'Outros',
    alimentacao: 'Alimentação', transporte: 'Transporte', moradia: 'Moradia',
    saude: 'Saúde', educacao: 'Educação', lazer: 'Lazer', outro: 'Outro',
    entretenimento: 'Entretenimento', compras: 'Compras', vestuario: 'Vestuário',
    viagem: 'Viagem', pet: 'Pet', assinaturas: 'Assinaturas',
  },
  _EMOJIS: {
    alimentacao: '🍔', transporte: '🚗', moradia: '🏠', saude: '⚕️',
    educacao: '📚', lazer: '🎬', outro: '📌', outros: '📌',
    salario: '💼', freelance: '💻', investimentos: '📈', vendas: '🛒',
  },
  get CATEGORIAS_MAP() {
    const map = {};
    const self = this;
    Object.keys(this.CATEGORIAS_LABELS).forEach(slug => {
      map[slug] = (self._EMOJIS[slug] || '📌') + ' ' + self.CATEGORIAS_LABELS[slug];
    });
    return Object.freeze(map);
  },
  MOEDA_FORMATACAO: {
    BRL: { locale: 'pt-BR', currency: 'BRL' },
    USD: { locale: 'en-US', currency: 'USD' },
    EUR: { locale: 'de-DE', currency: 'EUR' },
  },
};
