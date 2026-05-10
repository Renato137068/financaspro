/**
 * LegendaChart — legenda lateral de gráficos
 * API: UI.LegendaChart.render(cats, totalDesp) → Element
 * cats: [{ nome, valor, cor }]
 */
(function() {
  var UI = window.UI || {};

  UI.LegendaChart = {
    /**
     * @param {Array}  cats      - [{ nome, valor, cor }]
     * @param {number} totalDesp - soma total (para calcular %)
     * @returns {HTMLElement}
     */
    render: function(cats, totalDesp) {
      var escape = typeof UTILS !== 'undefined' ? UTILS.escapeHtml : function(s) { return String(s); };

      var legenda = document.createElement('div');
      legenda.className = 'donut-legenda';

      cats.forEach(function(cat) {
        var pct = totalDesp > 0 ? Math.round((cat.valor / totalDesp) * 100) : 0;
        var nomeLegenda = (typeof CONFIG !== 'undefined' && CONFIG.getCatLabel)
          ? CONFIG.getCatLabel(cat.nome)
          : cat.nome;

        var item = document.createElement('div');
        item.className = 'legenda-item';

        var cor = document.createElement('span');
        cor.className = 'legenda-cor';
        cor.style.background = cat.cor;
        item.appendChild(cor);

        var nome = document.createElement('span');
        nome.className = 'legenda-nome';
        nome.textContent = nomeLegenda;
        item.appendChild(nome);

        var pctEl = document.createElement('span');
        pctEl.className = 'legenda-pct';
        pctEl.textContent = pct + '%';
        item.appendChild(pctEl);

        legenda.appendChild(item);
      });

      return legenda;
    }
  };

  window.UI = UI;
})();
