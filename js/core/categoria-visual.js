/**
 * categoria-visual.js — ícone e cor de cada categoria.
 *
 * Morava dentro de INIT_EXTRATO, mas Orçamento, o dashboard e os wrappers
 * globais (getCatIcon/getCatCor) também desenham categorias. Com o Extrato
 * carregado sob demanda (chunk 'extrato'), quem desenhasse antes de abrir o
 * Extrato ficava sem ícone. Aqui fica no bundle principal, disponível sempre.
 */
const CATEGORIA_VISUAL = {
  ICONES: {
    'salario': 'wallet', 'freelance': 'laptop', 'investimentos': 'trending-up', 'vendas': 'shopping-cart',
    'alimentacao': 'utensils', 'transporte': 'car', 'utilities': 'zap', 'moradia': 'home',
    'saude': 'pill', 'educacao': 'book-open', 'entretenimento': 'gamepad-2', 'lazer': 'film',
    'compras': 'shopping-bag', 'vestuario': 'shirt', 'viagem': 'plane', 'pet': 'paw',
    'assinaturas': 'tv', 'outro': 'pin', 'outros': 'pin',
    /* Labels com acento (fallback) */
    'Salário': 'wallet', 'Alimentação': 'utensils', 'Transporte': 'car', 'Saúde': 'pill',
    'Educação': 'book-open', 'Moradia': 'home', 'Lazer': 'film', 'Freelance': 'laptop',
    'Investimentos': 'trending-up', 'Vendas': 'shopping-cart', 'Entretenimento': 'gamepad-2', 'Outros': 'pin',
    'Utilidades': 'zap'
  },

  CORES: {
    'salario': '#2f9c6d', 'freelance': '#6366f1', 'investimentos': '#0ea5e9', 'vendas': '#c98a1e',
    'alimentacao': '#c9573a', 'transporte': '#8b5cf6', 'utilities': '#06b6d4', 'moradia': '#14b8a6',
    'saude': '#ec4899', 'educacao': '#3c86a8', 'entretenimento': '#f97316', 'lazer': '#a855f7',
    'compras': '#e11d48', 'vestuario': '#7c3aed', 'viagem': '#0284c7', 'pet': '#84cc16',
    'assinaturas': '#6366f1', 'outro': '#98a39d', 'outros': '#98a39d',
    'Salário': '#2f9c6d', 'Alimentação': '#c9573a', 'Transporte': '#8b5cf6', 'Saúde': '#ec4899',
    'Educação': '#3c86a8', 'Moradia': '#14b8a6', 'Lazer': '#a855f7', 'Freelance': '#6366f1',
    'Investimentos': '#0ea5e9', 'Vendas': '#c98a1e', 'Entretenimento': '#f97316', 'Outros': '#98a39d'
  },

  COR_PADRAO: '#98a39d',

  /** Nome do ícone lucide da categoria ('pin' quando desconhecida). */
  nomeIcone: function(cat) {
    var c = cat == null ? '' : String(cat);
    return CATEGORIA_VISUAL.ICONES[c] || CATEGORIA_VISUAL.ICONES[c.toLowerCase()] || 'pin';
  },

  /** HTML do ícone da categoria. */
  icone: function(cat) {
    var nome = CATEGORIA_VISUAL.nomeIcone(cat);
    if (typeof lucideIconHtml === 'function') return lucideIconHtml(nome);
    return '<i data-lucide="' + nome + '" aria-hidden="true"></i>';
  },

  /** Cor (hex) da categoria. */
  cor: function(cat) {
    var c = cat == null ? '' : String(cat);
    return CATEGORIA_VISUAL.CORES[c] || CATEGORIA_VISUAL.CORES[c.toLowerCase()] || CATEGORIA_VISUAL.COR_PADRAO;
  }
};

export { CATEGORIA_VISUAL };
export default CATEGORIA_VISUAL;
