/**
 * insights.js — Insights financeiros inteligentes
 * v11.0 — Fase 8: integrado com AI_ENGINE para análises mais ricas
 * Depende de: ai-engine.js, dados.js, utils.js
 */

var INSIGHTS = {

  // ─────────────────────────────────────────────────────────────────
  // ANÁLISE PRINCIPAL
  // ─────────────────────────────────────────────────────────────────

  /**
   * Gera lista de insights combinando análises clássicas e AI_ENGINE.
   * @returns {Array} [{ tipo, msg, gravidade, acao, parametros, botao }]
   */
  analisar: function() {
    var insights = [];
    var txs      = typeof TRANSACOES !== 'undefined' ? TRANSACOES.obter() : (typeof DADOS !== 'undefined' ? DADOS.getTransacoes() : []);
    var agora    = new Date();
    var mesAtual = agora.getMonth() + 1;
    var anoAtual = agora.getFullYear();
    var mesKey   = anoAtual + '-' + String(mesAtual).padStart(2, '0');

    if (!Array.isArray(txs) || txs.length === 0) return insights;

    // ── 1. Variação de despesas (AI_ENGINE.agregarPorMes) ──────────
    var agregado = AI_ENGINE.agregarPorMes(txs);
    var chaves   = Object.keys(agregado).sort();

    if (chaves.length >= 2) {
      var keyAtual    = chaves[chaves.length - 1];
      var keyAnterior = chaves[chaves.length - 2];
      var despAtual   = agregado[keyAtual].despesas;
      var despAnt     = agregado[keyAnterior].despesas;

      if (despAnt > 0) {
        var variacao = Math.round(((despAtual - despAnt) / despAnt) * 100);
        if (Math.abs(variacao) > 15) {
          insights.push({
            tipo:      'variacao',
            msg:       'Gastos ' + (variacao > 0 ? '📈 aumentaram' : '📉 diminuíram') + ' ' + Math.abs(variacao) + '% em relação ao mês anterior.',
            gravidade: Math.abs(variacao) > 40 ? 'alta' : 'media'
          });
        }
      }
    }

    // ── 2. Projeção de fim de mês ──────────────────────────────────
    if (typeof AI_ENGINE.projetarFimMes === 'function') {
      var proj = AI_ENGINE.projetarFimMes(txs);
      if (!proj.dadosInsuficientes && proj.projecaoReceitas > 0) {
        if (proj.saldoProjetado >= 0) {
          insights.push({
            tipo:      'projecao',
            msg:       '📅 Projeção: você vai fechar o mês com saldo de +R$ ' + proj.saldoProjetado.toFixed(2).replace('.', ',') + '.',
            gravidade: 'baixa'
          });
        } else {
          insights.push({
            tipo:      'projecao',
            msg:       '📅 Projeção: no ritmo atual, saldo negativo de –R$ ' + Math.abs(proj.saldoProjetado).toFixed(2).replace('.', ',') + ' ao fim do mês.',
            gravidade: 'alta'
          });
        }
      }
    }

    // ── 2. Top categoria de gasto do mês ──────────────────────────
    var topCats = AI_ENGINE.topCategorias(txs, mesKey, 1);
    if (topCats.length > 0) {
      var top = topCats[0];
      if (top.percentual >= 35) {
        var catLabel = (typeof CONFIG !== 'undefined' && CONFIG.getCatLabel) ? CONFIG.getCatLabel(top.categoria) : top.categoria;
        insights.push({
          tipo:      'concentracao',
          msg:       '📌 ' + Math.round(top.percentual) + '% dos gastos em ' + catLabel + ' (R$ ' + top.total.toFixed(2).replace('.', ',') + ').',
          gravidade: top.percentual >= 50 ? 'alta' : 'media'
        });
      }
    }

    // ── 3. Categorias acima do orçamento ──────────────────────────
    if (typeof ORCAMENTO !== 'undefined') {
      var resumoCat = {};
      if (typeof TRANSACOES !== 'undefined' && typeof TRANSACOES.obterResumoPorCategoria === 'function') {
        resumoCat = TRANSACOES.obterResumoPorCategoria(mesAtual, anoAtual);
      } else {
        resumoCat = AI_ENGINE.agregarPorCategoria(txs, mesKey);
        // Normalizar: resumoCat[cat].despesa vs .despesas
        Object.keys(resumoCat).forEach(function(c) {
          resumoCat[c].despesa = resumoCat[c].despesas || 0;
        });
      }

      Object.keys(resumoCat).forEach(function(cat) {
        var orcCat = ORCAMENTO.obterLimite(cat);
        if (orcCat && resumoCat[cat].despesa > orcCat) {
          var excesso = resumoCat[cat].despesa - orcCat;
          var pct     = Math.round((excesso / orcCat) * 100);
          insights.push({
            tipo:       'orcamento',
            categoria:  cat,
            msg:        (CONFIG && CONFIG.getCatLabel ? CONFIG.getCatLabel(cat) : cat) + ' excedido em ' + pct + '%.',
            gravidade:  'alta',
            acao:       'aumentarLimite',
            parametros: { categoria: cat, novoLimite: Math.round(resumoCat[cat].despesa * 1.2 * 100) / 100 },
            botao:      '⬆️ Ajustar limite'
          });
        }
      });
    }

    // ── 4. Saúde financeira abaixo do ideal ───────────────────────
    var config = typeof DADOS !== 'undefined' ? DADOS.getConfig() : {};
    var saude  = AI_ENGINE.calcularSaude(txs, config);
    if (saude.score < 50) {
      insights.push({
        tipo:      'saude',
        msg:       '💪 Saúde financeira: ' + saude.score + '/100 (' + saude.nivel + '). ' +
                   saude.detalhes.filter(function(d) { return !d.ok; }).map(function(d) { return d.item; }).join(', ') + '.',
        gravidade: saude.score < 30 ? 'alta' : 'media'
      });
    }

    // ── 5. Reforço positivo ────────────────────────────────────────
    if (saude.score >= 70) {
      insights.push({
        tipo:      'reforco',
        msg:       '🎉 Parabéns! Saúde financeira em ' + saude.score + '/100 — continue assim!',
        gravidade: 'baixa'
      });
    }

    // ── 5. Padrão de gastos hoje ───────────────────────────────────
    var hoje    = new Date();
    var diaAtual = hoje.getDate();
    var gastoHoje = txs.filter(function(t) {
      return t.tipo === 'despesa' && parseInt((t.data || '').split('-')[2], 10) === diaAtual;
    }).reduce(function(a, t) { return a + (Number(t.valor) || 0); }, 0);

    var mediaDesp = txs.filter(function(t) { return t.tipo === 'despesa'; })
      .reduce(function(a, t) { return a + (Number(t.valor) || 0); }, 0) / Math.max(txs.length, 1);

    if (gastoHoje > mediaDesp * 2 && gastoHoje > 50) {
      insights.push({
        tipo:      'padrao',
        msg:       '⚡ Gasto alto hoje: R$ ' + gastoHoje.toFixed(2).replace('.', ',') + ' (mais que o dobro da média por transação).',
        gravidade: 'media'
      });
    }

    // ── 6. Recorrências não configuradas (AI_ENGINE) ───────────────
    var padroesRec = AI_ENGINE.detectarPadroesRecorrentes(txs);
    padroesRec.slice(0, 2).forEach(function(p) {
      insights.push({
        tipo:       'recorrencia',
        msg:        '🔁 "' + p.descricao + '" aparece há ' + p.meses + ' meses (média R$ ' + p.valorMedio.toFixed(2).replace('.', ',') + ').',
        gravidade:  'media',
        acao:       'marcarRecorrente',
        parametros: { descricao: p.descricao },
        botao:      '🔁 Marcar recorrente'
      });
    });

    // ── 7. Tendência de poupança (AI_ENGINE.prever) ────────────────
    var prev = AI_ENGINE.prever(txs, 1);
    if (prev.taxaPoupancaMedia < 0 && prev.tendencia !== 'insuficiente') {
      insights.push({
        tipo:      'poupanca',
        msg:       '⚠️ Taxa de poupança média negativa. Você tem gastado mais do que ganha.',
        gravidade: 'alta'
      });
    } else if (prev.taxaPoupancaMedia > 0 && prev.taxaPoupancaMedia < 10 && prev.tendencia !== 'insuficiente') {
      insights.push({
        tipo:      'poupanca',
        msg:       '💡 Taxa de poupança: ' + prev.taxaPoupancaMedia + '%. A recomendação é acima de 20%.',
        gravidade: 'media'
      });
    } else if (prev.taxaPoupancaMedia >= 20 && prev.tendencia !== 'insuficiente') {
      insights.push({
        tipo:      'poupanca',
        msg:       '✅ Taxa de poupança de ' + prev.taxaPoupancaMedia + '% — acima da meta de 20%!',
        gravidade: 'baixa'
      });
    }

    // ── 8. Corte sugerido para atingir meta de 20% ────────────────
    if (typeof AI_ENGINE.sugestaoCorte === 'function') {
      var corte = AI_ENGINE.sugestaoCorte(txs, 0.20);
      if (corte && corte.corteNecessario > 0 && corte.categoriaAlvo) {
        var catLabel = (typeof CONFIG !== 'undefined' && CONFIG.getCatLabel) ? CONFIG.getCatLabel(corte.categoriaAlvo) : corte.categoriaAlvo;
        insights.push({
          tipo:      'meta',
          msg:       '🎯 Reduza R$ ' + corte.corteNecessario.toFixed(2).replace('.', ',') + ' em ' + catLabel + ' para atingir 20% de poupança (você está em ' + corte.taxaAtual + '%).',
          gravidade: 'media'
        });
      }
    }

    // ── 9. Anomalia no último lançamento ──────────────────────────
    var anomalias = AI_ENGINE.detectarAnomalias(txs);
    if (anomalias.length > 0) {
      var a = anomalias[0];
      insights.push({
        tipo:      'anomalia',
        msg:       '🔍 Gasto incomum: "' + (a.transacao.descricao || 'Transação') + '" — ' + a.motivo + '.',
        gravidade: 'media'
      });
    }

    // ── 10. Categoria com maior variação MoM ─────────────────────
    if (typeof AI_ENGINE.compararCategoriasMoM === 'function') {
      var compCats = AI_ENGINE.compararCategoriasMoM(txs, mesKey);
      var maiorVar = compCats.filter(function(c) { return c.variacao !== null && Math.abs(c.variacao) >= 30 && c.atual > 20; });
      if (maiorVar.length > 0) {
        var mv = maiorVar[0];
        var mvLabel = (typeof CONFIG !== 'undefined' && CONFIG.getCatLabel) ? CONFIG.getCatLabel(mv.categoria) : mv.categoria;
        insights.push({
          tipo:      'variacao-cat',
          msg:       (mv.variacao > 0 ? '📈' : '📉') + ' ' + mvLabel + ' ' + (mv.variacao > 0 ? 'subiu' : 'caiu') + ' ' + Math.abs(mv.variacao) + '% em relação ao mês passado (R$ ' + mv.atual.toFixed(2).replace('.', ',') + ').',
          gravidade: mv.variacao > 50 ? 'alta' : 'media'
        });
      }
    }

    // Limitar a 7 insights para não sobrecarregar a UI
    return insights.slice(0, 7);
  },

  // ─────────────────────────────────────────────────────────────────
  // RENDERIZAÇÃO
  // ─────────────────────────────────────────────────────────────────

  /**
   * Renderiza insights no container #dashboard-alertas.
   * Nota: alertas.js tem prioridade para #dashboard-alertas.
   * insights.js renderiza em #insights-container quando disponível.
   */
  mostrar: function() {
    var insights  = this.analisar();
    var container = document.getElementById('insights-container') ||
                    document.getElementById('orc-insights');

    if (!container) return;

    if (insights.length === 0) {
      container.innerHTML = '<div class="insight insight-ok">✅ Sem alertas. Finanças em dia!</div>';
      return;
    }

    var escHtml = function(str) {
      if (typeof UTILS !== 'undefined' && typeof UTILS.escapeHtml === 'function') return UTILS.escapeHtml(str);
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    };

    var html = insights.map(function(i) {
      var icon     = i.gravidade === 'alta' ? '⚠️' : i.gravidade === 'media' ? 'ℹ️' : '💡';
      var conteudo = icon + ' ' + i.msg;
      var botao    = '';
      if (i.acao && i.botao) {
        botao = ' <button class="btn-insight" ' +
          'data-insight-action="' + escHtml(i.acao) + '" ' +
          'data-insight-params="' + escHtml(JSON.stringify(i.parametros || {})) + '">' +
          i.botao + '</button>';
      }
      return '<div class="insight insight-' + (i.gravidade || 'baixa') + '">' + conteudo + botao + '</div>';
    }).join('');

    container.innerHTML = html;
  },

  /**
   * Renderiza seção de insights no orçamento (#orc-insights).
   */
  mostrarOrcamento: function() {
    var el = document.getElementById('orc-insights');
    if (!el) return;

    var txs      = typeof DADOS !== 'undefined' ? DADOS.getTransacoes() : [];
    var hoje     = new Date();
    var mesKey   = hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0');
    var topCats  = AI_ENGINE.topCategorias(txs, mesKey, 3);

    if (topCats.length === 0) { el.innerHTML = ''; return; }

    var html = '<div class="orc-insights-titulo">📊 Onde vai seu dinheiro este mês</div>' +
      topCats.map(function(c) {
        var label = (typeof CONFIG !== 'undefined' && CONFIG.getCatLabel) ? CONFIG.getCatLabel(c.categoria) : c.categoria;
        return '<div class="orc-insight-item">' +
          '<span class="orc-insight-cat">' + label + '</span>' +
          '<div class="orc-insight-barra-bg">' +
            '<div class="orc-insight-barra-fill" style="width:' + c.percentual + '%"></div>' +
          '</div>' +
          '<span class="orc-insight-pct">' + c.percentual + '%</span>' +
        '</div>';
      }).join('');

    el.innerHTML = html;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = INSIGHTS;
}
