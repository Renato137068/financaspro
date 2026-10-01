/**
 * extrato/resumo.js — o resumo do mês (saldo, receitas, despesas e a tendência contra o mês anterior).
 *
 * Parte de INIT_EXTRATO (js/modules/init-extrato.js, que importa todas as
 * partes): cada uma acrescenta seus métodos ao mesmo objeto, criado em
 * extrato/base.js. Os métodos continuam se chamando por INIT_EXTRATO.x.
 */

import { INIT_EXTRATO, _extratoCent } from './base.js';
import { CONFIG } from '../../core/config.js';
import { UTILS } from '../../core/utils.js';
import { TRANSACOES } from '../../transacoes.js';

Object.assign(INIT_EXTRATO, {

  /**
   * Renderiza o resumo do extrato
   */
  renderExtratoResumo: function(txs) {
    var recC = 0, despC = 0;
    txs.forEach(function(t) {
      if (t.tipo === CONFIG.TIPO_RECEITA) recC += _extratoCent(t.valor);
      else if (t.tipo === CONFIG.TIPO_DESPESA) despC += _extratoCent(t.valor);
    });
    var rec = recC / 100, desp = despC / 100;
    var saldo = (recC - despC) / 100;

    // Atualizar card principal de saldo
    var saldoEl = document.getElementById('saldo-valor');
    if (saldoEl) saldoEl.textContent = UTILS.formatarMoeda(saldo);

    // Calcular tendência vs mês anterior
    var info = INIT_EXTRATO.getExtratoMesAno();
    var mesAnterior = new Date(info.date);
    mesAnterior.setMonth(mesAnterior.getMonth() - 1);
    var txsAnterior = TRANSACOES.obter({
      mes: mesAnterior.getMonth() + 1,
      ano: mesAnterior.getFullYear()
    });
    // No mês CORRENTE, o saldo do período é parcial (só os dias decorridos).
    // Comparar esse parcial com o mês anterior INTEIRO fazia o selo aparecer
    // "pior" quase todo começo de mês. A correção compara o MESMO intervalo:
    // 1..dia de hoje, dos dois lados. Em meses já fechados, compara cheio×cheio.
    var hoje = new Date();
    var ehMesCorrente = info.mes === (hoje.getMonth() + 1) && info.ano === hoje.getFullYear();
    var diaLimite = ehMesCorrente ? hoje.getDate() : null;
    function somaSaldoAte(lista, limite) {
      var sc = 0;
      lista.forEach(function(t) {
        if (limite != null) {
          var dia = parseInt(String(t.data || '').split('-')[2], 10);
          if (!dia || dia > limite) return;
        }
        if (t.tipo === CONFIG.TIPO_RECEITA) sc += _extratoCent(t.valor);
        else if (t.tipo === CONFIG.TIPO_DESPESA) sc -= _extratoCent(t.valor);
      });
      return sc / 100;
    }
    var saldoAnterior = somaSaldoAte(txsAnterior, diaLimite);
    var saldoAtual = ehMesCorrente ? somaSaldoAte(txs, diaLimite) : saldo;

    // Sem base de comparação (mês anterior sem lançamentos no intervalo, ou
    // saldo líquido exatamente zero) não dá para calcular variação percentual:
    // mostrar "+0,0% vs mês anterior" sugeria estabilidade contra um mês que não
    // existiu. Nesses casos, esconde o selo de tendência em vez de inventar 0%.
    var temBase = saldoAnterior !== 0;
    var trendWrap = document.getElementById('saldo-trend');
    if (trendWrap) trendWrap.style.display = temBase ? '' : 'none';

    if (temBase) {
      var trendValue = ((saldoAtual - saldoAnterior) / Math.abs(saldoAnterior)) * 100;
      // Deixa claro que, no mês em curso, a comparação é do mesmo intervalo.
      var trendLabelEl = document.getElementById('trend-label');
      if (trendLabelEl) trendLabelEl.textContent = ehMesCorrente ? 'vs mesmo período' : 'vs mês anterior';
      if (trendWrap) {
        trendWrap.setAttribute('aria-label', ehMesCorrente
          ? 'Tendência vs mesmo período do mês anterior'
          : 'Tendência vs mês anterior');
      }
      var trendIcon = trendValue >= 0
        ? '<i data-lucide="trending-up" aria-hidden="true"></i>'
        : '<i data-lucide="trending-down" aria-hidden="true"></i>';

      var trendEl = document.getElementById('trend-value');
      var trendIconEl = document.getElementById('trend-icon');
      if (trendEl) trendEl.textContent = (trendValue >= 0 ? '+' : '') + trendValue.toFixed(1) + '%';
      if (trendIconEl) {
        // innerHTML (não textContent) para o markup do ícone ser interpretado,
        // seguido de re-render do Lucide para transformar <i data-lucide> em SVG.
        trendIconEl.innerHTML = trendIcon;
        if (typeof renderLucideIconsNow === 'function') renderLucideIconsNow(trendIconEl);
      }
    }

    // Atualizar período
    var periodEl = document.getElementById('saldo-period');
    if (periodEl) {
      var ultimoDia = new Date(info.ano, info.mes, 0).getDate();
      var nomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
      periodEl.textContent = '1 a ' + ultimoDia + ' de ' + nomes[info.mes - 1];
    }

    // Atualizar KPIs
    var kpiEntradas = document.getElementById('kpi-entradas');
    var kpiSaidas = document.getElementById('kpi-saidas');
    var kpiMovimentacoes = document.getElementById('kpi-movimentacoes');
    if (kpiEntradas) kpiEntradas.textContent = UTILS.formatarMoeda(rec);
    if (kpiSaidas) kpiSaidas.textContent = UTILS.formatarMoeda(desp);
    if (kpiMovimentacoes) kpiMovimentacoes.textContent = txs.length;

    var anuncio = document.getElementById('extrato-resumo-anuncio');
    if (anuncio) {
      var periodoTxt = periodEl ? periodEl.textContent : '';
      var resumoTxt = periodoTxt + ': saldo ' + UTILS.formatarMoeda(saldo) +
        ', entradas ' + UTILS.formatarMoeda(rec) +
        ', saídas ' + UTILS.formatarMoeda(desp) +
        ', ' + txs.length + ' movimentações';
      if (resumoTxt !== INIT_EXTRATO._ultimoResumoAnunciado) {
        INIT_EXTRATO._ultimoResumoAnunciado = resumoTxt;
        anuncio.textContent = resumoTxt;
      }
    }
  },
});
