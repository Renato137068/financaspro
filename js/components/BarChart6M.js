// FinançasPro — BarChart6M: gráfico de barras dos últimos 6 meses (SVG)
// v11.0 — Depende de: _base.js
// dados: [{ mes: string, receitas: number, despesas: number }]
(function() {
  var UI = window.UI || {};

  function _buildSVG(dados) {
    var moeda = UI._utils.moeda;

    var maxVal = 0;
    dados.forEach(function(d) { maxVal = Math.max(maxVal, d.receitas, d.despesas); });
    if (maxVal === 0) maxVal = 100;

    var w = 340, h = 180, padding = 30, barW = 18, gap = 6;
    var chartH = h - padding - 20;
    var svg = '<svg viewBox="0 0 ' + w + ' ' + h + '" class="chart-svg" role="img" aria-label="Gráfico de evolução financeira">';

    for (var g = 0; g <= 4; g++) {
      var gy = padding + (chartH / 4) * g;
      var gVal = maxVal - (maxVal / 4) * g;
      svg += '<line x1="40" y1="' + gy + '" x2="' + (w - 10) + '" y2="' + gy + '" stroke="#e5e7eb" stroke-width="0.5" stroke-dasharray="3,3"/>';
      svg += '<text x="36" y="' + (gy + 3) + '" text-anchor="end" fill="#999" font-size="8">' +
        (gVal >= 1000 ? (gVal / 1000).toFixed(0) + 'k' : gVal.toFixed(0)) +
      '</text>';
    }

    var groupW = barW * 2 + gap;
    var totalGroupW = dados.length * groupW + (dados.length - 1) * 12;
    var startX = 40 + ((w - 50 - totalGroupW) / 2);

    for (var j = 0; j < dados.length; j++) {
      var x = startX + j * (groupW + 12);
      var hRec  = (dados[j].receitas / maxVal) * chartH;
      var hDesp = (dados[j].despesas / maxVal) * chartH;

      // SVG seguro: dados[j].mes é string curta de mês (ex: "Jan"), sem dados de usuário
      svg += '<rect x="' + x + '" y="' + (padding + chartH - hRec) + '" width="' + barW + '" height="' + hRec + '" rx="3" fill="#10b981" opacity="0.85">' +
        '<title>Receita ' + dados[j].mes + ': ' + moeda(dados[j].receitas) + '</title></rect>';
      svg += '<rect x="' + (x + barW + gap) + '" y="' + (padding + chartH - hDesp) + '" width="' + barW + '" height="' + hDesp + '" rx="3" fill="#ef4444" opacity="0.85">' +
        '<title>Despesa ' + dados[j].mes + ': ' + moeda(dados[j].despesas) + '</title></rect>';
      svg += '<text x="' + (x + groupW / 2) + '" y="' + (h - 4) + '" text-anchor="middle" fill="#666" font-size="9" font-weight="600">' + dados[j].mes + '</text>';
    }

    svg += '<rect x="' + (w - 120) + '" y="4" width="8" height="8" rx="2" fill="#10b981"/>';
    svg += '<text x="' + (w - 108) + '" y="12" fill="#666" font-size="8">Receitas</text>';
    svg += '<rect x="' + (w - 60) + '" y="4" width="8" height="8" rx="2" fill="#ef4444"/>';
    svg += '<text x="' + (w - 48) + '" y="12" fill="#666" font-size="8">Despesas</text>';
    svg += '</svg>';
    return svg;
  }

  UI.BarChart6M = {
    // render(dados) → HTMLElement — contrato padrão: sempre retorna Element
    render: function(dados) {
      var el = document.createElement('div');
      el.className = 'chart-6m-container';
      el.innerHTML = _buildSVG(dados);
      return el;
    },

    // html(dados) → string SVG — para uso explícito com innerHTML
    html: function(dados) {
      return _buildSVG(dados);
    }
  };

  window.UI = UI;
})();
