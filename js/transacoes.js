/**
 * @file transacoes.js — Transaction Management
 * @module TRANSACOES
 * Tier 1. Depende de: config.js, dados.js, utils.js
 */

/**
 * @typedef {Object} ResumoMes
 * @property {number} receitas
 * @property {number} despesas
 * @property {number} saldo
 * @property {number} total
 */

/**
 * @typedef {Object} FiltroTransacao
 * @property {number} [mes] — 1-12
 * @property {number} [ano]
 * @property {'receita'|'despesa'} [tipo]
 * @property {string} [categoria]
 * @property {'data-asc'|'data-desc'} [ordenarPor]
 */

var TRANSACOES = {
  _cache: null,
  _cacheTimestamp: null,
  _cacheTTL: 30000, // 30 segundos
  _monthIndex: null,

  /**
   * Inicializa cache de transações a partir do localStorage.
   */
  init: function() {
    this._cache = DADOS.getTransacoes();
    this._cacheTimestamp = Date.now();
    if (typeof APP_STATE !== 'undefined') {
      APP_STATE.setState({ transacoes: this._cache });
    }
  },

  /**
   * Verifica se o cache expirou
   */
  _isCacheExpired: function() {
    return !this._cacheTimestamp || (Date.now() - this._cacheTimestamp) > this._cacheTTL;
  },

  /**
   * Atualiza cache se necessário
   */
  _refreshCache: function() {
    if (this._isCacheExpired()) {
      this._cache = DADOS.getTransacoes();
      this._cacheTimestamp = Date.now();
      if (typeof APP_STATE !== 'undefined') {
        APP_STATE.setState({ transacoes: this._cache });
      }
    }
  },

  /**
   * Invalida cache forçadamente
   */
  invalidateCache: function() {
    this._cacheTimestamp = null;
    this._monthIndex = null;
    this._refreshCache();
  },

  /** Índice ano-mês → transações; reconstruído quando o cache muda. */
  _ensureMonthIndex: function() {
    if (this._monthIndex) return this._monthIndex;
    if (typeof TRANSACTION_SERVICE !== 'undefined' && TRANSACTION_SERVICE.buildMonthIndex) {
      this._monthIndex = TRANSACTION_SERVICE.buildMonthIndex(this._cache || []);
    }
    return this._monthIndex;
  },

  /**
   * Sanitiza texto de entrada do usuário antes de persistir.
   * @param {string} [desc]
   * @returns {string}
   */
  _sanitizarDescricao: function(desc) {
    if (!desc) return '';
    if (typeof VALIDATIONS !== 'undefined' && typeof VALIDATIONS.sanitizarTexto === 'function') {
      return VALIDATIONS.sanitizarTexto(desc);
    }
    if (typeof UTILS !== 'undefined' && typeof UTILS.escapeHtml === 'function') {
      return UTILS.escapeHtml(String(desc).trim());
    }
    return String(desc).trim();
  },

  /**
   * Cria nova transação com validação.
   * @param {'receita'|'despesa'} tipo
   * @param {number|string} valor
   * @param {string} categoria
   * @param {string} data — YYYY-MM-DD
   * @param {string} [descricao]
   * @param {string} [banco]
   * @param {string} [cartao]
   * @returns {Transacao}
   * @throws {Error} se inválida
   */
  criar: function(tipo, valor, categoria, data, descricao, banco, cartao, opts) {
    opts = opts || {};
    descricao = this._sanitizarDescricao(descricao);
    if (typeof CONFIG !== 'undefined' && typeof CONFIG.normalizeCategoriaFinal === 'function') {
      categoria = CONFIG.normalizeCategoriaFinal(categoria, tipo);
    }
    var bancoNome = banco ? String(banco).trim() : '';
    var accountId = opts.accountId || null;
    var contasRef = (typeof DADOS !== 'undefined' && DADOS.getContas) ? DADOS.getContas() : [];
    if (!accountId && bancoNome && typeof FINANCE_CONTRACT !== 'undefined') {
      accountId = FINANCE_CONTRACT.resolveAccountId(bancoNome, contasRef);
    }
    if (accountId && !bancoNome && typeof FINANCE_CONTRACT !== 'undefined') {
      bancoNome = FINANCE_CONTRACT.accountLabel(accountId, contasRef) || '';
    }
    var transacao = typeof TRANSACTION_SERVICE !== 'undefined'
      ? TRANSACTION_SERVICE.createTransaction({
        tipo: tipo,
        valor: valor,
        categoria: categoria,
        data: data,
        descricao: descricao,
        banco: bancoNome,
        cartao: cartao,
        accountId: accountId || undefined,
        id: opts.id
      }, { idFactory: UTILS.gerarId })
      : (function() {
        var validacao = UTILS.validarTransacao({
          tipo: tipo, valor: parseFloat(valor), categoria: categoria, data: data
        });
        if (!validacao.valido) throw new Error(validacao.erro);
        return {
          id: opts.id || UTILS.gerarId(),
          tipo: tipo,
          valor: parseFloat(valor),
          categoria: categoria,
          data: data,
          descricao: descricao || '',
          banco: banco || '',
          cartao: cartao || '',
          dataCriacao: new Date().toISOString()
        };
      })();
    if (opts.clientKey) transacao.clientKey = opts.clientKey;
    DADOS.salvarTransacao(transacao);
    this._cache = DADOS.getTransacoes();
    this._monthIndex = null;
    if (typeof APP_STATE !== 'undefined') APP_STATE.setState({ transacoes: this._cache });
    return transacao;
  },

  /**
   * Registra uma movimentação entre contas do próprio usuário.
   *
   * Um registro só, com origem (`banco`) e destino (`contaDestino`) — não um
   * par receita+despesa. O par parece equivalente e não é: além de inflar
   * receitas e despesas do mês, ele se desfaz quando alguém edita ou apaga
   * apenas uma das pontas, e o saldo passa a mentir sem nenhum sinal.
   *
   * @param {{valor:number|string, data:string, origem:string,
   *          destino:string, descricao?:string}} dados
   * @returns {Object} a transação criada
   */
  criarTransferencia: function(dados) {
    dados = dados || {};
    var origem = UTILS.nomeDeConta(dados.origem);
    var destino = UTILS.nomeDeConta(dados.destino);
    var valor = UTILS.parseMoeda(dados.valor);

    if (!origem) throw new Error('Informe a conta de origem');
    if (!destino) throw new Error('Informe a conta de destino');
    if (origem.toLowerCase() === destino.toLowerCase()) {
      throw new Error('Origem e destino não podem ser a mesma conta');
    }
    if (!valor || valor <= 0) throw new Error('Valor deve ser maior que 0');
    if (!dados.data) throw new Error('Data obrigatória');

    var contasRef = (typeof DADOS !== 'undefined' && DADOS.getContas) ? DADOS.getContas() : [];
    var accountId = dados.accountId || null;
    var contaDestinoId = dados.contaDestinoId || null;
    if (typeof FINANCE_CONTRACT !== 'undefined') {
      if (!accountId) accountId = FINANCE_CONTRACT.resolveAccountId(origem, contasRef);
      if (!contaDestinoId) contaDestinoId = FINANCE_CONTRACT.resolveAccountId(destino, contasRef);
    }

    var transacao = {
      id: UTILS.gerarId(),
      tipo: CONFIG.TIPO_TRANSFERENCIA,
      valor: valor,
      categoria: CONFIG.TIPO_TRANSFERENCIA,
      data: dados.data,
      descricao: this._sanitizarDescricao(dados.descricao)
        || ('Transferência: ' + origem + ' → ' + destino),
      banco: origem,
      contaDestino: destino,
      accountId: accountId || undefined,
      contaDestinoId: contaDestinoId || undefined,
      cartao: '',
      dataCriacao: new Date().toISOString()
    };

    DADOS.salvarTransacao(transacao);
    this._cache = DADOS.getTransacoes();
    this._monthIndex = null;
    if (typeof APP_STATE !== 'undefined') APP_STATE.setState({ transacoes: this._cache });
    return transacao;
  },

  /**
   * Filtra cache de transações.
   * @param {FiltroTransacao} [filtros]
   * @returns {Transacao[]}
   */
  obter: function(filtros) {
    this._refreshCache();
    filtros = filtros || {};
    if (typeof TRANSACTION_SERVICE !== 'undefined') {
      if (filtros.mes && filtros.ano && !filtros.monthIndex) {
        filtros = Object.assign({}, filtros, { monthIndex: this._ensureMonthIndex() });
      }
      return TRANSACTION_SERVICE.filterTransactions(this._cache || [], filtros);
    }
    var resultado = this._cache.slice();

    if (filtros.mes && filtros.ano) {
      resultado = UTILS.filtrarPorMes(resultado, filtros.mes, filtros.ano);
    }
    if (filtros.tipo) {
      resultado = UTILS.filtrarPorTipo(resultado, filtros.tipo);
    }
    if (filtros.categoria) {
      resultado = resultado.filter(function(t) { return t.categoria === filtros.categoria; });
    }
    if (filtros.ordenarPor === 'data-asc') {
      resultado.sort(function(a, b) { return new Date(a.data) - new Date(b.data); });
    } else {
      resultado.sort(function(a, b) { return new Date(b.data) - new Date(a.data); });
    }
    return resultado;
  },

  /**
   * Últimas N transações por data, sem varrer/sortear o histórico inteiro
   * quando TRANSACTION_SERVICE.topByDate está disponível.
   * @param {number} [limite]
   * @param {{ordenarPor?:string}} [opts]
   */
  obterRecentes: function(limite, opts) {
    limite = limite || 3;
    opts = opts || {};
    this._refreshCache();
    var cache = this._cache || [];
    if (typeof TRANSACTION_SERVICE !== 'undefined' && TRANSACTION_SERVICE.topByDate) {
      return TRANSACTION_SERVICE.topByDate(cache, limite, opts.ordenarPor || 'data-desc');
    }
    var ordenar = opts.ordenarPor === 'data-asc' ? 'data-asc' : 'data-desc';
    var copy = cache.slice();
    copy.sort(function(a, b) {
      var da = String(a.data || '').slice(0, 10);
      var db = String(b.data || '').slice(0, 10);
      if (da === db) return 0;
      if (ordenar === 'data-asc') return da < db ? -1 : 1;
      return da > db ? -1 : 1;
    });
    return copy.slice(0, limite);
  },

  obterPorId: function(id) {
    for (var i = 0; i < this._cache.length; i++) {
      if (this._cache[i].id === id) return this._cache[i];
    }
    return null;
  },

  atualizar: function(id, updates) {
    var transacao = this.obterPorId(id);
    if (!transacao) throw new Error('Transacao nao encontrada');
    if (updates && updates.descricao != null) {
      updates = Object.assign({}, updates, { descricao: this._sanitizarDescricao(updates.descricao) });
    }
    var updated = Object.assign({}, transacao, updates);
    if (updates && (updates.banco != null || updates.accountId != null)) {
      var contasRef = (typeof DADOS !== 'undefined' && DADOS.getContas) ? DADOS.getContas() : [];
      if (typeof FINANCE_CONTRACT !== 'undefined') {
        if (updates.accountId) {
          updated.accountId = updates.accountId;
          if (!updates.banco) {
            updated.banco = FINANCE_CONTRACT.accountLabel(updates.accountId, contasRef) || updated.banco;
          }
        } else if (updates.banco != null) {
          updated.accountId = FINANCE_CONTRACT.resolveAccountId(updates.banco, contasRef) || undefined;
        }
      }
    }
    var validacao = UTILS.validarTransacao(updated);
    if (!validacao.valido) throw new Error(validacao.erro);
    DADOS.salvarTransacao(updated);
    this.invalidateCache();
    return updated;
  },

  deletar: function(id) {
    if (typeof ANEXOS !== 'undefined') ANEXOS.excluirPorTransacao(id);
    var resultado = DADOS.deletarTransacao(id);
    this.invalidateCache();
    return resultado;
  },

  /**
   * Resumo agregado do mês.
   * @param {number} mes
   * @param {number} ano
   * @param {{ate?:string}} [opts] data de corte inclusive (YYYY-MM-DD)
   * @returns {ResumoMes}
   */
  obterResumoMes: function(mes, ano, opts) {
    this._refreshCache();
    opts = opts || {};
    var cache = this._cache || [];
    if (typeof TRANSACTION_SERVICE !== 'undefined') {
      if (!opts.monthIndex) opts.monthIndex = this._ensureMonthIndex();
      return TRANSACTION_SERVICE.summarizeMonth(cache, mes, ano, opts);
    }
    var txMes = this.obter({ mes: mes, ano: ano });
    if (opts.ate) {
      var ate = String(opts.ate).slice(0, 10);
      txMes = txMes.filter(function(t) { return String(t.data || '').slice(0, 10) <= ate; });
    }
    // Centavos inteiros, igual ao TRANSACTION_SERVICE: os dois caminhos têm de
    // produzir o mesmo número, senão o total do mês muda conforme o service
    // estar carregado ou não.
    var receitasC = 0, despesasC = 0;
    txMes.forEach(function(t) {
      if (t.tipo === CONFIG.TIPO_RECEITA) receitasC += UTILS.paraCentavos(t.valor);
      // Explícito e não `else`: transferência entre contas não é gasto.
      // Somar tudo que não é receita inflava as despesas do mês.
      else if (t.tipo === CONFIG.TIPO_DESPESA) despesasC += UTILS.paraCentavos(t.valor);
    });
    return {
      receitas: receitasC / 100,
      despesas: despesasC / 100,
      saldo: (receitasC - despesasC) / 100,
      total: txMes.length
    };
  },

  obterResumoPorCategoria: function(mes, ano, opts) {
    this._refreshCache();
    opts = opts || {};
    if (typeof TRANSACTION_SERVICE !== 'undefined') {
      if (!opts.monthIndex) opts.monthIndex = this._ensureMonthIndex();
      return TRANSACTION_SERVICE.summarizeByCategory(this._cache || [], mes, ano, opts);
    }
    var txMes = this.obter({ mes: mes, ano: ano });
    var resumo = {};
    txMes.forEach(function(t) {
      if (!resumo[t.categoria]) resumo[t.categoria] = { receita: 0, despesa: 0 };
      if (t.tipo === CONFIG.TIPO_RECEITA) resumo[t.categoria].receita += t.valor;
      else if (t.tipo === CONFIG.TIPO_DESPESA) resumo[t.categoria].despesa += t.valor;
    });
    return resumo;
  },

  // Compatibilidade com suíte de testes legado
  obterPorCategoria: function(mes, ano) {
    var resumo = this.obterResumoPorCategoria(mes, ano);
    var resultado = {};
    Object.keys(resumo).forEach(function(cat) {
      resultado[cat] = resumo[cat].despesa || 0;
    });
    return resultado;
  },

  obterResumoCategoriaMes: function(categoria, mes, ano) {
    var transacoes = UTILS.filtrarPorMes(this._cache, mes, ano);
    return transacoes.filter(function(t) {
      return t.categoria === categoria && t.tipo === 'despesa';
    }).reduce(function(acc, t) {
      return acc + UTILS.paraCentavos(t.valor);
    }, 0) / 100;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TRANSACOES;
}
