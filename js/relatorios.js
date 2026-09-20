/**
 * relatorios.js — Resumos mensais e comparativos (sem DOM)
 */
const RELATORIOS = {
  resumoMes: function(mes, ano) {
    if (typeof TRANSACOES === 'undefined') return null;
    var txs = TRANSACOES.obter({ mes: mes, ano: ano });
    // Soma em centavos inteiros (padrão do app): somar t.valor em reais com +=
    // acumula erro de ponto flutuante, e saldo = receitas - despesas propaga
    // a deriva para os KPIs e para os diffs do comparativo mês a mês.
    var receitasCent = 0;
    var despesasCent = 0;
    var porCatCent = {};

    txs.forEach(function(t) {
      var cent = UTILS.paraCentavos(t.valor);
      if (t.tipo === CONFIG.TIPO_RECEITA) receitasCent += cent;
      else {
        despesasCent += cent;
        var cat = t.categoria || 'outro';
        porCatCent[cat] = (porCatCent[cat] || 0) + cent;
      }
    });

    var topCats = Object.keys(porCatCent).sort(function(a, b) { return porCatCent[b] - porCatCent[a]; }).slice(0, 5);
    return {
      mes: mes,
      ano: ano,
      receitas: receitasCent / 100,
      despesas: despesasCent / 100,
      saldo: (receitasCent - despesasCent) / 100,
      transacoes: txs.length,
      topCategorias: topCats.map(function(c) {
        return {
          categoria: c,
          label: CONFIG.getCatLabel ? CONFIG.getCatLabel(c) : c,
          valor: porCatCent[c] / 100,
          percentual: despesasCent > 0 ? Math.round((porCatCent[c] / despesasCent) * 100) : 0
        };
      })
    };
  },

  compararMesAnterior: function(mes, ano) {
    var prevMes = mes - 1;
    var prevAno = ano;
    if (prevMes < 1) { prevMes = 12; prevAno--; }
    var atual = this.resumoMes(mes, ano);
    var anterior = this.resumoMes(prevMes, prevAno);
    if (!atual || !anterior) return null;
    // Diffs também em centavos: subtrair dois valores em reais reintroduz a
    // deriva (0,01 não é exato em binário), gerando "-R$ 0,00" espúrios.
    return {
      atual: atual,
      anterior: anterior,
      diffReceitas: (UTILS.paraCentavos(atual.receitas) - UTILS.paraCentavos(anterior.receitas)) / 100,
      diffDespesas: (UTILS.paraCentavos(atual.despesas) - UTILS.paraCentavos(anterior.despesas)) / 100,
      diffSaldo: (UTILS.paraCentavos(atual.saldo) - UTILS.paraCentavos(anterior.saldo)) / 100
    };
  },

  /** Despesa do mês por categoria, em centavos inteiros. */
  _despesaPorCategoria: function(mes, ano) {
    var porCat = {};
    if (typeof TRANSACOES === 'undefined') return porCat;
    TRANSACOES.obter({ mes: mes, ano: ano }).forEach(function(t) {
      if (t.tipo === CONFIG.TIPO_RECEITA) return;
      var cat = t.categoria || 'outro';
      porCat[cat] = (porCat[cat] || 0) + UTILS.paraCentavos(t.valor);
    });
    return porCat;
  },

  /**
   * Média de gasto por categoria nos N meses ANTERIORES ao mês consultado,
   * confrontada com o gasto do próprio mês — a linha de base pessoal que
   * responde "estou gastando mais do que o meu normal nisto?" sem exigir que o
   * usuário configure orçamento algum. Distinta de compararMesAnterior (que
   * olha só o mês passado) e da previsão por ritmo/IA (que projeta o futuro).
   *
   * A média usa denominador fixo (a janela): um mês sem gasto na categoria
   * conta como zero, porque foi isso que aconteceu. Para não disparar alarme
   * falso numa categoria que só apareceu uma vez, cada item traz mesesComDados
   * — quem consome decide o corte.
   *
   * @param {number} mes 1-12
   * @param {number} ano
   * @param {number} [janela=3] meses de referência
   * @returns {Array<{categoria:string, label:string, atual:number, media:number,
   *   diff:number, variacao:?number, mesesComDados:number}>} maior desvio (R$) primeiro
   */
  mediaPorCategoria: function(mes, ano, janela) {
    if (typeof TRANSACOES === 'undefined') return [];
    var meses = (janela && janela > 0) ? janela : 3;

    var atualCent = this._despesaPorCategoria(mes, ano);

    var somaAntCent = {};
    var mesesComDado = {};
    var m = mes, a = ano;
    for (var i = 0; i < meses; i++) {
      m -= 1;
      if (m < 1) { m = 12; a -= 1; }
      var porCat = this._despesaPorCategoria(m, a);
      Object.keys(porCat).forEach(function(cat) {
        somaAntCent[cat] = (somaAntCent[cat] || 0) + porCat[cat];
        mesesComDado[cat] = (mesesComDado[cat] || 0) + 1;
      });
    }

    var cats = {};
    Object.keys(atualCent).forEach(function(c) { cats[c] = true; });
    Object.keys(somaAntCent).forEach(function(c) { cats[c] = true; });

    var lista = Object.keys(cats).map(function(cat) {
      var atual = atualCent[cat] || 0;
      var mediaCent = Math.round((somaAntCent[cat] || 0) / meses);
      var diff = atual - mediaCent;
      return {
        categoria: cat,
        label: (typeof CONFIG !== 'undefined' && CONFIG.getCatLabel) ? CONFIG.getCatLabel(cat) : cat,
        atual: atual / 100,
        media: mediaCent / 100,
        diff: diff / 100,
        variacao: mediaCent > 0 ? Math.round((diff / mediaCent) * 100) : null,
        mesesComDados: mesesComDado[cat] || 0
      };
    });

    lista.sort(function(x, y) { return Math.abs(y.diff) - Math.abs(x.diff); });
    return lista;
  },

  /**
   * Resumo agregado dos últimos N meses (janela móvel terminando no mês
   * consultado, inclusive) — o "zoom out" que o app não tinha em números:
   * total do período, média mensal de despesa, taxa de poupança e o mês mais
   * caro. Complementa o gráfico de evolução (que só desenha as barras) com os
   * números por trás dele. Tudo em centavos inteiros.
   *
   * @param {number} mes 1-12 (mês final da janela)
   * @param {number} ano
   * @param {number} [meses=6] tamanho da janela
   * @returns {?{meses:number, receitas:number, despesas:number, saldo:number,
   *   mediaDespesaMensal:number, taxaPoupanca:?number,
   *   maiorDespesaMes:?{mes:number, ano:number, despesas:number},
   *   mesesComDados:number}}
   */
  resumoPeriodo: function(mes, ano, meses) {
    if (typeof TRANSACOES === 'undefined') return null;
    var janela = (meses && meses > 0) ? meses : 6;

    var recCent = 0, despCent = 0, mesesComDados = 0;
    var maior = null;
    var m = mes, a = ano;
    for (var i = 0; i < janela; i++) {
      var r = this.resumoMes(m, a);
      var rc = UTILS.paraCentavos(r.receitas);
      var dc = UTILS.paraCentavos(r.despesas);
      recCent += rc;
      despCent += dc;
      if (r.transacoes > 0) mesesComDados++;
      if (dc > 0 && (maior === null || dc > maior.cent)) {
        maior = { mes: m, ano: a, cent: dc };
      }
      m -= 1;
      if (m < 1) { m = 12; a -= 1; }
    }

    var saldoCent = recCent - despCent;
    return {
      meses: janela,
      receitas: recCent / 100,
      despesas: despCent / 100,
      saldo: saldoCent / 100,
      mediaDespesaMensal: Math.round(despCent / janela) / 100,
      taxaPoupanca: recCent > 0 ? Math.round((saldoCent / recCent) * 100) : null,
      maiorDespesaMes: maior ? { mes: maior.mes, ano: maior.ano, despesas: maior.cent / 100 } : null,
      mesesComDados: mesesComDados
    };
  },

  /**
   * Despesa por dia da semana no mês — o padrão semanal de gastos ("você gasta
   * mais aos sábados"). É o recorte temporal-dentro-da-semana que Mobills e
   * Organizze mostram; complementa os cortes por categoria/marcador.
   *
   * A data é lida em componentes (new Date(ano, mes-1, dia)) e NÃO via
   * new Date('YYYY-MM-DD'), que seria UTC e poderia jogar o dia da semana para
   * o anterior no fuso do Brasil. Só despesa entra; soma em centavos inteiros.
   *
   * @param {number} mes 1-12
   * @param {number} ano
   * @returns {Array<{dia:number, label:string, total:number, transacoes:number}>}
   *          sempre 7 posições, de domingo (0) a sábado (6)
   */
  gastoPorDiaSemana: function(mes, ano) {
    var labels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    var cent = [0, 0, 0, 0, 0, 0, 0];
    var cnt = [0, 0, 0, 0, 0, 0, 0];
    if (typeof TRANSACOES !== 'undefined') {
      TRANSACOES.obter({ mes: mes, ano: ano }).forEach(function(t) {
        if (!t || t.tipo !== CONFIG.TIPO_DESPESA) return;
        var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(t.data || ''));
        if (!m) return;
        var dow = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)).getDay();
        cent[dow] += UTILS.paraCentavos(t.valor);
        cnt[dow] += 1;
      });
    }
    return labels.map(function(label, i) {
      return { dia: i, label: label, total: cent[i] / 100, transacoes: cnt[i] };
    });
  },

  /**
   * Para onde o dinheiro foi: ranking das despesas do mês por descrição — o
   * "maiores despesas / top estabelecimentos" que Mobills e Organizze mostram.
   * Responde "quais lançamentos mais pesaram", olhando o texto do gasto, e não
   * a categoria (topCategorias) nem o marcador (resumoPorTag).
   *
   * A chave de agrupamento normaliza a descrição (minúscula, espaços internos
   * colapsados) para juntar "Uber", "uber " e "UBER" num item só; o rótulo
   * exibido é a forma original mais frequente, para não descaracterizar o nome.
   * Lançamentos sem descrição ficam de fora (não são um estabelecimento). Só
   * despesa entra; soma em centavos inteiros. O percentual é sobre a despesa
   * total do mês (inclusive a sem descrição), então "Uber = 12%" significa 12%
   * de tudo que saiu no mês.
   *
   * @param {number} mes 1-12
   * @param {number} ano
   * @param {number} [limite=5] quantos itens no topo
   * @returns {Array<{descricao:string, total:number, transacoes:number,
   *   percentual:number}>} maior gasto primeiro
   */
  topDescricoes: function(mes, ano, limite) {
    if (typeof TRANSACOES === 'undefined') return [];
    var lim = (limite && limite > 0) ? limite : 5;
    var totalDespCent = 0;
    var mapa = {};
    TRANSACOES.obter({ mes: mes, ano: ano }).forEach(function(t) {
      if (!t || t.tipo !== CONFIG.TIPO_DESPESA) return;
      var cent = UTILS.paraCentavos(t.valor);
      totalDespCent += cent;
      var bruto = String(t.descricao == null ? '' : t.descricao).trim();
      if (!bruto) return; // sem descrição não é um estabelecimento
      var chave = bruto.toLowerCase().replace(/\s+/g, ' ');
      if (!mapa[chave]) mapa[chave] = { totalCent: 0, transacoes: 0, rotulos: {} };
      var m = mapa[chave];
      m.totalCent += cent;
      m.transacoes += 1;
      m.rotulos[bruto] = (m.rotulos[bruto] || 0) + 1;
    });

    return Object.keys(mapa).map(function(chave) {
      var m = mapa[chave];
      var rotulo = Object.keys(m.rotulos).sort(function(a, b) {
        return (m.rotulos[b] - m.rotulos[a]) || a.localeCompare(b);
      })[0];
      return {
        descricao: rotulo,
        totalCent: m.totalCent,
        total: m.totalCent / 100,
        transacoes: m.transacoes,
        percentual: totalDespCent > 0 ? Math.round((m.totalCent / totalDespCent) * 100) : 0
      };
    }).sort(function(a, b) {
      return (b.totalCent - a.totalCent) ||
        (b.transacoes - a.transacoes) ||
        a.descricao.localeCompare(b.descricao);
    }).slice(0, lim).map(function(item) {
      return {
        descricao: item.descricao,
        total: item.total,
        transacoes: item.transacoes,
        percentual: item.percentual
      };
    });
  },

  /** Despesa do mês acumulada até o dia `ate` (inclusive), em centavos. */
  _despesaAcumuladaAte: function(mes, ano, ate) {
    var cent = 0;
    if (typeof TRANSACOES === 'undefined') return cent;
    TRANSACOES.obter({ mes: mes, ano: ano }).forEach(function(t) {
      if (!t || t.tipo !== CONFIG.TIPO_DESPESA) return;
      var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(t.data || ''));
      if (!m) return;
      if (parseInt(m[3], 10) > ate) return;
      cent += UTILS.paraCentavos(t.valor);
    });
    return cent;
  },

  /**
   * Ritmo de gastos: quanto já saiu no mês ATÉ O DIA D, confrontado com o
   * mesmo ponto do mês anterior — "no dia 20 você já gastou R$ X; no dia 20 do
   * mês passado eram R$ Y". Responde "estou gastando mais rápido que o meu
   * normal?" enquanto o mês corre, algo que o comparativo de mês fechado
   * (compararMesAnterior) só enxerga quando o mês já acabou.
   *
   * D = o dia de hoje quando o mês consultado é o corrente; senão o último dia
   * do mês (comparação de mês inteiro). No mês anterior o corte é o mesmo dia,
   * limitado ao último dia de lá (31→28 em fevereiro, por exemplo). O dia é
   * lido em componentes locais para não escorregar no fuso. Só despesa entra;
   * soma em centavos inteiros.
   *
   * @param {number} mes 1-12
   * @param {number} ano
   * @param {Date} [hoje]
   * @returns {?{dia:number, atual:number, anterior:number, diff:number,
   *   variacao:?number}} variacao em % (null se não havia base no mês anterior)
   */
  ritmoGasto: function(mes, ano, hoje) {
    if (typeof TRANSACOES === 'undefined') return null;
    hoje = hoje || new Date();
    var ultimoDia = new Date(ano, mes, 0).getDate();
    var dia = (hoje.getFullYear() === ano && (hoje.getMonth() + 1) === mes)
      ? Math.min(hoje.getDate(), ultimoDia)
      : ultimoDia;

    var prevMes = mes - 1, prevAno = ano;
    if (prevMes < 1) { prevMes = 12; prevAno -= 1; }
    var diaPrev = Math.min(dia, new Date(prevAno, prevMes, 0).getDate());

    var atualCent = this._despesaAcumuladaAte(mes, ano, dia);
    var antCent = this._despesaAcumuladaAte(prevMes, prevAno, diaPrev);
    var diffCent = atualCent - antCent;
    return {
      dia: dia,
      atual: atualCent / 100,
      anterior: antCent / 100,
      diff: diffCent / 100,
      variacao: antCent > 0 ? Math.round((diffCent / antCent) * 100) : null
    };
  },

  /**
   * Por onde o dinheiro saiu: despesa do mês por fonte de pagamento — cada
   * cartão e cada conta separados. Responde "quanto passou no cartão X e quanto
   * saiu da conta Y", o recorte por meio de pagamento que os cortes por
   * categoria/marcador/descrição não mostram.
   *
   * A fonte é o cartão quando o lançamento tem cartão; senão a conta (banco);
   * senão "Sem conta". Só despesa entra; soma em centavos inteiros; percentual
   * sobre a despesa total do mês.
   *
   * @param {number} mes 1-12
   * @param {number} ano
   * @returns {Array<{fonte:string, tipo:('cartao'|'conta'|'nenhuma'),
   *   total:number, transacoes:number, percentual:number}>} maior gasto primeiro
   */
  gastoPorFonte: function(mes, ano) {
    if (typeof TRANSACOES === 'undefined') return [];
    var totalCent = 0;
    var mapa = {};
    TRANSACOES.obter({ mes: mes, ano: ano }).forEach(function(t) {
      if (!t || t.tipo !== CONFIG.TIPO_DESPESA) return;
      var cent = UTILS.paraCentavos(t.valor);
      totalCent += cent;
      var cartao = t.cartao ? String(t.cartao).trim() : '';
      var banco = t.banco ? String(t.banco).trim() : '';
      var tipo, nome;
      if (cartao) { tipo = 'cartao'; nome = cartao; }
      else if (banco) { tipo = 'conta'; nome = banco; }
      else { tipo = 'nenhuma'; nome = 'Sem conta'; }
      var chave = tipo + '\u0000' + nome.toLowerCase();
      if (!mapa[chave]) mapa[chave] = { fonte: nome, tipo: tipo, totalCent: 0, transacoes: 0 };
      mapa[chave].totalCent += cent;
      mapa[chave].transacoes += 1;
    });
    return Object.keys(mapa).map(function(k) {
      var m = mapa[k];
      return {
        fonte: m.fonte,
        tipo: m.tipo,
        totalCent: m.totalCent,
        total: m.totalCent / 100,
        transacoes: m.transacoes,
        percentual: totalCent > 0 ? Math.round((m.totalCent / totalCent) * 100) : 0
      };
    }).sort(function(a, b) {
      return (b.totalCent - a.totalCent) ||
        (b.transacoes - a.transacoes) ||
        a.fonte.localeCompare(b.fonte);
    }).map(function(m) {
      return { fonte: m.fonte, tipo: m.tipo, total: m.total, transacoes: m.transacoes, percentual: m.percentual };
    });
  },

  /**
   * Retrospectiva do ano: agrega os 12 meses do ano civil — total de receitas,
   * despesas e saldo, média de despesa por mês ativo, taxa de poupança do ano e
   * os meses mais caro e mais econômico. É a visão anual que o app não tinha: o
   * "Últimos 6 meses" é uma janela móvel; este é o ano fechado (jan→dez).
   *
   * A média divide pelos meses COM lançamento (não por 12 fixo), para um ano em
   * curso não sair diluído por meses que ainda nem chegaram. Tudo em centavos
   * inteiros. O array `meses` traz os 12 meses (zeros nos vazios) para desenhar
   * a evolução do ano.
   *
   * @param {number} ano
   * @returns {?{ano:number, receitas:number, despesas:number, saldo:number,
   *   mediaDespesaMensal:number, taxaPoupanca:?number, mesesComDados:number,
   *   maiorDespesaMes:?{mes:number, despesas:number},
   *   menorDespesaMes:?{mes:number, despesas:number},
   *   meses:Array<{mes:number, receitas:number, despesas:number, saldo:number, transacoes:number}>}}
   */
  resumoAno: function(ano) {
    if (typeof TRANSACOES === 'undefined') return null;
    var recCent = 0, despCent = 0, mesesComDados = 0;
    var maior = null, menor = null;
    var meses = [];
    for (var mes = 1; mes <= 12; mes++) {
      var r = this.resumoMes(mes, ano);
      var rc = UTILS.paraCentavos(r.receitas);
      var dc = UTILS.paraCentavos(r.despesas);
      recCent += rc;
      despCent += dc;
      if (r.transacoes > 0) mesesComDados++;
      if (dc > 0) {
        if (maior === null || dc > maior.cent) maior = { mes: mes, cent: dc };
        if (menor === null || dc < menor.cent) menor = { mes: mes, cent: dc };
      }
      meses.push({ mes: mes, receitas: rc / 100, despesas: dc / 100, saldo: (rc - dc) / 100, transacoes: r.transacoes });
    }

    var saldoCent = recCent - despCent;
    return {
      ano: ano,
      receitas: recCent / 100,
      despesas: despCent / 100,
      saldo: saldoCent / 100,
      mediaDespesaMensal: mesesComDados > 0 ? Math.round(despCent / mesesComDados) / 100 : 0,
      taxaPoupanca: recCent > 0 ? Math.round((saldoCent / recCent) * 100) : null,
      mesesComDados: mesesComDados,
      maiorDespesaMes: maior ? { mes: maior.mes, despesas: maior.cent / 100 } : null,
      menorDespesaMes: menor ? { mes: menor.mes, despesas: menor.cent / 100 } : null,
      meses: meses
    };
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = RELATORIOS;
}
