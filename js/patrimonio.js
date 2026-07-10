/**
 * patrimonio.js — Patrimônio líquido (ativos manuais − dívidas)
 */
const PATRIMONIO = {
  TIPOS_ATIVO: ['corrente', 'poupanca', 'investimento', 'imovel', 'veiculo', 'outro'],
  TIPOS_DIVIDA: ['emprestimo', 'financiamento', 'cartao', 'outro'],

  init: function() {
    var config = DADOS.getConfig();
    if (!config.patrimonio) {
      DADOS.salvarConfig({ patrimonio: { ativos: [], dividas: [] } });
    }
  },

  _dados: function() {
    var p = DADOS.getConfig().patrimonio;
    if (!p || typeof p !== 'object') return { ativos: [], dividas: [] };
    return {
      ativos: (p.ativos || []).slice(),
      dividas: (p.dividas || []).slice()
    };
  },

  _salvar: function(patch) {
    var atual = this._dados();
    DADOS.salvarConfig({
      patrimonio: Object.assign({}, atual, patch)
    });
  },

  listarAtivos: function() {
    return this._dados().ativos;
  },

  listarDividas: function() {
    return this._dados().dividas;
  },

  obterAtivo: function(id) {
    return this.listarAtivos().filter(function(a) { return a.id === id; })[0] || null;
  },

  obterDivida: function(id) {
    return this.listarDividas().filter(function(d) { return d.id === id; })[0] || null;
  },

  criarAtivo: function(dados) {
    var nome = (dados.nome || '').trim();
    var valor = parseFloat(dados.valor);
    var tipo = dados.tipo || 'corrente';
    if (!nome) throw new Error('Informe o nome do ativo');
    if (isNaN(valor) || valor < 0) throw new Error('Valor inválido');
    if (this.TIPOS_ATIVO.indexOf(tipo) === -1) tipo = 'outro';

    var item = {
      id: UTILS.gerarId(),
      nome: nome,
      tipo: tipo,
      valor: valor,
      contaId: dados.contaId || null,
      criadoEm: new Date().toISOString()
    };
    var ativos = this.listarAtivos();
    ativos.push(item);
    this._salvar({ ativos: ativos });
    return item;
  },

  atualizarAtivo: function(id, patch) {
    var ativos = this.listarAtivos();
    var idx = -1;
    for (var i = 0; i < ativos.length; i++) {
      if (ativos[i].id === id) { idx = i; break; }
    }
    if (idx === -1) throw new Error('Ativo não encontrado');
    ativos[idx] = Object.assign({}, ativos[idx], patch);
    if (patch.valor !== undefined) {
      var v = parseFloat(patch.valor);
      if (isNaN(v) || v < 0) throw new Error('Valor inválido');
      ativos[idx].valor = v;
    }
    this._salvar({ ativos: ativos });
    return ativos[idx];
  },

  excluirAtivo: function(id) {
    this._salvar({ ativos: this.listarAtivos().filter(function(a) { return a.id !== id; }) });
  },

  criarDivida: function(dados) {
    var nome = (dados.nome || '').trim();
    var valor = parseFloat(dados.valor);
    var tipo = dados.tipo || 'emprestimo';
    if (!nome) throw new Error('Informe o nome da dívida');
    if (!valor || valor <= 0) throw new Error('Valor inválido');
    if (this.TIPOS_DIVIDA.indexOf(tipo) === -1) tipo = 'outro';

    var item = {
      id: UTILS.gerarId(),
      nome: nome,
      tipo: tipo,
      valor: valor,
      criadoEm: new Date().toISOString()
    };
    var dividas = this.listarDividas();
    dividas.push(item);
    this._salvar({ dividas: dividas });
    return item;
  },

  atualizarDivida: function(id, patch) {
    var dividas = this.listarDividas();
    var idx = -1;
    for (var i = 0; i < dividas.length; i++) {
      if (dividas[i].id === id) { idx = i; break; }
    }
    if (idx === -1) throw new Error('Dívida não encontrada');
    dividas[idx] = Object.assign({}, dividas[idx], patch);
    if (patch.valor !== undefined) {
      var v = parseFloat(patch.valor);
      if (!v || v <= 0) throw new Error('Valor inválido');
      dividas[idx].valor = v;
    }
    this._salvar({ dividas: dividas });
    return dividas[idx];
  },

  excluirDivida: function(id) {
    this._salvar({ dividas: this.listarDividas().filter(function(d) { return d.id !== id; }) });
  },

  totalAtivos: function() {
    return this.listarAtivos().reduce(function(s, a) { return s + (a.valor || 0); }, 0);
  },

  totalDividas: function() {
    return this.listarDividas().reduce(function(s, d) { return s + (d.valor || 0); }, 0);
  },

  patrimonioLiquido: function() {
    return this.totalAtivos() - this.totalDividas();
  },

  tipoAtivoLabel: function(tipo) {
    var map = {
      corrente: 'Conta corrente',
      poupanca: 'Poupança',
      investimento: 'Investimentos',
      imovel: 'Imóvel',
      veiculo: 'Veículo',
      outro: 'Outro'
    };
    return map[tipo] || 'Outro';
  },

  tipoDividaLabel: function(tipo) {
    var map = {
      emprestimo: 'Empréstimo',
      financiamento: 'Financiamento',
      cartao: 'Cartão / rotativo',
      outro: 'Outra dívida'
    };
    return map[tipo] || 'Outra dívida';
  },

  iconeAtivo: function(tipo) {
    var map = {
      corrente: 'landmark', poupanca: 'piggy-bank', investimento: 'trending-up',
      imovel: 'home', veiculo: 'car', outro: 'wallet'
    };
    return map[tipo] || 'wallet';
  },

  iconeDivida: function(tipo) {
    var map = {
      emprestimo: 'banknote', financiamento: 'file-text', cartao: 'credit-card', outro: 'alert-circle'
    };
    return map[tipo] || 'alert-circle';
  },

  /** Sugere ativos a partir de contas já cadastradas no app */
  sugerirDeContas: function() {
    if (typeof CONTAS === 'undefined') return [];
    var vinculados = {};
    this.listarAtivos().forEach(function(a) {
      if (a.contaId) vinculados[a.contaId] = true;
    });
    var mapTipo = {
      corrente: 'corrente', poupanca: 'poupanca', digital: 'corrente',
      carteira: 'outro', credito: 'outro', debito: 'corrente'
    };
    return CONTAS.getAll().filter(function(c) { return !vinculados[c.id]; }).map(function(c) {
      return { contaId: c.id, nome: c.nome, tipo: mapTipo[c.tipo] || 'corrente' };
    });
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PATRIMONIO;
}
