/**
 * DonutChart — donut chart de despesas por categoria (SVG + legenda)
 * API: UI.DonutChart.render(cats, totalDesp) → Element (container)
 * cats: [{ nome, valor, cor }]
 */
(function() {
  var UI = window.UI || {};

  UI.DonutChart = {
    /**
     * @param {Array}  cats      - [{ nome, valor, cor }] — já ordenadas desc
     * @param {number} totalDesp
     * @returns {HTMLElement} div.donut-container
     */
    render: function(cats, totalDesp) {
      var moeda = typeof UTILS !== 'undefined' ? UTILS.formatarMoeda : function(v) { return 'R$ ' + v.toFixed(2); };

      var size = 160, cx = 80, cy = 80, r = 60, innerR = 38;
      var svgStr = '<svg viewBox="0 0 ' + size + ' ' + size + '" class="donut-svg" role="img" aria-label="Gráfico de despesas por categoria">';

      var startAngle = -90;
      for (var i = 0; i < cats.length; i++) {
        var pct      = cats[i].valor / totalDesp;
        var angle    = pct * 360;
        var endAngle = startAngle + angle;
        var largeArc = angle > 180 ? 1 : 0;

        var x1  = cx + r      * Math.cos(startAngle * Math.PI / 180);
        var y1  = cy + r      * Math.sin(startAngle * Math.PI / 180);
        var x2  = cx + r      * Math.cos(endAngle   * Math.PI / 180);
        var y2  = cy + r      * Math.sin(endAngle   * Math.PI / 180);
        var ix1 = cx + innerR * Math.cos(endAngle   * Math.PI / 180);
        var iy1 = cy + innerR * Math.sin(endAngle   * Math.PI / 180);
        var ix2 = cx + innerR * Math.cos(startAngle * Math.PI / 180);
        var iy2 = cy + innerR * Math.sin(startAngle * Math.PI / 180);

        var path = 'M ' + x1 + ' ' + y1 +
          ' A ' + r + ' ' + r + ' 0 ' + largeArc + ' 1 ' + x2 + ' ' + y2 +
          ' L ' + ix1 + ' ' + iy1 +
          ' A ' + innerR + ' ' + innerR + ' 0 ' + largeArc + ' 0 ' + ix2 + ' ' + iy2 + ' Z';

        // nome do cat é slug interno (sem HTML), valor é número — sem risco XSS
        var nomeLegenda = (typeof CONFIG !== 'undefined' && CONFIG.getCatLabel)
          ? CONFIG.getCatLabel(cats[i].nome)
          : cats[i].nome;

        svgStr += '<path d="' + path + '" fill="' + cats[i].cor + '" opacity="0.9">' +
          '<title>' + nomeLegenda + ': ' + moeda(cats[i].valor) + ' (' + Math.round(pct * 100) + '%)</title>' +
          '</path>';

        startAngle = endAngle;
      }

      // Texto central
      svgStr += '<text x="' + cx + '" y="' + (cy - 4) + '" text-anchor="middle" fill="#333" font-size="10" font-weight="700">Total</text>';
      svgStr += '<text x="' + cx + '" y="' + (cy + 10) + '" text-anchor="middle" fill="#666" font-size="8">' + moeda(totalDesp) + '</text>';
      svgStr += '</svg>';

      // Container principal
      var container = document.createElement('div');
      container.className = 'donut-container';
      container.innerHTML = svgStr; // SVG de geometria — sem dados de usuário no markup

      // Legenda via DOM (dados do usuário)
      container.appendChild(UI.LegendaChart.render(cats, totalDesp));

      return container;
    }
  };

  window.UI = UI;
})();
