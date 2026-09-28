/**
 * FinançasPro — LegendaChart: legenda lateral de gráficos
 * v11.0 — Depende de: _base.js
 * cats: [{ nome, valor, cor }]
 *
 * ES Module (ADR 0005): entra no app por js/components/ui.js, que monta o
 * namespace UI publicado por js/esm/ponte.js.
 */

import { UI_UTILS } from './_base.js';

const LegendaChart = {
  // render(cats, totalDesp) → HTMLElement
  render: function(cats, totalDesp) {
    var u = UI_UTILS;

    var legenda = document.createElement('div');
    legenda.className = 'donut-legenda';

    cats.forEach(function(cat) {
      var pct = totalDesp > 0 ? Math.round((cat.valor / totalDesp) * 100) : 0;

      var item = document.createElement('div');
      item.className = 'legenda-item';

      var cor = document.createElement('span');
      cor.className = 'legenda-cor';
      cor.style.background = cat.cor;
      item.appendChild(cor);

      var nome = document.createElement('span');
      nome.className = 'legenda-nome';
      nome.textContent = u.label(cat.nome);
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

export { LegendaChart };
