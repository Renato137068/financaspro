/**
 * assinaturas.js — Rastreador de assinaturas mensais
 */
const ASSINATURAS = {
  init: function() {
    var config = DADOS.getConfig();
    if (!config.assinaturas) DADOS.salvarConfig({ assinaturas: [] });
  },

  listar: function(apenasAtivas) {
    var lista = (DADOS.getConfig().assinaturas || []).slice();
    if (!apenasAtivas) return lista;
    return lista.filter(function(a) { return a.ativa !== false; });
  },

  obter: function(id) {
    var found = null;
    this.listar().forEach(function(a) { if (a.id === id) found = a; });
    return found;
  },

  _salvar: function(lista) {
    DADOS.salvarConfig({ assinaturas: lista });
  },

  criar: function(dados) {
    var nome = (dados.nome || '').trim();
    var valor = parseFloat(dados.valor);
    var dia = parseInt(dados.diaCobranca, 10);
    if (!nome) throw new Error('Informe o nome da assinatura');
    if (!valor || valor <= 0) throw new Error('Valor inválido');
    if (!dia || dia < 1 || dia > 31) throw new Error('Dia de cobrança inválido');

    var item = {
      id: UTILS.gerarId(),
      nome: nome,
      valor: valor,
      diaCobranca: dia,
      ativa: true,
      icone: dados.icone || 'tv',
      criadoEm: new Date().toISOString()
    };
    var lista = this.listar();
    lista.push(item);
    this._salvar(lista);
    return item;
  },

  excluir: function(id) {
    this._salvar(this.listar().filter(function(a) { return a.id !== id; }));
  },

  toggleAtiva: function(id) {
    var lista = this.listar();
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].id === id) {
        lista[i] = Object.assign({}, lista[i], { ativa: !lista[i].ativa });
        break;
      }
    }
    this._salvar(lista);
  },

  proximaCobranca: function(item) {
    var hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    var ano = hoje.getFullYear();
    var mes = hoje.getMonth();
    var dia = Math.min(item.diaCobranca, new Date(ano, mes + 1, 0).getDate());
    var prox = new Date(ano, mes, dia);
    if (prox < hoje) prox = new Date(ano, mes + 1, Math.min(item.diaCobranca, new Date(ano, mes + 2, 0).getDate()));
    return [
      prox.getFullYear(),
      String(prox.getMonth() + 1).padStart(2, '0'),
      String(prox.getDate()).padStart(2, '0')
    ].join('-');
  },

  diasAteCobranca: function(item) {
    var hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    var prox = new Date(this.proximaCobranca(item) + 'T12:00:00');
    return Math.ceil((prox - hoje) / 86400000);
  },

  totalMensal: function() {
    return this.listar(true).reduce(function(s, a) { return s + a.valor; }, 0);
  },

  totalAnual: function() {
    return this.totalMensal() * 12;
  },

  /** Sugere assinaturas a partir de despesas recorrentes no extrato */
  sugerirDoExtrato: function() {
    if (typeof TRANSACOES === 'undefined') return [];
    var txs = TRANSACOES.obter({}).filter(function(t) {
      return t.tipo === CONFIG.TIPO_DESPESA &&
        (t.categoria === 'assinaturas' || (t.descricao && /netflix|spotify|prime|hbo|disney|icloud|adobe|youtube/i.test(t.descricao)));
    });
    var map = {};
    txs.forEach(function(t) {
      var key = (t.descricao || '').trim().toLowerCase();
      if (!key || key.length < 3) return;
      if (!map[key]) map[key] = { nome: t.descricao.trim(), valor: t.valor, count: 0 };
      map[key].count++;
      map[key].valor = t.valor;
    });
    var existentes = this.listar().map(function(a) { return a.nome.toLowerCase(); });
    var sugestoes = [];
    Object.keys(map).forEach(function(k) {
      if (map[k].count >= 1 && existentes.indexOf(k) === -1) {
        sugestoes.push({ nome: map[k].nome, valor: map[k].valor });
      }
    });
    return sugestoes.slice(0, 5);
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ASSINATURAS;
}
