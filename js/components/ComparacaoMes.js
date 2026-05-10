/**
 * ComparacaoMes — badge de variação vs mês anterior
 * API: UI.ComparacaoMes.html(atual, anterior, inverso?) → string HTML
 *      UI.ComparacaoMes.render(atual, anterior, inverso?) → Element
 */
(function() {
  var UI = window.UI || {};

  UI.ComparacaoMes = {
    /**
     * @param {number} atual
     * @param {number} anterior
     * @param {boolean} [inverso] - true para despesas (alta = ruim)
     * @returns {string} span HTML
     */
    html: function(atual, anterior, inverso) {
      if (!anterior || anterior === 0) return '<span class="comp-neutro">—</span>';
      var diff = ((atual - anterior) / anterior) * 100;
      var diffStr = (diff >= 0 ? '+' : '') + diff.toFixed(0) + '%';
      var bom = inverso ? diff <= 0 : diff >= 0;
      var classe = bom ? 'comp-bom' : 'comp-ruim';
      var seta = diff >= 0 ? '↑' : '↓';
      return '<span class="' + classe + '">' + seta + ' ' + diffStr + ' vs mês ant.</span>';
    },

    /** @returns {HTMLElement} */
    render: function(atual, anterior, inverso) {
      var span = document.createElement('span');
      if (!anterior || anterior === 0) {
        span.className = 'comp-neutro';
        span.textContent = '—';
        return span;
      }
      var diff = ((atual - anterior) / anterior) * 100;
      var bom = inverso ? diff <= 0 : diff >= 0;
      span.className = bom ? 'comp-bom' : 'comp-ruim';
      span.textContent = (diff >= 0 ? '↑ +' : '↓ ') + diff.toFixed(0) + '% vs mês ant.';
      return span;
    }
  };

  window.UI = UI;
})();
