/**
 * config.js - Application Constants and Configuration
 * Tier 0: No dependencies
 */

const CONFIG = {
  APP_NAME: 'FinançasPro MVP',
  VERSION: '3.0.0',

  // Storage keys
  STORAGE_TRANSACOES: 'fp-transacoes',
  STORAGE_CONFIG: 'fp-config',
  STORAGE_CONTAS: 'fp-contas',

  // Transaction types
  TIPO_RECEITA: 'receita',
  TIPO_DESPESA: 'despesa',

  // Categories
  CATEGORIAS_RECEITA_SLUGS: ['salario','freelance','investimentos','vendas','outros'],
  CATEGORIAS_DESPESA_SLUGS: ['alimentacao','transporte','moradia','saude','educacao','lazer','outro'],

  // Labels legíveis — para exibição ao usuário
  CATEGORIAS_LABELS: {
    salario: 'Salário', freelance: 'Freelance', investimentos: 'Investimentos',
    vendas: 'Vendas', outros: 'Outros',
    alimentacao: 'Alimentação', transporte: 'Transporte', moradia: 'Moradia',
    saude: 'Saúde', educacao: 'Educação', lazer: 'Lazer', outro: 'Outro',
    entretenimento: 'Entretenimento', compras: 'Compras', vestuario: 'Vestuário',
    viagem: 'Viagem', pet: 'Pet', assinaturas: 'Assinaturas'
  },

  // Compat legado (arrays de labels)
  CATEGORIAS_RECEITA: ['salario','freelance','investimentos','vendas','outros'],
  CATEGORIAS_DESPESA: ['alimentacao','transporte','moradia','saude','educacao','lazer','outro'],

  // Form categories with key+label (compat)
  CATS_DESPESA_FORM: [
    { v: 'alimentacao', l: '🍔 Alimentação' },
    { v: 'transporte',  l: '🚗 Transporte'  },
    { v: 'moradia',     l: '🏠 Moradia'     },
    { v: 'saude',       l: '⚕️ Saúde'       },
    { v: 'lazer',       l: '🎬 Lazer'       },
    { v: 'outro',       l: '📌 Outro'       }
  ],
  CATS_RECEITA_FORM: [
    { v: 'salario',      l: '💼 Salário'      },
    { v: 'freelance',    l: '💻 Freelance'    },
    { v: 'investimentos',l: '📈 Investimento' },
    { v: 'vendas',       l: '🛒 Venda'        },
    { v: 'outros',       l: '📌 Outro'        }
  