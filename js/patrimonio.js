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
    var valor = UTILS.parseMoedaEstrita(dados.valor);
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
      var v = UTILS.parseMoedaEstrita(patch.valor);
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
    var valor = UTILS.parseMoedaEstrita(dados.valor);
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
      var v = UTILS.parseMoedaEstrita(patch.valor);
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
    var valores = this.listarAtivos().map(function(a) { return a.valor || 0; });
    return typeof UTILS !== 'undefined' && UTILS.somarMoeda
      ? UTILS.somarMoeda(valores)
      : valores.reduce(function(s, v) { return s + v; }, 0);
  },

  totalDividas: function() {
    var valores = this.listarDividas().map(function(d) { return d.valor || 0; });
    return typeof UTILS !== 'undefined' && UTILS.somarMoeda
      ? UTILS.somarMoeda(valores)
      : valores.reduce(function(s, v) { return s + v; }, 0);
  },

  patrimonioLiquido: function() {
    if (typeof UTILS !== 'undefined' && UTILS.somarMoeda) {
      return UTILS.somarMoeda([this.totalAtivos(), -this.totalDividas()]);
    }
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
    var saldoPorNome = {};
    if (CONTAS.saldos) {
      CONTAS.saldos().forEach(function(s) {
        if (!s || s.semConta) return;
        var chave = CONTAS._chaveConta ? CONTAS._chaveConta(s.nome) : String(s.nome || '').trim();
        if (chave) saldoPorNome[chave] = s.saldo;
      });
    }
    return CONTAS.getAll().filter(function(c) { return c && c.id && !vinculados[c.id]; }).map(function(c) {
      var chave = CONTAS._chaveConta ? CONTAS._chaveConta(c.nome) : String(c.nome || '').trim();
      return {
        contaId: c.id,
        nome: c.nome,
        tipo: mapTipo[c.tipo] || 'corrente',
        saldoLedger: Object.prototype.hasOwnProperty.call(saldoPorNome, chave)
          ? saldoPorNome[chave]
          : null
      };
    });
  },

  reconciliarContas: function() {
    var vazios = {
      overlaps: [],
      totalSobreposto: 0,
      saldoLedger: 0,
      liquido: this.patrimonioLiquido(),
      liquidoSemSobreposicao: this.patrimonioLiquido()
    };
    if (typeof CONTAS === 'undefined' || !CONTAS.saldos) return vazios;

    var saldos = CONTAS.saldos();
    var saldoPorNome = {};
    var saldoPorId = {};
    var saldoLedgerCent = 0;
    saldos.forEach(function(s) {
      if (!s || s.semConta) return;
      var chave = CONTAS._chaveConta ? CONTAS._chaveConta(s.nome) : String(s.nome || '').trim();
      if (chave) saldoPorNome[chave] = s.saldo;
      saldoLedgerCent += UTILS.paraCentavos(s.saldo);
    });
    if (CONTAS.getAll) {
      CONTAS.getAll().forEach(function(c) {
        if (!c || !c.id) return;
        var chave = CONTAS._chaveConta ? CONTAS._chaveConta(c.nome) : String(c.nome || '').trim();
        if (chave && Object.prototype.hasOwnProperty.call(saldoPorNome, chave)) {
          saldoPorId[c.id] = saldoPorNome[chave];
        }
      });
    }

    var tiposCaixa = { corrente: true, poupanca: true };
    var overlaps = [];
    var sobrepostoCent = 0;
    this.listarAtivos().forEach(function(a) {
      if (!a) return;
      var ledger = null;
      var motivo = null;
      if (a.contaId && Object.prototype.hasOwnProperty.call(saldoPorId, a.contaId)) {
        ledger = saldoPorId[a.contaId];
        motivo = 'contaId';
      } else if (tiposCaixa[a.tipo]) {
        var chave = CONTAS._chaveConta ? CONTAS._chaveConta(a.nome) : String(a.nome || '').trim();
        if (chave && Object.prototype.hasOwnProperty.call(saldoPorNome, chave)) {
          ledger = saldoPorNome[chave];
          motivo = 'nome';
        }
      }
      if (ledger == null) return;
      var valorAtivo = Number(a.valor) || 0;
      overlaps.push({
        ativoId: a.id,
        nome: a.nome,
        tipo: a.tipo,
        contaId: a.contaId || null,
        valorAtivo: valorAtivo,
        saldoLedger: ledger,
        delta: valorAtivo - ledger,
        motivo: motivo
      });
      sobrepostoCent += UTILS.paraCentavos(valorAtivo);
    });

    var totalSobreposto = sobrepostoCent / 100;
    var liquido = this.patrimonioLiquido();
    return {
      overlaps: overlaps,
      totalSobreposto: totalSobreposto,
      saldoLedger: saldoLedgerCent / 100,
      liquido: liquido,
      liquidoSemSobreposicao: UTILS.somarMoeda
        ? UTILS.somarMoeda([liquido, -totalSobreposto])
        : liquido - totalSobreposto
    };
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PATRIMONIO;
}
