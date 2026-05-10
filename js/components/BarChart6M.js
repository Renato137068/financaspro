/**
 * BarChart6M — gráfico de barras dos últimos 6 meses (SVG)
 * API: UI.BarChart6M.render(dados) → string SVG
 * dados: [{ mes, receitas, despesas }]
 */
(function() {
  var UI = window.UI || {};

  UI.BarChart6M = {
    /**
     * @param {Array} dados - [{ mes: string, receitas: number, despesas: number }]
     * @returns {string} SVG markup (seguro: todos os dados são números e strings curtas de mês)
     */
    render: function(dados) {
      var moeda = typeof UTILS !== 'undefined' ? UTILS.formatarMoeda : function(v) { return 'R$ ' + v.toFixed(2); };

      var maxVal = 0;
      dados.forEach(function(d) { maxVal = Math.max(maxVal, d.receitas, d.despesas); });
      if (maxVal === 0) maxVal = 100;

      var w = 340, h = 180, padding = 30, barW = 18, gap = 6;
      var chartH = h - padding - 20;
      var svg = '<svg viewBox="0 0 ' + w + ' ' + h + '" class="chart-svg" role="img" aria-label="Gráfico de evolução financeira">';

      // Linhas de grade
      for (var g = 0; g <= 4; g++) {
        var gy = padding + (chartH / 4) * g;
        var gVal = maxVal - (maxVal / 4) * g;
        svg += '<line x1="40" y1="' + gy + '" x2="' + (w - 10) + '" y2="' + gy + '" stroke="#e5e7eb" stroke-width="0.5" stroke-dasharray="3,3"/>';
        svg += '<text x="36" y="' + (gy + 3) + '" text-anchor="end" fill="#999" font-size="8">' +
          (gVal >= 1000 ? (gVal / 1000).toFixed(0) + 'k' : gVal.toFixed(0)) +
        '</text>';
      }

      // Barras
      var groupW = barW * 2 + gap;
      var totalGroupW = dados.length * groupW + (dados.length - 1) * 12;
      var startX = 40 + ((w - 50 - totalGroupW) / 2);

      for (var j = 0; j < dados.length; j++) {
        var x = startX + j * (groupW + 12);
        var hRec  = (dados[j].receitas / maxVal) * chartH;
        var hDesp = (dados[j].despesas / maxVal) * chartH;

        svg += '<rect x="' + x + '" y="' + (padding + chartH - hRec) + '" width="' + barW + '" height="' + hRec + '" rx="3" fill="#10b981" opacity="0.85">' +
          '<title>Receita ' + dados[j].mes + ': ' + moeda(dados[j].receitas) + '</title></rect>';
        svg += '<rect x="' + (x + barW + gap) + '" y="' + (padding + chartH - hDesp) + '" width="' + barW + '" height="' + hDesp + '" rx="3" fill="#ef4444" opacity="0.85">' +
          '<title>Despesa ' + dados[j].mes + ': ' + moeda(dados[j].despesas) + '</title></rect>';
        svg += '<text x="' + (x + groupW / 2) + '" y="' + (h - 4) + '" text-anchor="middle" fill="#666" font-size="9" font-weight="600">' + dados[j].mes + '</text>';
      }

      // Legenda
      svg += '<rect x="' + (w - 120) + '" y="4" width="8" height="8" rx="2" fill="#10b981"/>';
      svg += '<text x="' + (w - 108) + '" y="12" fill="#666" font-size="8">Receitas</text>';
      svg += '<rect x="' + (w - 60) + '" y="4" width="8" height="8" rx="2" fill="#ef4444"/>';
      svg += '<text x="' + (w - 48) + '" y="12" fill="#666" font-size="8">Despesas</text>';

      svg += '</svg>';
      return svg;
    }
  };

  window.UI = UI;
})();
