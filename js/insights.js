/**
 * insights.js - Automatic insights and alerts
 */

var INSIGHTS = {
  analisar: function() {
    var insights = [];
    var agora = new Date();
    var mesAtual = agora.getMonth() + 1;
    var anoAtual = agora.getFullYear();

    // 1. Variação de despesas
    var txs = TRANSACOES.obter();
    var meses = {};

    txs.forEach(function(t) {
      if (t.tipo !== 'despesa') return;
      var key = t.data.slice(0, 7);
      meses[key] = (meses[key] || 0) + t.valor;
    });

    var chaves = Object.keys(meses).sort();
    if (chaves.length >= 2) {
      var atual = meses[chaves[chaves.length - 1]] || 0;
      var anterior = meses[chaves[chaves.length - 2]] || 0;

      if (anterior > 0) {
        var variacao = ((atual - anterior) / anterior * 100).toFixed(0);

        if (Math.abs(variacao) > 20) {
          insights.push({
            tipo: 'variacao',
            msg: 'Gastos ' + (variacao > 0 ? '📈 aumentaram' : '📉 diminuíram') + ' ' + Math.abs(variacao) + '%',
            gravidade: Math.abs(variacao) > 50 ? 'alta' : 'media'
          });
        }
      }
    }

    // 2. Categorias acima do orçamento
    var resumoCat = TRANSACOES.obterResumoPorCategoria(mesAtual, anoAtual);
    var config = DADOS.getConfig();

    Object.keys(resumoCat).forEach(function(cat) {
      // Usar ORCAMENTO.obterLimite() — retorna número, não {limite, definidoEm}
      var orcCat = typeof ORCAMENTO !== 'undefined' ? ORCAMENTO.obterLimite(cat) : null;
      if (orcCat && resumoCat[cat].despesa > orcCat) {
        var excesso = resumoCat[cat].despesa - orcCat;
        var pct = ((excesso / orcCat) * 100).toFixed(0);
        insights.push({
          tipo: 'orcamento',
          categoria: cat,
          msg: UTILS.labelCategoria(cat) + ' excedido em ' + pct + '%',
          gravidade: 'alta',
          acao: 'aumentarLimite',
          parametros: {
            categoria: cat,
            novoLimite: Math.round(resumoCat[cat].despesa * 1.2 * 100) / 100
          },
          botao: '⬆️ Aumentar limite'
        });
      }
    });

    // 3. Padrão de gastos (mesmo dia do mês)
    var hoje = new Date();
    var diaAtual = hoje.getDate();
    var gastoHoje = txs.filter(function(t) {
      return t.tipo === 'despesa' && parseInt(t.data.split('-')[2]) === diaAtual;
    }).reduce(function(a, t) { return a + t.valor; }, 0);

    var mediaGastos = txs.filter(function(t) { return t.tipo === 'despesa'; })
      .reduce(function(a, t) { return a + t.valor; }, 0) / Math.max(txs.length, 1);

    if (gastoHoje > mediaGastos * 2) {
      insights.push({
        tipo: 'padrao',
        msg: 'Gasto alto hoje: R$ ' + gastoHoje.toFixed(2),
        gravidade: 'media'
      });
    }

    // 4. Recorrências não configuradas
    var frequencias = {};
    txs.forEach(function(t) {
      if (t.tipo !== 'despesa') return;
      var key = (t.descricao || '').toLowerCase().replace(/\s*\(\d+\/\d+\)/, '').trim().slice(0, 25);
      if (!key || key.length < 3) return;
      if (!frequencias[key]) frequencias[key] = {};
      frequencias[key][t.data.slice(0, 7)] = true;
    });

    Object.keys(frequencias).forEach(function(key) {
      var meses = Object.keys(frequencias[key]);
      if (meses.length >= 3) {
        insights.push({
          tipo: 'recorrencia',
          msg: '"' + key + '" aparece há ' + meses.length + ' meses',
          gravidade: 'media',
          acao: 'marcarRecorrente',
          parametros: {descricao: key},
          botao: '🔁 Marcar recorrente'
        });
      }
    });

    retur