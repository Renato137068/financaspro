/**
 * init-relatorios.js — Painel de relatório mensal no dashboard
 */
const INIT_RELATORIOS = {
  render: function() {
    var el = document.getElementById('relatorios-panel');
    if (!el || typeof RELATORIOS === 'undefined') return;

    var agora = new Date();
    var mes = agora.getMonth() + 1;
    var ano = agora.getFullYear();
    var cmp = RELATORIOS.compararMesAnterior(mes, ano);
    if (!cmp) {
      el.innerHTML = '<p class="rel-empty">Sem dados suficientes para o relatório.</p>';
      return;
    }

    var a = cmp.atual;
    var nomeMes = agora.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    nomeMes = nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1);

    function fmtDiff(v) {
      var s = v >= 0 ? '+' : '';
      return s + UTILS.formatarMoeda(v);
    }

    var html = '<div class="rel-header"><h3>' + UTILS.escapeHtml(nomeMes) + '</h3>' +
      '<span class="rel-tx-count">' + a.transacoes + ' lançamentos</span></div>' +
      '<div class="rel-kpis">' +
        '<div class="rel-kpi rel-kpi--rec"><span>Receitas</span><strong>' + UTILS.formatarMoeda(a.receitas) + '</strong>' +
          '<small>' + fmtDiff(cmp.diffReceitas) + ' vs mês ant.</small></div>' +
        '<div class="rel-kpi rel-kpi--desp"><span>Despesas</span><strong>' + UTILS.formatarMoeda(a.despesas) + '</strong>' +
          '<small>' + fmtDiff(cmp.diffDespesas) + ' vs mês ant.</small></div>' +
        '<div class="rel-kpi rel-kpi--saldo"><span>Saldo</span><strong>' + UTILS.formatarMoeda(a.saldo) + '</strong>' +
          '<small>' + fmtDiff(cmp.diffSaldo) + ' vs mês ant.</small></div>' +
      '</div>';

    if (a.topCategorias.length > 0) {
      html += '<h4 class="rel-subtitle">Top despesas por categoria</h4><ul class="rel-cat-list">';
      a.topCategorias.forEach(function(c) {
        html += '<li class="rel-cat-item"><span class="rel-cat-name">' + UTILS.escapeHtml(c.label) + '</span>' +
          '<span class="rel-cat-bar-wrap"><span class="rel-cat-bar" style="width:' + c.percentual + '%"></span></span>' +
          '<span class="rel-cat-val">' + UTILS.formatarMoeda(c.valor) + ' (' + c.percentual + '%)</span></li>';
      });
      html += '</ul>';
    }

    if (typeof ASSINATURAS !== 'undefined') {
      var subTotal = ASSINATURAS.totalMensal();
      if (subTotal > 0) {
        var pctRenda = a.despesas > 0 ? Math.round((subTotal / a.despesas) * 100) : 0;
        html += '<p class="rel-insight"><i data-lucide="tv" aria-hidden="true"></i> Assinaturas representam ' +
          UTILS.formatarMoeda(subTotal) + '/mês (' + pctRenda + '% das despesas do mês).</p>';
      }
    }

    el.innerHTML = html;
    if (typeof renderLucideIconsNow === 'function') renderLucideIconsNow(el);
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = INIT_RELATORIOS;
}
