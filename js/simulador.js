/**
 * simulador.js — simulações financeiras determinísticas, grátis e sem backend.
 *
 * Responde as três decisões de dinheiro que todo mundo faz e que o app ainda
 * não ajudava a decidir:
 *
 *   1. "à vista ou parcelado?"  → compararParcelado()
 *   2. "quanto rende se eu guardar?" → jurosCompostos()
 *   3. "quanto esse financiamento custa de verdade?" → financiamento()
 *
 * ─── HONESTIDADE DO NÚMERO ───────────────────────────────────────────────────
 * A decisão "à vista vs parcelado" não é "qual soma é menor". Parcelar sem juros
 * e deixar o dinheiro rendendo pode ser MELHOR que pagar à vista, mesmo o total
 * parcelado sendo igual. O critério correto é VALOR PRESENTE: traz-se o fluxo de
 * parcelas para hoje descontando pela taxa que SEU dinheiro rende (o custo de
 * oportunidade). Se o valor presente das parcelas for menor que o preço à vista,
 * parcelar sai na frente — e por quanto, em dinheiro de hoje. É o que uma
 * calculadora financeira honesta responde, e é o que este módulo devolve.
 *
 * ─── DINHEIRO ────────────────────────────────────────────────────────────────
 * Juros são intrinsecamente fracionários (potências, taxas), então a conta
 * interna roda em reais de ponto flutuante — não dá para elevar centavos
 * inteiros a uma potência. A disciplina de centavos do projeto vale para SOMAR e
 * COMPARAR valores guardados; aqui ela é honrada no lugar certo: todo valor
 * monetário devolvido é ARREDONDADO ao centavo (_cent), para o número que chega
 * na tela ser exato ao centavo, sem arrastar dízima de ponto flutuante.
 *
 * Puro, sem DOM. Sem dependências obrigatórias (UTILS é opcional).
 */
var SIMULADOR = {

  /** Teto de parcelas/meses aceito numa simulação (proteção de laço). */
  MAX_PERIODOS: 600,

  /** Arredonda um valor em reais ao centavo mais próximo. */
  _cent: function(reais) {
    var n = Number(reais);
    if (!isFinite(n)) return 0;
    // Math.round(x*100)/100 sofre com binário (1.005 → 1.00). Somar Number.EPSILON
    // escalado empurra o meio-centavo para o lado certo sem afetar o resto.
    return Math.round((n + Number.EPSILON) * 100) / 100;
  },

  _num: function(v, padrao) {
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isFinite(n) ? n : (padrao || 0);
  },

  /** Inteiro >= 1 e <= MAX_PERIODOS, senão 0 (inválido). */
  _periodos: function(v) {
    var n = Math.floor(this._num(v, 0));
    if (n < 1 || n > this.MAX_PERIODOS) return 0;
    return n;
  },

  /**
   * Valor presente de uma anuidade (N parcelas iguais) descontada à taxa i.
   * i em decimal ao período (0.01 = 1%). i=0 → soma simples (sem desconto).
   */
  _valorPresente: function(parcela, i, n) {
    if (n <= 0) return 0;
    if (Math.abs(i) < 1e-12) return parcela * n;
    return parcela * (1 - Math.pow(1 + i, -n)) / i;
  },

  /**
   * Taxa de juros mensal embutida num parcelamento, via bisseção.
   *
   * Resolve, para i, a equação  precoVista = parcela · (1−(1+i)^−n)/i .
   * É a TIR (taxa interna de retorno) do fluxo: pagar precoVista hoje ou n
   * parcelas de `parcela`. Bisseção em vez de Newton porque não precisa de
   * derivada e não diverge — num app financeiro previsibilidade vale mais que
   * duas iterações a menos.
   *
   * @returns {number} taxa mensal decimal (>= 0); 0 quando não há juros embutido
   */
  _taxaEmbutida: function(precoVista, parcela, n) {
    if (n <= 0 || precoVista <= 0 || parcela <= 0) return 0;
    var total = parcela * n;
    // Total <= preço à vista: parcelado não tem juros (é igual ou até desconto).
    if (total <= precoVista + 1e-9) return 0;

    var lo = 0;         // f(0) = total - vista > 0
    var hi = 2;         // 200%/mês: teto folgado; f(hi) < 0 com folga
    var f = function(i) { return SIMULADOR._valorPresente(parcela, i, n) - precoVista; };
    // Garante que hi realmente cruza o zero (parcela absurda vs preço minúsculo).
    var guard = 0;
    while (f(hi) > 0 && hi < 1e6 && guard++ < 40) hi *= 2;

    var mid = 0;
    for (var k = 0; k < 100; k++) {
      mid = (lo + hi) / 2;
      var val = f(mid);
      if (Math.abs(val) < 1e-7) break;
      if (val > 0) lo = mid; else hi = mid;
    }
    return mid > 0 ? mid : 0;
  },

  /**
   * À vista vs parcelado, com decisão por valor presente.
   *
   * @param {Object} p
   * @param {number} p.precoVista      preço pagando à vista (reais)
   * @param {number} p.numParcelas     nº de parcelas
   * @param {number} [p.valorParcela]  valor de cada parcela (reais) — informe
   *                                   isto OU precoParcelado
   * @param {number} [p.precoParcelado] preço total parcelado (reais)
   * @param {number} [p.taxaInvestimento] rendimento mensal do SEU dinheiro em
   *                                   decimal (0.008 = 0,8% a.m.); default 0
   * @returns {Object} resultado (valido:false quando a entrada não fecha)
   */
  compararParcelado: function(p) {
    p = p || {};
    var precoVista = this._num(p.precoVista, 0);
    var n = this._periodos(p.numParcelas);
    var taxaInvest = this._num(p.taxaInvestimento, 0);

    var valorParcela;
    if (p.valorParcela != null) {
      valorParcela = this._num(p.valorParcela, 0);
    } else if (p.precoParcelado != null && n > 0) {
      valorParcela = this._num(p.precoParcelado, 0) / n;
    } else {
      valorParcela = 0;
    }

    if (precoVista <= 0 || n <= 0 || valorParcela <= 0) {
      return { valido: false, motivo: 'Informe preço à vista, nº de parcelas e valor da parcela.' };
    }
    if (taxaInvest < 0 || taxaInvest > 1) {
      return { valido: false, motivo: 'Taxa de investimento fora da faixa (0 a 100% ao mês).' };
    }

    var totalParcelado = valorParcela * n;
    var acrescimo = totalParcelado - precoVista;
    var taxaMensal = this._taxaEmbutida(precoVista, valorParcela, n);
    var taxaAnual = Math.pow(1 + taxaMensal, 12) - 1;

    // Valor presente das parcelas descontado pelo que o dinheiro renderia.
    var vpParcelado = this._valorPresente(valorParcela, taxaInvest, n);
    // Positivo → parcelar sai mais barato em dinheiro de HOJE, por este valor.
    var economiaParcelar = precoVista - vpParcelado;

    var vantagem;
    // Tolerância de 1 centavo: diferença menor que isso é indiferente na prática.
    if (economiaParcelar > 0.005) vantagem = 'parcelado';
    else if (economiaParcelar < -0.005) vantagem = 'vista';
    else vantagem = 'indiferente';

    return {
      valido: true,
      precoVista: this._cent(precoVista),
      numParcelas: n,
      valorParcela: this._cent(valorParcela),
      totalParcelado: this._cent(totalParcelado),
      acrescimo: this._cent(acrescimo),
      acrescimoPct: precoVista > 0 ? Math.round(acrescimo / precoVista * 10000) / 100 : 0,
      taxaMensal: Math.round(taxaMensal * 1000000) / 1000000,
      taxaMensalPct: Math.round(taxaMensal * 10000) / 100,
      taxaAnual: Math.round(taxaAnual * 1000000) / 1000000,
      taxaAnualPct: Math.round(taxaAnual * 10000) / 100,
      taxaInvestimento: taxaInvest,
      valorPresenteParcelado: this._cent(vpParcelado),
      economia: this._cent(Math.abs(economiaParcelar)),
      vantagem: vantagem,
      semJuros: taxaMensal <= 1e-9
    };
  },

  /**
   * Juros compostos: quanto um valor inicial + aportes mensais viram no tempo.
   *
   * FV = P·(1+i)^n + A·((1+i)^n − 1)/i
   *
   * @param {Object} p
   * @param {number} [p.principal]     valor inicial (reais)
   * @param {number} [p.aporteMensal]  depósito mensal (reais)
   * @param {number} p.taxaMensal      rendimento mensal decimal (0.01 = 1% a.m.)
   * @param {number} p.meses           horizonte em meses
   * @returns {Object} { valido, montante, totalAportado, jurosGanhos, ... }
   */
  jurosCompostos: function(p) {
    p = p || {};
    var principal = this._num(p.principal, 0);
    var aporte = this._num(p.aporteMensal, 0);
    var i = this._num(p.taxaMensal, 0);
    var n = this._periodos(p.meses);

    if (n <= 0) return { valido: false, motivo: 'Informe o prazo em meses (1 a ' + this.MAX_PERIODOS + ').' };
    if (principal < 0 || aporte < 0) return { valido: false, motivo: 'Valores não podem ser negativos.' };
    if (principal <= 0 && aporte <= 0) return { valido: false, motivo: 'Informe um valor inicial ou um aporte mensal.' };
    if (i < 0 || i > 1) return { valido: false, motivo: 'Taxa fora da faixa (0 a 100% ao mês).' };

    var fator = Math.pow(1 + i, n);
    var fvPrincipal = principal * fator;
    var fvAportes = Math.abs(i) < 1e-12 ? aporte * n : aporte * (fator - 1) / i;
    var montante = fvPrincipal + fvAportes;
    var totalAportado = principal + aporte * n;
    var jurosGanhos = montante - totalAportado;
    var taxaAnual = Math.pow(1 + i, 12) - 1;

    return {
      valido: true,
      montante: this._cent(montante),
      totalAportado: this._cent(totalAportado),
      jurosGanhos: this._cent(jurosGanhos),
      meses: n,
      taxaMensal: i,
      taxaAnual: Math.round(taxaAnual * 1000000) / 1000000,
      taxaAnualPct: Math.round(taxaAnual * 10000) / 100
    };
  },

  /**
   * Quanto guardar por mês para alcançar uma meta (o inverso de jurosCompostos).
   *
   * Resolve para A em  objetivo = P·(1+i)^n + A·((1+i)^n − 1)/i :
   *   A = (objetivo − P·(1+i)^n) · i / ((1+i)^n − 1)
   *
   * Se o valor inicial rendendo já passa da meta, o aporte necessário é zero
   * (a meta se paga sozinha) — devolve aporteMensal 0 e sinaliza jaAlcanca.
   *
   * @param {Object} p
   * @param {number} p.objetivo     quanto se quer ter ao fim (reais)
   * @param {number} p.meses        prazo em meses
   * @param {number} [p.taxaMensal] rendimento mensal decimal (0.008 = 0,8% a.m.)
   * @param {number} [p.inicial]    valor que já se tem hoje (reais)
   * @returns {Object} { valido, aporteMensal, totalAportado, jurosGanhos, ... }
   */
  aporteParaMeta: function(p) {
    p = p || {};
    var objetivo = this._num(p.objetivo, 0);
    var inicial = this._num(p.inicial, 0);
    var i = this._num(p.taxaMensal, 0);
    var n = this._periodos(p.meses);

    if (objetivo <= 0) return { valido: false, motivo: 'Informe o valor da meta.' };
    if (n <= 0) return { valido: false, motivo: 'Informe o prazo em meses (1 a ' + this.MAX_PERIODOS + ').' };
    if (inicial < 0) return { valido: false, motivo: 'O valor inicial não pode ser negativo.' };
    if (i < 0 || i > 1) return { valido: false, motivo: 'Taxa fora da faixa (0 a 100% ao mês).' };

    var fator = Math.pow(1 + i, n);
    var fvInicial = inicial * fator;
    // O que o valor inicial já cobre da meta, rendendo. Se cobre tudo, aporte 0.
    var faltando = objetivo - fvInicial;
    var jaAlcanca = faltando <= 0;

    var aporte;
    if (jaAlcanca) {
      aporte = 0;
    } else if (Math.abs(i) < 1e-12) {
      aporte = faltando / n;
    } else {
      aporte = faltando * i / (fator - 1);
    }

    var totalAportado = inicial + aporte * n;
    var jurosGanhos = objetivo - totalAportado;

    return {
      valido: true,
      objetivo: this._cent(objetivo),
      inicial: this._cent(inicial),
      meses: n,
      aporteMensal: this._cent(aporte),
      totalAportado: this._cent(totalAportado),
      jurosGanhos: this._cent(jurosGanhos > 0 ? jurosGanhos : 0),
      jaAlcanca: jaAlcanca,
      taxaMensal: i
    };
  },

  /**
   * Financiamento pela Tabela Price (parcela fixa).
   *
   * Parcela = PV · i / (1 − (1+i)^−n), onde PV = valor − entrada.
   * Devolve o custo real: total pago e quanto disso foi só juros.
   *
   * @param {Object} p
   * @param {number} p.valor        preço do bem (reais)
   * @param {number} [p.entrada]    entrada paga à vista (reais)
   * @param {number} p.taxaMensal   juros mensais decimal (0.015 = 1,5% a.m.)
   * @param {number} p.numParcelas  nº de parcelas
   * @returns {Object} { valido, valorFinanciado, valorParcela, totalPago, totalJuros, ... }
   */
  financiamento: function(p) {
    p = p || {};
    var valor = this._num(p.valor, 0);
    var entrada = this._num(p.entrada, 0);
    var i = this._num(p.taxaMensal, 0);
    var n = this._periodos(p.numParcelas);

    if (valor <= 0) return { valido: false, motivo: 'Informe o valor do bem.' };
    if (n <= 0) return { valido: false, motivo: 'Informe o nº de parcelas (1 a ' + this.MAX_PERIODOS + ').' };
    if (entrada < 0 || entrada >= valor) return { valido: false, motivo: 'A entrada deve ser menor que o valor do bem.' };
    if (i < 0 || i > 1) return { valido: false, motivo: 'Taxa fora da faixa (0 a 100% ao mês).' };

    var pv = valor - entrada;
    var parcela = Math.abs(i) < 1e-12
      ? pv / n
      : pv * i / (1 - Math.pow(1 + i, -n));
    var totalParcelas = parcela * n;
    var totalPago = totalParcelas + entrada;
    var totalJuros = totalParcelas - pv;
    var taxaAnual = Math.pow(1 + i, 12) - 1;

    return {
      valido: true,
      valorBem: this._cent(valor),
      entrada: this._cent(entrada),
      valorFinanciado: this._cent(pv),
      numParcelas: n,
      valorParcela: this._cent(parcela),
      totalPago: this._cent(totalPago),
      totalJuros: this._cent(totalJuros),
      jurosPct: pv > 0 ? Math.round(totalJuros / pv * 10000) / 100 : 0,
      taxaMensal: i,
      taxaMensalPct: Math.round(i * 10000) / 100,
      taxaAnual: Math.round(taxaAnual * 1000000) / 1000000,
      taxaAnualPct: Math.round(taxaAnual * 10000) / 100
    };
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SIMULADOR;
}
