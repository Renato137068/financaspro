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

  /**
   * Normaliza e valida os campos comuns a criar e editar. Devolve
   * { nome, valor, dia } já limpos ou lança a mensagem de erro correspondente.
   * Centralizar evita que as duas entradas divirjam na regra de validação.
   */
  _validar: function(dados) {
    var nome = (dados.nome || '').trim();
    var valor = UTILS.parseMoeda(dados.valor);
    var dia = parseInt(dados.diaCobranca, 10);
    if (!nome) throw new Error('Informe o nome da assinatura');
    if (!valor || valor <= 0) throw new Error('Valor inválido');
    if (!dia || dia < 1 || dia > 31) throw new Error('Dia de cobrança inválido');
    return { nome: nome, valor: valor, dia: dia };
  },

  criar: function(dados) {
    if (typeof BILLING !== 'undefined' && !BILLING.guardQuota('subscription', 1)) {
      var errAss = new Error('Limite de gastos fixos do plano gratuito');
      errAss.code = 'quota';
      throw errAss;
    }
    var v = this._validar(dados);

    var item = {
      id: UTILS.gerarId(),
      nome: v.nome,
      valor: v.valor,
      diaCobranca: v.dia,
      ativa: true,
      icone: dados.icone || 'tv',
      criadoEm: new Date().toISOString()
    };
    var lista = this.listar();
    lista.push(item);
    this._salvar(lista);
    return item;
  },

  /**
   * Edita nome, valor e dia de cobrança de uma assinatura existente.
   * Preserva id, estado (ativa), ícone e criadoEm — por isso não passa por
   * `criar`: recriar do zero perderia o histórico e consumiria a cota do plano
   * de novo. Preço de serviço de streaming muda o tempo todo; sem edição, o
   * usuário teria de excluir e recadastrar a cada reajuste.
   */
  editar: function(id, dados) {
    var lista = this.listar();
    var idx = -1;
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].id === id) { idx = i; break; }
    }
    if (idx === -1) throw new Error('Assinatura não encontrada');

    var v = this._validar(dados);
    lista[idx] = Object.assign({}, lista[idx], { nome: v.nome, valor: v.valor, diaCobranca: v.dia });
    this._salvar(lista);
    return lista[idx];
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

  /**
   * Dias até a próxima cobrança. 0 = hoje.
   * Tinha o mesmo erro de um dia de contas-pagar; agora ambos usam o mesmo
   * helper, então uma correção vale para os dois.
   */
  diasAteCobranca: function(item) {
    return UTILS.diasAte(this.proximaCobranca(item));
  },

  totalMensal: function() {
    // Soma em centavos inteiros e só então volta a reais, como Resumo,
    // Orçamento e Extrato. Somar floats direto acumula erro de arredondamento
    // e faz o total divergir por um centavo do que o usuário confere na mão.
    var totalCent = this.listar(true).reduce(function(s, a) {
      return s + UTILS.paraCentavos(a.valor);
    }, 0);
    return totalCent / 100;
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
      // >= 2: uma cobrança isolada não é assinatura. A guarda antiga (>= 1) era
      // sempre verdadeira — bastava aparecer uma vez para virar sugestão, o que
      // contradiz a própria premissa de "despesa recorrente" e enche a lista de
      // ruído. Só o que se repetiu no extrato é oferecido.
      if (map[k].count >= 2 && existentes.indexOf(k) === -1) {
        sugestoes.push({ nome: map[k].nome, valor: map[k].valor });
      }
    });
    return sugestoes.slice(0, 5);
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ASSINATURAS;
}
