// FinançasPro — ComparacaoMes: badge de variação vs mês anterior
// v11.0 — sem dependências externas
// inverso=true para despesas (alta = ruim)
(function() {
  var UI = window.UI || {};

  UI.ComparacaoMes = {
    // html(atual, anterior, inverso?) → string span para innerHTML
    html: function(atual, anterior, inverso) {
      if (!anterior || anterior === 0) return '<span class="comp-neutro">—</span>';
      var diff = ((atual - anterior) / anterior) * 100;
      var arred = Math.round(diff);
      // Variação que arredonda a 0% é estável: nada de "↑ +0%" nem "↓ -0%"
      // (o toFixed(0) de -0,3 vira "-0"), que mostram sinal e seta falsos.
      if (arred === 0) return '<span class="comp-neutro">≈ 0% vs mês ant.</span>';
      var bom = inverso ? arred < 0 : arred > 0;
      var classe = bom ? 'comp-bom' : 'comp-ruim';
      var seta = arred > 0 ? '↑' : '↓';
      var diffStr = (arred > 0 ? '+' : '') + arred + '%';
      return '<span class="' + classe + '">' + seta + ' ' + diffStr + ' vs mês ant.</span>';
    },

    // render(atual, anterior, inverso?) → HTMLElement
    render: function(atual, anterior, inverso) {
      var span = document.createElement('span');
      if (!anterior || anterior === 0) {
        span.className = 'comp-neutro';
        span.textContent = '—';
        return span;
      }
      var diff = ((atual - anterior) / anterior) * 100;
      var arred = Math.round(diff);
      if (arred === 0) {
        span.className = 'comp-neutro';
        span.textContent = '≈ 0% vs mês ant.';
        return span;
      }
      var bom = inverso ? arred < 0 : arred > 0;
      span.className = bom ? 'comp-bom' : 'comp-ruim';
      span.textContent = (arred > 0 ? '↑ +' : '↓ ') + arred + '% vs mês ant.';
      return span;
    }
  };

  window.UI = UI;
})();
