// FinançasPro — BarChart6M: gráfico de barras dos últimos 6 meses (SVG)
// v11.0 — Depende de: _base.js
// dados: [{ mes: string, receitas: number, despesas: number }]
(function() {
  var UI = window.UI || {};

  function _buildResumoTabela(dados) {
    var moeda = UI._utils.moeda;
    var esc = UI._utils.esc;
    var rows = dados.map(function(d) {
      if (d.bloqueado) {
        return '<tr><td>' + esc(d.mes) + '</td><td colspan="2">Disponível no plano Pro</td></tr>';
      }
      return '<tr><td>' + esc(d.mes) + '</td><td>' + esc(moeda(d.receitas)) +
        '</td><td>' + esc(moeda(d.despesas)) + '</td></tr>';
    }).join('');
    return '<table class="sr-only">' +
      '<caption>Evolução financeira dos últimos 6 meses</caption>' +
      '<thead><tr><th scope="col">Mês</th><th scope="col">Receitas</th><th scope="col">Despesas</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table>';
  }

  function _buildSVG(dados) {
    var moeda = UI._utils.moeda;

    var maxVal = 0;
    dados.forEach(function(d) { maxVal = Math.max(maxVal, d.receitas, d.despesas); });
    if (maxVal === 0) maxVal = 100;

    var w = 340, h = 180, padding = 30, barW = 18, gap = 6;
    var chartH = h - padding - 20;
    var svg = '<svg viewBox="0 0 ' + w + ' ' + h + '" class="chart-svg" aria-hidden="true" focusable="false">';

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

      // Mês fora da janela do plano: silhueta cinza, sem número em lugar
      // nenhum — nem no tooltip, nem na tabela acessível.
      if (dados[j].bloqueado) {
        var hSil = (dados[j].silhueta || 0.4) * chartH;
        svg += '<rect x="' + x + '" y="' + (padding + chartH - hSil) + '" width="' + barW + '" height="' + hSil + '" rx="3" fill="#9aa5a0" opacity="0.28"/>';
        svg += '<rect x="' + (x + barW + gap) + '" y="' + (padding + chartH - hSil * 0.8) + '" width="' + barW + '" height="' + (hSil * 0.8) + '" rx="3" fill="#9aa5a0" opacity="0.28"/>';
        svg += '<text x="' + (x + groupW / 2) + '" y="' + (h - 4) + '" text-anchor="middle" fill="#9aa5a0" font-size="9" font-weight="600">' + dados[j].mes + '</text>';
        continue;
      }

      var hRec  = (dados[j].receitas / maxVal) * chartH;
      var hDesp = (dados[j].despesas / maxVal) * chartH;

      // SVG seguro: dados[j].mes é string curta de mês (ex: "Jan"), sem dados de usuário
      svg += '<rect x="' + x + '" y="' + (padding + chartH - hRec) + '" width="' + barW + '" height="' + hRec + '" rx="3" fill="#2f9c6d" opacity="0.85">' +
        '<title>Receita ' + dados[j].mes + ': ' + moeda(dados[j].receitas) + '</title></rect>';
      svg += '<rect x="' + (x + barW + gap) + '" y="' + (padding + chartH - hDesp) + '" width="' + barW + '" height="' + hDesp + '" rx="3" fill="#c9573a" opacity="0.85">' +
        '<title>Despesa ' + dados[j].mes + ': ' + moeda(dados[j].despesas) + '</title></rect>';
      svg += '<text x="' + (x + groupW / 2) + '" y="' + (h - 4) + '" text-anchor="middle" fill="#666" font-size="9" font-weight="600">' + dados[j].mes + '</text>';
    }

    svg += '<rect x="' + (w - 120) + '" y="4" width="8" height="8" rx="2" fill="#2f9c6d"/>';
    svg += '<text x="' + (w - 108) + '" y="12" fill="#666" font-size="8">Receitas</text>';
    svg += '<rect x="' + (w - 60) + '" y="4" width="8" height="8" rx="2" fill="#c9573a"/>';
    svg += '<text x="' + (w - 48) + '" y="12" fill="#666" font-size="8">Despesas</text>';
    svg += '</svg>';
    return svg;
  }

  UI.BarChart6M = {
    // render(dados) → HTMLElement — contrato padrão: sempre retorna Element
    render: function(dados) {
      var el = document.createElement('div');
      el.className = 'chart-6m-container';
      var bloqueados = (dados || []).filter(function(d) { return d.bloqueado; }).length;
      var cta = '';
      if (bloqueados > 0) {
        cta = '<button type="button" class="chart-6m-upsell" data-action="abrir-paywall">' +
          'Mais ' + bloqueados + ' ' + (bloqueados === 1 ? 'mês' : 'meses') +
          ' de histórico já estão salvos — veja com o Pro</button>';
      }
      el.innerHTML = _buildSVG(dados) + cta + _buildResumoTabela(dados);
      return el;
    },

    // html(dados) → string SVG + tabela acessível
    html: function(dados) {
      return _buildSVG(dados) + _buildResumoTabela(dados);
    },

    /** Quantos meses do conjunto estão fora do plano atual. */
    bloqueados: function(dados) {
      return (dados || []).filter(function(d) { return d && d.bloqueado; }).length;
    }
  };

  window.UI = UI;
})();
