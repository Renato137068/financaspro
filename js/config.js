/**
 * config.js - Application Constants and Configuration
 * Tier 0: No dependencies
 */

const CONFIG = {
  APP_NAME: 'FinançasPro MVP',
  VERSION: '1.0.0',
  
  // Storage keys
  STORAGE_TRANSACOES: 'fp-transacoes',
  STORAGE_CONFIG: 'fp-config',
  
  // Transaction types
  TIPO_RECEITA: 'receita',
  TIPO_DESPESA: 'despesa',
  
  // Categories
  CATEGORIAS_RECEITA: [
    'Salário',
    'Freelance',
    'Investimentos',
    'Vendas',
    'Outros'
  ],
  
  CATEGORIAS_DESPESA: [
    'Alimentação',
    'Transporte',
    'Utilities',
    'Saúde',
    'Educação',
    'Entretenimento',
    'Outros'
  ],
  
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
    EUR: { locale: 'pt-PT', currency: 'EUR' }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}
