/**
 * ai-engine.js — Motor de IA financeira
 * v11.0 — Pure computation: zero DOM, zero side effects
 * Fase 8: Arquitetura desacoplada de renderização
 * Depende de: Nada (módulo puro — pode ser testado isoladamente)
 */

var AI_ENGINE = {

  // ─────────────────────────────────────────────────────────────────
  // AGREGAÇÃO
  // ─────────────────────────────────────────────────────────────────

  /**
   * Agrega transações por mês.
   * @param {Array} transacoes
   * @returns {Object} { 'YYYY-MM': { receitas, despesas, saldo, count } }
   */
  agregarPorMes: function(transacoes) {
    var meses = {};
    if (!Array.isArray(transacoes)) return meses;

    transacoes.forEach(function(t) {
      if (!t || !t.data) return;
      var key = String(t.data).slice(0, 7);
      if (!meses[key]) meses[key] = { receitas: 0, despesas: 0, saldo: 0, count: 0 };
      var val = Number(t.valor) || 0;
      if (t.tipo === 'receita') {
        meses[key].receitas += val;
      } else {
        meses[key].despesas += val;
      }
      meses[key].saldo = meses[key].receitas - meses[key].despesas;
      meses[key].count++;
    });

    return meses;
  },

  /**
   * Agrega transações por categoria no mês dado.
   * @param {Array} transacoes
   * @param {string} mesKey 'YYYY-MM'
   * @returns {Object} { categoria: { despesas, receitas, count } }
   */
  agregarPorCategoria: function(transacoes, mesKey) {
    var cats = {};
    if (!Array.isArray(transacoes)) return cats;

    transacoes.forEach(function(t) {
      if (!t || !t.data) return;
      if (mesKey && String(t.data).slice(0, 7) !== mesKey) return;
      var cat = t.categoria || 'outro';
      if (!cats[cat]) cats[cat] = { despesas: 0, receitas: 0, count: 0 };
      var val = Number(t.valor) || 0;
      if (t.tipo === 'receita') {
        cats[cat].receitas += val;
      } else {
        cats[cat].despesas += val;
      }
      cats[cat].count++;
    });

    return cats;
  },

  // ─────────────────────────────────────────────────────────────────
  // ESTATÍSTICA
  // ─────────────────────────────────────────────────────────────────

  /**
   * Regressão linear simples — detecta tendência.
   * @param {number[]} valores — série temporal ordenada
   * @returns {{ slope, intercept, r2 }} slope > 0 = tendência crescente
   */
  regressaoLinear: function(valores) {
    var n = valores.length;
    if (n < 2) return { slope: 0, intercept: valores[0] || 0, r2: 0 };

    var sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (var i = 0; i < n; i++) {
      sumX  += i;
      sumY  += valores[i];
      sumXY += i * valores[i];
      sumX2 += i * i;
    }

    var denom = n * sumX2 - sumX * sumX;
    if (denom === 0) return { slope: 0, intercept: sumY / n, r2: 0 };

    var slope     = (n * sumXY - sumX * sumY) / denom;
    var intercept = (sumY - slope * sumX) / n;

    // R² (coeficiente de determinação)
    var media  = sumY / n;
    var ssTot  = 0, ssRes = 0;
    for (var j = 0; j < n; j++) {
      ssTot += Math.pow(valores[j] - media, 2);
      ssRes += Math.pow(valores[j] - (slope * j + intercept), 2);
    }
    var r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;

    return { slope: slope, intercept: intercept, r2: r2 };
  },

  /**
   * Média e desvio padrão de um array.
   * @param {number[]} arr
   * @returns {{ media, desvio }}
   */
  estatisticas: function(arr) {
    if (!arr || arr.length === 0) return { media: 0, desvio: 0 };
    var n    = arr.length;
    var soma = arr.reduce(function(a, b) { return a + b; }, 0);
    var media = soma / n;
    var variancia = arr.reduce(function(acc, v) { return acc + Math.pow(v - media, 2); }, 0) / n;
    return { media: media, desvio: Math.sqrt(variancia) };
  },

  // ─────────────────────────────────────────────────────────────────
  // PREVISÃO
  // ─────────────────────────────────────────────────────────────────

  /**
   * Gera previsão para os próximos N meses.
   * Usa média ponderada (meses recentes têm peso maior) + tendência linear.
   * @param {Array} transacoes
   * @param {number} mesesFuturos — default 3
   * @returns {Object} { meses: [{ mesKey, receitaEstimada, despesaEstimada, saldoEstimado, confianca }], tendencia, taxaPoupancaMedia }
   */
  prever: function(transacoes, mesesFuturos) {
    mesesFuturos = mesesFuturos || 3;
    var agregado = this.agregarPorMes(transacoes);
    var chaves   = Object.keys(agregado).sort();

    if (chaves.length < 2) {
      return { meses: [], tendencia: 'insuficiente', taxaPoupancaMedia: 0, historico: [] };
    }

    // Usar até 6 meses mais recentes para o modelo
    var janela  = chaves.slice(-6);
    var recSerie  = janela.map(function(k) { return agregado[k].receitas; });
    var despSerie = janela.map(function(k) { return agregado[k].despesas; });

    var regRec  = this.regressaoLinear(recSerie);
    var regDesp = this.regressaoLinear(despSerie);

    // Pesos exponenciais (mais recente = maior peso)
    var pesos   = janela.map(function(_, i) { return Math.pow(1.3, i); });
    var somaPes = pesos.reduce(function(a, b) { return a + b; }, 0);

    var mediaRec  = recSerie.reduce(function(acc, v, i) { return acc + v * pesos[i]; }, 0) / somaPes;
    var mediaDesp = despSerie.reduce(function(acc, v, i) { return acc + v * pesos[i]; }, 0) / somaPes;

    // Taxa de poupança média
    var taxas = janela.map(function(k) {
      var d = agregado[k];
      return d.receitas > 0 ? (d.receitas - d.despesas) / d.receitas : 0;
    });
    var taxaMedia = taxas.reduce(function(a, b) { return a + b; }, 0) / taxas.length;

    // Tendência geral: subida/queda de despesas
    var tendencia = 'estavel';
    if (Math.abs(regDesp.slope) > mediaDesp * 0.05) {
      tendencia = regDesp.slope > 0 ? 'gastos-crescendo' : 'gastos-diminuindo';
    } else if (Math.abs(regRec.slope) > mediaRec * 0.05) {
      tendencia = regRec.slope > 0 ? 'receitas-crescendo' : 'receitas-diminuindo';
    }

    // Confiança baseada em R² e quantidade de meses
    var confianca = janela.length >= 4
      ? (regDesp.r2 > 0.5 ? 'alta' : 'media')
      : 'baixa';

    // Projetar próximos meses
    var n     = janela.length;
    var meses = [];
    var hoje  = new Date();
    for (var i = 1; i <= mesesFuturos; i++) {
      var dataFut = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
      var mesKey  = dataFut.getFullYear() + '-' + String(dataFut.getMonth() + 1).padStart(2, '0');

      // Blende: 70% média ponderada + 30% tendência
      var recEstimada  = Math.max(0, mediaRec  * 0.7 + (regRec.slope  * (n + i - 1) + regRec.intercept)  * 0.3);
      var despEstimada = Math.max(0, mediaDesp * 0.7 + (regDesp.slope * (n + i - 1) + regDesp.intercept) * 0.3);

      meses.push({
        mesKey:           mesKey,
        receitaEstimada:  Math.round(recEstimada  * 100) / 100,
        despesaEstimada:  Math.round(despEstimada * 100) / 100,
        saldoEstimado:    Math.round((recEstimada - despEstimada) * 100) / 100,
        confianca:        confianca
      });
    }

    return {
      meses:            meses,
      tendencia:        tendencia,
      taxaPoupancaMedia: Math.round(taxaMedia * 100),
      historico:        janela.map(function(k) {
        return { mesKey: k, receitas: agregado[k].receitas, despesas: agregado[k].despesas };
      })
    };
  },

  // ─────────────────────────────────────────────────────────────────
  // DETECÇÃO DE ANOMALIAS
  // ─────────────────────────────────────────────────────────────────

  /**
   * Detecta transações anômalas por categoria usando IQR.
   * @param {Array} transacoes
   * @returns {Array} [{ transacao, motivo, zscore }]
   */
  detectarAnomalias: function(transacoes) {
    if (!Array.isArray(transacoes) || transacoes.length < 5) return [];

    var porCategoria = {};
    transacoes.forEach(function(t) {
      if (t.tipo !== 'despesa') return;
      var cat = t.categoria || 'outro';
      if (!porCategoria[cat]) porCategoria[cat] = [];
      porCategoria[cat].push(t);
    });

    var anomalias = [];
    var self      = this;

    Object.keys(porCategoria).forEach(function(cat) {
      var txs    = porCategoria[cat];
      if (txs.length < 3) return;

      var valores = txs.map(function(t) { return Number(t.valor) || 0; });
      var est     = self.estatisticas(valores);
      if (est.desvio === 0) return;

      txs.forEach(function(t) {
        var z = (Number(t.valor) - est.media) / est.desvio;
        if (z > 2.5) {
          anomalias.push({
            transacao: t,
            motivo: 'Valor ' + Math.round(z) + 'x acima da média em ' + cat,
            zscore: Math.round(z * 10) / 10
          });
        }
      });
    });

    // Ordenar por zscore descendente
    anomalias.sort(function(a, b) { return b.zscore - a.zscore; });
    return anomalias.slice(0, 5);
  },

  // ─────────────────────────────────────────────────────────────────
  // SAÚDE FINANCEIRA
  // ─────────────────────────────────────────────────────────────────

  /**
   * Calcula score de saúde financeira (0–100).
   * Pontuação baseada em: taxa de poupança, consistência, diversificação de receitas.
   * @param {Array} transacoes
   * @param {Object} config — DADOS.getConfig()
   * @returns {{ score, nivel, detalhes }}
   */
  calcularSaude: function(transacoes, config) {
    config = config || {};
    var agregado = this.agregarPorMes(transacoes);
    var chaves   = Object.keys(agregado).sort().slice(-3); // últimos 3 meses

    if (chaves.length === 0) return { score: 0, nivel: 'sem-dados', detalhes: [] };

    var detalhes = [];
    var pontos   = 0;

    // 1. Taxa de poupança (40 pontos)
    var taxas = chaves.map(function(k) {
      var d = agregado[k];
      return d.receitas > 0 ? (d.receitas - d.despesas) / d.receitas : -1;
    });
    var taxaMedia = taxas.reduce(function(a, b) { return a + b; }, 0) / taxas.length;

    if (taxaMedia >= 0.20)       { pontos += 40; detalhes.push({ item: 'Taxa de poupança', ok: true,  desc: Math.round(taxaMedia * 100) + '%' }); }
    else if (taxaMedia >= 0.10)  { pontos += 20; detalhes.push({ item: 'Taxa de poupança', ok: false, desc: Math.round(taxaMedia * 100) + '% (meta: 20%)' }); }
    else if (taxaMedia >= 0)     { pontos += 10; detalhes.push({ item: 'Taxa de poupança', ok: false, desc: Math.round(taxaMedia * 100) + '% (meta: 20%)' }); }
    else                         {               detalhes.push({ item: 'Taxa de poupança', ok: false, desc: 'Gastando mais do que ganha' }); }

    // 2. Consistência (não estourar meses negativos) (30 pontos)
    var mesesNegativos = chaves.filter(function(k) { return agregado[k].saldo < 0; }).length;
    if (mesesNegativos === 0)       { pontos += 30; detalhes.push({ item: 'Saldo consistente', ok: true,  desc: 'Todos os meses positivos' }); }
    else if (mesesNegativos === 1)  { pontos += 15; detalhes.push({ item: 'Saldo consistente', ok: false, desc: '1 mês negativo recente' }); }
    else                            {               detalhes.push({ item: 'Saldo consistente', ok: false, desc: mesesNegativos + ' meses negativos' }); }

    // 3. Diversificação de receitas (15 pontos)
    var recCats = {};
    transacoes.forEach(function(t) {
      if (t.tipo === 'receita') recCats[t.categoria || 'outros'] = true;
    });
    var numRecCats = Object.keys(recCats).length;
    if (numRecCats >= 2)  { pontos += 15; detalhes.push({ item: 'Receitas diversificadas', ok: true,  desc: numRecCats + ' fontes' }); }
    else                  { pontos += 5;  detalhes.push({ item: 'Receitas diversificadas', ok: false, desc: 'Apenas 1 fonte de renda' }); }

    // 4. Orçamentos configurados (15 pontos)
    var orc = config.orcamentos || {};
    if (Object.keys(orc).length >= 3) { pontos += 15; detalhes.push({ item: 'Orçamentos definidos', ok: true,  desc: Object.keys(orc).length + ' categorias' }); }
    else                               { pontos += 5;  detalhes.push({ item: 'Orçamentos definidos', ok: false, desc: 'Configure limites por categoria' }); }

    var nivel = pontos >= 80 ? 'excelente' : pontos >= 60 ? 'bom' : pontos >= 40 ? 'regular' : 'critico';
    return { score: Math.min(100, pontos), nivel: nivel, detalhes: detalhes };
  },

  // ─────────────────────────────────────────────────────────────────
  // ALERTAS INTELIGENTES
  // ─────────────────────────────────────────────────────────────────

  /**
   * Gera lista de alertas baseados em padrões detectados.
   * @param {Array} transacoes
   * @param {Object} config — DADOS.getConfig()
   * @returns {Array} [{ id, tipo, titulo, msg, gravidade, acao, parametros }]
   */
  gerarAlertas: function(transacoes, config) {
    config = config || {};
    var alertas  = [];
    var hoje     = new Date();
    var mesKey   = hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0');
    var agregado = this.agregarPorMes(transacoes);
    var chaves   = Object.keys(agregado).sort();

    // 1. Saldo negativo no mês atual
    var mesSel = agregado[mesKey];
    if (mesSel && mesSel.saldo < 0) {
      alertas.push({
        id: 'saldo-negativo',
        tipo: 'saldo',
        titulo: '🚨 Saldo negativo',
        msg: 'Você está gastando R$ ' + Math.abs(mesSel.saldo).toFixed(2).replace('.', ',') + ' a mais do que recebe este mês.',
        gravidade: 'critica'
      });
    }

    // 2. Orçamentos próximos do limite (≥ 80%)
    var catsMes = this.agregarPorCategoria(transacoes, mesKey);
    var orc     = config.orcamentos || {};
    Object.keys(orc).forEach(function(cat) {
      var limite   = Number(orc[cat]) || 0;
      var gasto    = (catsMes[cat] && catsMes[cat].despesas) || 0;
      var pct      = limite > 0 ? gasto / limite : 0;
      if (pct >= 1.0) {
        alertas.push({
          id: 'orc-excedido-' + cat,
          tipo: 'orcamento',
          titulo: '⚠️ Orçamento excedido',
          msg: cat.charAt(0).toUpperCase() + cat.slice(1) + ': R$ ' + gasto.toFixed(2).replace('.', ',') + ' / R$ ' + limite.toFixed(2).replace('.', ','),
          gravidade: 'alta',
          acao: 'verExtrato',
          parametros: { categoria: cat }
        });
      } else if (pct >= 0.8) {
        alertas.push({
          id: 'orc-alerta-' + cat,
          tipo: 'orcamento',
          titulo: '📊 Orçamento quase no limite',
          msg: cat.charAt(0).toUpperCase() + cat.slice(1) + ': ' + Math.round(pct * 100) + '% usado.',
          gravidade: 'media',
          acao: 'verExtrato',
          parametros: { categoria: cat }
        });
      }
    });

    // 3. Spike de gastos: mês atual vs média dos 3 anteriores
    if (chaves.length >= 3 && mesSel) {
      var anteriores = chaves.filter(function(k) { return k < mesKey; }).slice(-3);
      if (anteriores.length >= 2) {
        var mediaAnterior = anteriores.reduce(function(acc, k) {
          return acc + (agregado[k] ? agregado[k].despesas : 0);
        }, 0) / anteriores.length;

        if (mediaAnterior > 0 && mesSel.despesas > mediaAnterior * 1.3) {
          var variacao = Math.round(((mesSel.despesas / mediaAnterior) - 1) * 100);
          alertas.push({
            id: 'spike-gastos',
            tipo: 'padrao',
            titulo: '📈 Gastos acima do normal',
            msg: 'Suas despesas este mês estão ' + variacao + '% acima da média recente.',
            gravidade: 'media'
          });
        }
      }
    }

    // 4. Renda próxima (recorrentes)
    var recorrentes = config.recorrentes || [];
    var diaMes      = hoje.getDate();
    var diasNoMes   = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
    var diasRestantes = diasNoMes - diaMes;

    recorrentes.forEach(function(r) {
      if (!r || !r.valor || r.pago) return;
      var diaVenc = Number(r.dia) || 0;
      if (diaVenc > diaMes && diaVenc <= diaMes + 5) {
        alertas.push({
          id: 'recorrente-' + (r.id || r.descricao),
          tipo: 'recorrente',
          titulo: '📅 Vencimento próximo',
          msg: '"' + (r.descricao || 'Conta') + '" vence em ' + (diaVenc - diaMes) + ' dia(s) — R$ ' + Number(r.valor).toFixed(2).replace('.', ','),
          gravidade: 'media',
          acao: 'lancarRecorrente',
          parametros: r
        });
      }
    });

    // 5. Sem lançamentos hoje (incentivo)
    var hojeStr = hoje.toISOString().split('T')[0];
    var lancouHoje = transacoes.some(function(t) { return t.data === hojeStr; });
    if (!lancouHoje && diaMes > 3) {
      alertas.push({
        id: 'sem-lancamento',
        tipo: 'habito',
        titulo: '💡 Sem lançamentos hoje',
        msg: 'Registre suas movimentações para manter o controle em dia.',
        gravidade: 'baixa',
        acao: 'abrirNovo',
        parametros: {}
      });
    }

    // 6. Sem receita registrada (alerta após dia 15)
    if (diaMes >= 15 && mesSel && mesSel.receitas === 0) {
      alertas.push({
        id:       'sem-receita',
        tipo:     'habito',
        titulo:   '💰 Nenhuma receita registrada',
        msg:      'Você está no dia ' + diaMes + ' do mês sem lançar nenhuma receita. Registre seu salário ou outras entradas.',
        gravidade: 'alta',
        acao:     'abrirNovo',
        parametros: {}
      });
    }

    // 7. Projeção de saldo negativo no fim do mês
    if (diaMes >= 5 && diasRestantes >= 5 && mesSel && mesSel.receitas > 0) {
      var taxaDiariaDesp = mesSel.despesas / diaMes;
      var projecaoDesp   = Math.round((mesSel.despesas + taxaDiariaDesp * diasRestantes) * 100) / 100;
      var saldoProj      = Math.round((mesSel.receitas - projecaoDesp) * 100) / 100;
      if (saldoProj < 0) {
        alertas.push({
          id:       'projecao-negativa',
          tipo:     'projecao',
          titulo:   '📅 Projeção: saldo negativo',
          msg:      'No ritmo atual, você vai gastar R$ ' + projecaoDesp.toFixed(2).replace('.', ',') + ' este mês — saldo estimado: –R$ ' + Math.abs(saldoProj).toFixed(2).replace('.', ',') + '.',
          gravidade: 'alta'
        });
      }
    }

    return alertas;
  },

  // ─────────────────────────────────────────────────────────────────
  // PADRÕES E CATEGORIAS
  // ─────────────────────────────────────────────────────────────────

  /**
   * Retorna top N categorias de despesa no período.
   * @param {Array} transacoes
   * @param {string} mesKey
   * @param {number} top
   * @returns {Array} [{ categoria, total, percentual }]
   */
  topCategorias: function(transacoes, mesKey, top) {
    top = top || 5;
    var cats = this.agregarPorCategoria(transacoes, mesKey);
    var lista = [];
    var totalDesp = 0;

    Object.keys(cats).forEach(function(cat) {
      if (cats[cat].despesas > 0) {
        lista.push({ categoria: cat, total: cats[cat].despesas });
        totalDesp += cats[cat].despesas;
      }
    });

    lista.sort(function(a, b) { return b.total - a.total; });
    lista = lista.slice(0, top);

    lista.forEach(function(item) {
      item.percentual = totalDesp > 0 ? Math.round((item.total / totalDesp) * 100) : 0;
    });

    return lista;
  },

  /**
   * Detecta padrões de gastos recorrentes ainda não marcados como recorrentes.
   * @param {Array} transacoes
   * @returns {Array} [{ descricao, meses, valorMedio }]
   */
  detectarPadroesRecorrentes: function(transacoes) {
    var freq = {};

    transacoes.forEach(function(t) {
      if (t.tipo !== 'despesa' || !t.descricao) return;
      var key = String(t.descricao).toLowerCase().replace(/\s*\(\d+\/\d+\)/, '').trim().slice(0, 30);
      if (!key || key.length < 3) return;
      var mes = String(t.data).slice(0, 7);
      if (!freq[key]) freq[key] = { meses: {}, valores: [] };
      freq[key].meses[mes] = true;
      freq[key].valores.push(Number(t.valor) || 0);
    });

    var padroes = [];
    Object.keys(freq).forEach(function(key) {
      var meses = Object.keys(freq[key].meses);
      if (meses.length >= 3) {
        var vals   = freq[key].valores;
        var media  = vals.reduce(function(a, b) { return a + b; }, 0) / vals.length;
        padroes.push({
          descricao:   key,
          meses:       meses.length,
          valorMedio:  Math.round(media * 100) / 100
        });
      }
    });

    padroes.sort(function(a, b) { return b.meses - a.meses; });
    return padroes.slice(0, 5);
  },

  // ─────────────────────────────────────────────────────────────────
  // PROJEÇÕES E METAS
  // ─────────────────────────────────────────────────────────────────

  /**
   * Projeta despesas até o fim do mês com base na taxa diária atual.
   * @param {Array} transacoes
   * @returns {{ projecaoDespesas, projecaoReceitas, saldoProjetado, diasRestantes, diasDecorridos, dadosInsuficientes }}
   */
  projetarFimMes: function(transacoes) {
    var hoje           = new Date();
    var mesKey         = hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0');
    var diasDecorridos = hoje.getDate();
    var diasNoMes      = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
    var diasRestantes  = diasNoMes - diasDecorridos;

    if (diasDecorridos < 3) {
      return { dadosInsuficientes: true, diasDecorridos: diasDecorridos, diasRestantes: diasRestantes };
    }

    var txMes = Array.isArray(transacoes) ? transacoes.filter(function(t) {
      return t && t.data && String(t.data).slice(0, 7) === mesKey;
    }) : [];

    var despesas = txMes.reduce(function(a, t) { return t.tipo === 'despesa' ? a + (Number(t.valor) || 0) : a; }, 0);
    var receitas = txMes.reduce(function(a, t) { return t.tipo === 'receita' ? a + (Number(t.valor) || 0) : a; }, 0);

    var taxaDiaria       = despesas / diasDecorridos;
    var projecaoDespesas = Math.round((despesas + taxaDiaria * diasRestantes) * 100) / 100;
    var saldoProjetado   = Math.round((receitas - projecaoDespesas) * 100) / 100;

    return {
      projecaoDespesas:   projecaoDespesas,
      projecaoReceitas:   receitas,
      saldoProjetado:     saldoProjetado,
      diasRestantes:      diasRestantes,
      diasDecorridos:     diasDecorridos,
      dadosInsuficientes: false
    };
  },

  /**
   * Compara despesas por categoria entre mês atual e anterior.
   * @param {Array} transacoes
   * @param {string} mesKey — 'YYYY-MM'
   * @returns {Array} [{ categoria, atual, anterior, variacao, tendencia }] ordenado por valor atual desc
   */
  compararCategoriasMoM: function(transacoes, mesKey) {
    var partes = (mesKey || '').split('-');
    var ano    = parseInt(partes[0], 10);
    var mes    = parseInt(partes[1], 10);
    var mesAnt = mes === 1
      ? (ano - 1) + '-12'
      : ano + '-' + String(mes - 1).padStart(2, '0');

    var catsAtual = this.agregarPorCategoria(transacoes, mesKey);
    var catsAnt   = this.agregarPorCategoria(transacoes, mesAnt);

    var todas = {};
    Object.keys(catsAtual).forEach(function(c) { todas[c] = true; });
    Object.keys(catsAnt).forEach(function(c) { todas[c] = true; });

    var resultado = [];
    Object.keys(todas).forEach(function(cat) {
      var atual    = (catsAtual[cat] ? catsAtual[cat].despesas : 0) || 0;
      var anterior = (catsAnt[cat]   ? catsAnt[cat].despesas   : 0) || 0;
      if (atual === 0 && anterior === 0) return;
      var variacao  = anterior > 0 ? Math.round(((atual - anterior) / anterior) * 100) : null;
      resultado.push({
        categoria: cat,
        atual:     atual,
        anterior:  anterior,
        variacao:  variacao,
        tendencia: variacao === null ? 'novo' : variacao > 15 ? 'subindo' : variacao < -15 ? 'caindo' : 'estavel'
      });
    });

    resultado.sort(function(a, b) { return b.atual - a.atual; });
    return resultado;
  },

  /**
   * Calcula quanto cortar de gastos para atingir a meta de poupança.
   * @param {Array} transacoes
   * @param {number} metaPoupanca — ex: 0.20 para 20%
   * @returns {{ viavel, corteNecessario, categoriaAlvo, valorAlvo, taxaAtual } | null}
   */
  sugestaoCorte: function(transacoes, metaPoupanca) {
    metaPoupanca = metaPoupanca || 0.20;
    var agregado = this.agregarPorMes(transacoes);
    var chaves   = Object.keys(agregado).sort().slice(-3);
    if (chaves.length === 0) return null;

    var recMedia  = chaves.reduce(function(a, k) { return a + agregado[k].receitas; }, 0) / chaves.length;
    var despMedia = chaves.reduce(function(a, k) { return a + agregado[k].despesas; }, 0) / chaves.length;
    if (recMedia === 0) return null;

    var taxaAtual = (recMedia - despMedia) / recMedia;
    if (taxaAtual >= metaPoupanca) {
      return { viavel: true, corteNecessario: 0, categoriaAlvo: null, taxaAtual: Math.round(taxaAtual * 100) };
    }

    var despMeta = recMedia * (1 - metaPoupanca);
    var corte    = Math.max(0, Math.round((despMedia - despMeta) * 100) / 100);

    var mesRef = chaves[chaves.length - 1];
    var cats   = this.agregarPorCategoria(transacoes, mesRef);

    var naoEssenciais = ['lazer', 'alimentacao', 'outro'];
    var categoriaAlvo = null, valorAlvo = 0;
    naoEssenciais.forEach(function(cat) {
      if (cats[cat] && cats[cat].despesas > valorAlvo) {
        valorAlvo     = cats[cat].despesas;
        categoriaAlvo = cat;
      }
    });

    if (!categoriaAlvo) {
      Object.keys(cats).forEach(function(cat) {
        if (cats[cat].despesas > valorAlvo) {
          valorAlvo     = cats[cat].despesas;
          categoriaAlvo = cat;
        }
      });
    }

    return {
      viavel:          true,
      corteNecessario: corte,
      categoriaAlvo:   categoriaAlvo,
      valorAlvo:       Math.round(valorAlvo * 100) / 100,
      taxaAtual:       Math.round(taxaAtual * 100)
    };
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AI_ENGINE;
}
