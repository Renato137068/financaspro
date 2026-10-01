/**
 * FinançasPro — ProgressBar: barra de progresso com cor e status
 * v11.0 — sem dependências externas
 *
 * ES Module (ADR 0005): entra no app por js/components/ui.js, que monta o
 * namespace UI publicado por js/esm/ponte.js.
 */

const ProgressBar = {
  // render(pct, cor, status?) → HTMLElement
  // pct: 0–100+ (truncado em 100), cor: hex/keyword, status: 'excedido'|'alerta'|'ok'
  render: function(pct, cor, status) {
    var outer = document.createElement('div');
    outer.className = 'progress-bar' + (status ? ' progress-bar--' + status : '');

    var fill = document.createElement('div');
    fill.className = 'progress-fill';
    fill.style.width = Math.min(pct, 100) + '%';
    fill.style.backgroundColor = cor || '#66bb6a';

    outer.appendChild(fill);
    return outer;
  },

  // corPorStatus(status) → string cor hex
  corPorStatus: function(status) {
    if (status === 'excedido') return '#ef5350';
    if (status === 'alerta')   return '#ffa726';
    return '#66bb6a';
  }
};

export { ProgressBar };
