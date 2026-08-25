// FinançasPro — DonutChart: donut chart de despesas por categoria (SVG + legenda)
// v11.0 — Depende de: _base.js, LegendaChart.js
// cats: [{ nome, valor, cor }] — já ordenadas desc
(function() {
  var UI = window.UI || {};

  function _buildResumoTabela(cats, totalDesp) {
    var u = UI._utils;
    var rows = cats.map(function(c) {
      var pct = totalDesp > 0 ? Math.round((c.valor / totalDesp) * 100) : 0;
      return '<tr><td>' + u.esc(u.label(c.nome)) + '</td><td>' + u.esc(u.moeda(c.valor)) +
        '</td><td>' + pct + '%</td></tr>';
    }).join('');
    return '<table class="sr-only">' +
      '<caption>Despesas por categoria</caption>' +
      '<thead><tr><th scope="col">Categoria</th><th scope="col">Valor</th><th scope="col">Percentual</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table>';
  }

  UI.DonutChart = {
    // render(cats, totalDesp) → HTMLElement div.donut-container
    render: function(cats, totalDesp) {
      var u = UI._utils;

      var size = 160, cx = 80, cy = 80, r = 60, innerR = 38;
      var svgStr = '<svg viewBox="0 0 ' + size + ' ' + size + '" class="donut-svg" aria-hidden="true" focusable="false">';

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

        // SVG de geometria pura — nome é slug interno, valor é número
        svgStr += '<path d="' + path + '" fill="' + cats[i].cor + '" opacity="0.9">' +
          '<title>' + u.label(cats[i].nome) + ': ' + u.moeda(cats[i].valor) + ' (' + Math.round(pct * 100) + '%)</title>' +
          '</path>';

        startAngle = endAngle;
      }

      svgStr += '<text x="' + cx + '" y="' + (cy - 4) + '" text-anchor="middle" fill="#333" font-size="10" font-weight="700">Total</text>';
      svgStr += '<text x="' + cx + '" y="' + (cy + 10) + '" text-anchor="middle" fill="#666" font-size="8">' + u.moeda(totalDesp) + '</text>';
      svgStr += '</svg>';

      var container = document.createElement('div');
      container.className = 'donut-container';
      container.innerHTML = svgStr + _buildResumoTabela(cats, totalDesp);
      container.appendChild(UI.LegendaChart.render(cats, totalDesp));

      return container;
    }
  };

  window.UI = UI;
})();
