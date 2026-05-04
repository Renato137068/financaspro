/**
 * orcamento.js - Budget Management
 * Tier 1: Depends on config.js, dados.js, utils.js, transacoes.js
 */

const ORCAMENTO = {
  _cache: null,
  
  init() {
    this._carregarOrcamentos();
  },
  
  _carregarOrcamentos() {
    const config = DADOS.getConfig();
    this._cache = config.orcamentos || {};
  },
  
  // Definir limite para categoria
  definirLimite(categoria, limite) {
    if (limite <= 0) {
      throw new Error('Limite deve ser maior que 0');
    }
    
    this._cache[categoria] = {
      limite: parseFloat(limite),
      definidoEm: new Date().toISOString()
    };
    
    this._salvarOrcamentos();
    return this._cache[categoria];
  },
  
  // Obter limite de categoria
  obterLimite(categoria) {
    return this._cache[categoria]?.limite || null;
  },
  
  // Obter todos os limites
  obterTodos() {
    return { ...this._cache };
  },
  
  // Deletar limite
  deletarLimite(categoria) {
    delete this._cache[categoria];
    this._salvarOrcamentos();
  },
  
  // Calcular gasto no mês para categoria
  calcularGastoMês(categoria, mes, ano) {
    const transacoes = TRANSACOES.obter({ mes, ano, categoria });
    return transacoes
      .filter(t => t.tipo === CONFIG.TIPO_DESPESA)
      .reduce((sum, t) => sum + t.valor, 0);
  },
  
  // Obter status do orçamento
  obterStatus(categoria, mes, ano) {
    const limite = this.obterLimite(categoria);
    
    if (!limite) {
      return {
        categoria,
        limite: null,
        gasto: 0,
        percentual: 0,
        status: 'sem-limite'
      };
    }
    
    const gasto = this.calcularGastoMês(categoria, mes, ano);
    const percentual = (gasto / limite) * 100;
    
    let status = 'ok';
    if (percentual >= 100) {
      status = 'excedido';
    } else if (percentual >= 80) {
      status = 'alerta';
    }
    
    return {
      categoria,
      limite,
      gasto,
      percentual: Math.round(percentual),
      status,
      restante: Math.max(0, limite - gasto)
    };
  },
  
  // Obter status de todos os orçamentos
  obterStatusTodos(mes, ano) {
    const categorias = Object.keys(this._cache);
    return categorias.map(cat => this.obterStatus(cat, mes, ano));
  },
  
  _salvarOrcamentos() {
    const config = DADOS.getConfig();
    config.orcamentos = this._cache;
    DADOS.salvarConfig(config);
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ORCAMENTO;
}
