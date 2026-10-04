/**
 * resumo-anual.js — texto compartilhável da retrospectiva do ano.
 *
 * O "seu ano em números": total de receitas e despesas, quanto sobrou, a taxa
 * de poupança e os meses mais caro e mais econômico. Reaproveita
 * RELATORIOS.resumoAno (que já ignora o mês corrente incompleto na disputa de
 * maior/menor). Só leitura, sem DOM.
 *
 * ES Module (ADR 0005): os scripts clássicos o recebem como global por
 * js/esm/ponte.js.
 */

import { UTILS } from './core/utils.js';
const RESUMO_ANUAL = {

  MESES: ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'],

  _fmt: function(v) {
    return (typeof UTILS !== 'undefined' && UTILS.formatarMoeda)
      ? UTILS.formatarMoeda(v)
      : ('R$ ' + Number(v).toFixed(2));
  },

  _nomeMes: function(mes) {
    var n = RESUMO_ANUAL.MESES[mes - 1] || '';
    return n.charAt(0).toUpperCase() + n.slice(1);
  },

  /**
   * Texto pronto para compartilhar. null quando o ano tem poucos dados (menos
   * de 2 meses) — uma retrospectiva de um mês só não é retrospectiva.
   */
  texto: function(ano, hoje) {
    if (typeof RELATORIOS === 'undefined' || !RELATORIOS.resumoAno) return null;
    var r = RELATORIOS.resumoAno(ano, hoje);
    if (!r || !r.mesesComDados || r.mesesComDados < 2) return null;

    var out = [];
    out.push('Meu ' + ano + ' em números');
    out.push('');
    out.push('Receitas: ' + RESUMO_ANUAL._fmt(r.receitas));
    out.push('Despesas: ' + RESUMO_ANUAL._fmt(r.despesas));

    if (r.saldo >= 0) {
      out.push('Sobrou: ' + RESUMO_ANUAL._fmt(r.saldo));
      if (r.taxaPoupanca != null && r.taxaPoupanca > 0) {
        out.push('Você poupou ' + r.taxaPoupanca + '% do que ganhou');
      }
    } else {
      out.push('Faltou: ' + RESUMO_ANUAL._fmt(Math.abs(r.saldo)) + ' (o ano fechou no vermelho)');
    }

    out.push('Média de gastos por mês: ' + RESUMO_ANUAL._fmt(r.mediaDespesaMensal));
    if (r.maiorDespesaMes) {
      out.push('Mês mais caro: ' + RESUMO_ANUAL._nomeMes(r.maiorDespesaMes.mes) + ' (' + RESUMO_ANUAL._fmt(r.maiorDespesaMes.despesas) + ')');
    }
    if (r.menorDespesaMes && (!r.maiorDespesaMes || r.menorDespesaMes.mes !== r.maiorDespesaMes.mes)) {
      out.push('Mês mais econômico: ' + RESUMO_ANUAL._nomeMes(r.menorDespesaMes.mes) + ' (' + RESUMO_ANUAL._fmt(r.menorDespesaMes.despesas) + ')');
    }

    out.push('');
    out.push('Organizado no FinançasPro');
    return out.join('\n');
  }
};

export { RESUMO_ANUAL };
export default RESUMO_ANUAL;
