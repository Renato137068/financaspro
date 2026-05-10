/**
 * categories.js - Fonte única de categorias
 * Objetivo: Eliminar duplicações e centralizar sistema de categorias
 * Design: Single source of truth para todas as operações de categorias
 */

const CATEGORIES = {
  /**
   * Definição completa de categorias
   * Estrutura unificada: slug -> { label, emoji, cor, tipo }
   */
  DEFINICOES: {
    // Receitas
    salario: { label: 'Salário', emoji: '💰', cor: '#10b981', tipo: 'receita' },
    freelance: { label: 'Freelance', emoji: '💻', cor: '#6366f1', tipo: 'receita' },
    investimentos: { label: 'Investimentos', emoji: '📈', cor: '#0ea5e9', tipo: 'receita' },
    vendas: { label: 'Vendas', emoji: '🛒', cor: '#f59e0b', tipo: 'receita' },
    outros: { label: 'Outros', emoji: '📌', cor: '#94a3b8', tipo: 'receita' },
    
    // Despesas
    alimentacao: { label: 'Alimentação', emoji: '🍔', cor: '#ef4444', tipo: 'despesa' },
    transporte: { label: 'Transporte', emoji: '🚗', cor: '#8b5cf6', tipo: 'despesa' },
    moradia: { label: 'Moradia', emoji: '🏠', cor: '#14b8a6', tipo: 'despesa' },
    saude: { label: 'Saúde', emoji: '⚕️', cor: '#ec4899', tipo: 'despesa' },
    educacao: { label: 'Educação', emoji: '📚', cor: '#3b82f6', tipo: 'despesa' },
    lazer: { label: 'Lazer', emoji: '🎬', cor: '#a855f7', tipo: 'despesa' },
    outro: { label: 'Outro', emoji: '📌', cor: '#94a3b8', tipo: 'despesa' },
    
    // Despesas adicionais (mantidas para compatibilidade)
    entretenimento: { label: 'Entretenimento', emoji: '🎮', cor: '#f97316', tipo: 'despesa' },
    compras: { label: 'Compras', emoji: '🛍️', cor: '#e11d48', tipo: 'despesa' },
    vestuario: { label: 'Vestuário', emoji: '👕', cor: '#7c3aed', tipo: 'despesa' },
    viagem: { label: 'Viagem', emoji: '✈️', cor: '#0284c7', tipo: 'despesa' },
    pet: { label: 'Pet', emoji: '🐾', cor: '#84cc16', tipo: 'despesa' },
    assinaturas: { label: 'Assinaturas', emoji: '📺', cor: '#6366f1', tipo: 'despesa' },
    utilities: { label: 'Utilidades', emoji: '🏠', cor: '#06b6d4', tipo: 'despesa' }
  },

  /**
   * Cache de categorias customizadas do usuário
   */
  customCache: null,
  cacheTimestamp: null,

  /**
   * Inicializa sistema de categorias
   */
  init: function() {
    this.carregarCustomCache();
  },

  /**
   * Obtém definição de categoria por slug
   * @param {string} slug - Slug da categoria
   * @returns {Object|null} Definição da categoria
   */
  get: function(slug) {
    // Primeiro tenta nas definições padrão
    var definicao = this.DEFINICOES[slug];
    if (definicao) return definicao;

    // Depois tenta nas customizadas
    var custom = this.getCustom(slug);
    if (custom) return custom;

    // Fallback: cria definição básica
    return {
      label: this.formatarLabel(slug),
      emoji: '📌',
      cor: '#94a3b8',
      tipo: this.inferirTipo(slug)
    };
  },

  /**
   * Obtém label formatado de uma categoria
   * @param {string} slug - Slug da categoria
   * @returns {string} Label formatado
   */
  getLabel: function(slug) {
    var cat = this.get(slug);
    return cat ? cat.label : this.formatarLabel(slug);
  },

  /**
   * Obtém emoji de uma categoria
   * @param {string} slug - Slug da categoria
   * @returns {string} Emoji
   */
  getEmoji: function(slug) {
    var cat = this.get(slug);
    return cat ? cat.emoji : '📌';
  },

  /**
   * Obtém cor de uma categoria
   * @param {string} slug - Slug da categoria
   * @returns {string} Cor hexadecimal
   */
  getCor: function(slug) {
    var cat = this.get(slug);
    return cat ? cat.cor : '#94a3b8';
  },

  /**
   * Obtém tipo de uma categoria
   * @param {string} slug - Slug da categoria
   * @returns {string} Tipo ('receita' ou 'despesa')
   */
  getTipo: function(slug) {
    var cat = this.get(slug);
    return cat ? cat.tipo : this.inferirTipo(slug);
  },

  /**
   * Lista todas as categorias de um tipo
   * @param {string} tipo - Tipo ('receita' ou 'despesa')
   * @param {boolean} incluirCustom - Se deve incluir categorias customizadas
   * @returns {Array} Lista de slugs
   */
  listarPorTipo: function(tipo, incluirCustom) {
    if (incluirCustom === undefined) incluirCustom = true;

    var padroes = Object.keys(this.DEFINICOES).filter(function(slug) {
      return this.DEFINICOES[slug].tipo === tipo;
    }.bind(this));

    if (!incluirCustom) return padroes;

    var custom = this.listarCustom(tipo);
    return padroes.concat(custom);
  },

  /**
   * Lista categorias no formato para formulário
   * @param {string} tipo - Tipo ('receita' ou 'despesa')
   * @returns {Array} Lista de objetos { value, label }
   */
  listarParaForm: function(tipo) {
    var slugs = this.listarPorTipo(tipo, true);
    
    return slugs.map(function(slug) {
      var cat = this.get(slug);
      return {
        value: slug,
        label: cat.emoji + ' ' + cat.label
      };
    }.bind(this));
  },

  /**
   * Formata label a partir de slug
   * @param {string} slug - Slug
   * @returns {string} Label formatado
   */
  formatarLabel: function(slug) {
    return slug.charAt(0).toUpperCase() + slug.slice(1).replace(/_/g, ' ');
  },

  /**
   * Infere tipo da categoria baseado no slug
   * @param {string} slug - Slug
   * @returns {string} Tipo inferido
   */
  inferirTipo: function(slug) {
    var receitas = ['salario', 'freelance', 'investimentos', 'vendas', 'outros'];
    return receitas.includes(slug) ? 'receita' : 'despesa';
  },

  /**
   * Carrega cache de categorias customizadas
   */
  carregarCustomCache: function() {
    try {
      var config = DADOS.getConfig();
      this.customCache = config.categoriasCustom || {};
      this.cacheTimestamp = Date.now();
    } catch (e) {
      console.warn('Erro ao carregar categorias customizadas:', e);
      this.customCache = {};
    }
  },

  /**
   * Obtém categoria customizada
   * @param {string} slug - Slug da categoria
   * @returns {Object|null} Definição customizada
   */
  getCustom: function(slug) {
    if (!this.customCache) this.carregarCustomCache();

    for (var tipo in this.customCache) {
      if (this.customCache[tipo].includes(slug)) {
        return {
          label: slug,
          emoji: '✨',
          cor: '#fbbf24',
          tipo: tipo
        };
      }
    }
    return null;
  },

  /**
   * Lista categorias customizadas por tipo
   * @param {string} tipo - Tipo
   * @returns {Array} Lista de slugs customizados
   */
  listarCustom: function(tipo) {
    if (!this.customCache) this.carregarCustomCache();
    return this.customCache[tipo] || [];
  },

  /**
   * Adiciona categoria customizada
   * @param {string} nome - Nome da categoria
   * @param {string} tipo - Tipo ('receita' ou 'despesa')
   */
  adicionarCustom: function(nome, tipo) {
    try {
      var config = DADOS.getConfig();
      var custom = config.categoriasCustom || {};
      
      if (!custom[tipo]) custom[tipo] = [];
      
      if (!custom[tipo].includes(nome)) {
        custom[tipo].push(nome);
        DADOS.salvarConfig({ categoriasCustom: custom });
        
        // Invalidar cache
        this.customCache = null;
        
        return true;
      }
      
      return false; // Já existe
    } catch (e) {
      console.error('Erro ao adicionar categoria customizada:', e);
      return false;
    }
  },

  /**
   * Remove categoria customizada
   * @param {string} nome - Nome da categoria
   * @param {string} tipo - Tipo
   */
  removerCustom: function(nome, tipo) {
    try {
      var config = DADOS.getConfig();
      var custom = config.categoriasCustom || {};
      
      if (custom[tipo]) {
        var index = custom[tipo].indexOf(nome);
        if (index > -1) {
          custom[tipo].splice(index, 1);
          DADOS.salvarConfig({ categoriasCustom: custom });
          
          // Invalidar cache
          this.customCache = null;
          
          return true;
        }
      }
      
      return false;
    } catch (e) {
      console.error('Erro ao remover categoria customizada:', e);
      return false;
    }
  },

  /**
   * Verifica se categoria existe
   * @param {string} slug - Slug da categoria
   * @returns {boolean} Se existe
   */
  existe: function(slug) {
    return this.DEFINICOES.hasOwnProperty(slug) || this.getCustom(slug) !== null;
  },

  /**
   * Valida categoria
   * @param {string} slug - Slug da categoria
   * @param {string} tipoEsperado - Tipo esperado (opcional)
   * @returns {boolean} Se é válida
   */
  validar: function(slug, tipoEsperado) {
    var cat = this.get(slug);
    if (!cat) return false;
    
    if (tipoEsperado && cat.tipo !== tipoEsperado) return false;
    
    return true;
  },

  /**
   * Busca categorias por texto
   * @param {string} texto - Texto de busca
   * @param {string} tipo - Tipo para filtrar (opcional)
   * @returns {Array} Resultados ordenados por relevância
   */
  buscar: function(texto, tipo) {
    var termo = texto.toLowerCase();
    var resultados = [];
    
    var slugs = tipo ? this.listarPorTipo(tipo, true) : Object.keys(this.DEFINICOES);
    
    slugs.forEach(function(slug) {
      var cat = this.get(slug);
      var score = 0;
      
      // Score por match exato no slug
      if (slug === termo) score += 100;
      else if (slug.includes(termo)) score += 50;
      
      // Score por match no label
      var label = cat.label.toLowerCase();
      if (label === termo) score += 80;
      else if (label.includes(termo)) score += 40;
      
      if (score > 0) {
        resultados.push({ slug: slug, score: score, categoria: cat });
      }
    }.bind(this));
    
    // Ordenar por score (maior primeiro)
    resultados.sort(function(a, b) { return b.score - a.score; });
    
    return resultados.slice(0, 10); // Limitar a 10 resultados
  },

  /**
   * Obtém estatísticas das categorias
   * @param {string} tipo - Tipo (opcional)
   * @returns {Object} Estatísticas
   */
  getEstatisticas: function(tipo) {
    var slugs = tipo ? this.listarPorTipo(tipo, true) : Object.keys(this.DEFINICOES);
    
    return {
      total: slugs.length,
      padroes: slugs.filter(function(slug) { return this.DEFINICOES.hasOwnProperty(slug); }.bind(this)).length,
      customizadas: slugs.filter(function(slug) { return !this.DEFINICOES.hasOwnProperty(slug); }.bind(this)).length
    };
  },

  /**
   * Limpa cache de categorias customizadas
   */
  limparCache: function() {
    this.customCache = null;
    this.cacheTimestamp = null;
  },

  /**
   * Compatibilidade com CONFIG antigo
   * TODO: Remover após migração completa
   */
  compat: {
    /**
     * Obtém labels no formato antigo
     */
    getLabels: function() {
      var labels = {};
      Object.keys(CATEGORIES.DEFINICOES).forEach(function(slug) {
        labels[slug] = CATEGORIES.DEFINICOES[slug].label;
      });
      return labels;
    },

    /**
     * Obtém slugs por tipo no formato antigo
     */
    getSlugsPorTipo: function(tipo) {
      return CATEGORIES.listarPorTipo(tipo, false);
    },

    /**
     * Obtém categorias para formulário no formato antigo
     */
    getCatsForm: function(tipo) {
      var slugs = CATEGORIES.listarPorTipo(tipo, false);
      return slugs.map(function(slug) {
        var cat = CATEGORIES.get(slug);
        return {
          v: slug,
          l: cat.emoji + ' ' + cat.label
        };
      });
    }
  }
};

// Export para compatibilidade
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CATEGORIES;
}
