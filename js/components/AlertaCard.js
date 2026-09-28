/**
 * FinançasPro — AlertaCard: card de alertas de orçamento
 * v11.0 — sem dependências externas
 *
 * ES Module (ADR 0005): entra no app por js/components/ui.js, que monta o
 * namespace UI publicado por js/esm/ponte.js.
 */

const AlertaCard = {
  // render(excedidos, avisos) → HTMLElement|null — null quando não há alertas
  render: function(excedidos, avisos) {
    if (!excedidos.length && !avisos.length) return null;

    var card = document.createElement('div');
    card.className = 'alerta-card';

    var iconEl = document.createElement('div');
    iconEl.className = 'alerta-icon';
    iconEl.setAttribute('aria-hidden', 'true');
    iconEl.innerHTML = '<i data-lucide="alert-triangle"></i>';
    card.appendChild(iconEl);

    var content = document.createElement('div');
    content.className = 'alerta-content';

    if (excedidos.length > 0) {
      var linhaExc = document.createElement('div');
      linhaExc.className = 'alerta-linha alerta-danger';
      linhaExc.textContent = excedidos.length + ' categoria(s) estourou o limite: ';
      excedidos.forEach(function(s, i) {
        var strong = document.createElement('strong');
        strong.textContent = s.categoria;
        linhaExc.appendChild(strong);
        if (i < excedidos.length - 1) linhaExc.appendChild(document.createTextNode(', '));
      });
      content.appendChild(linhaExc);
    }

    if (avisos.length > 0) {
      var linhaAv = document.createElement('div');
      linhaAv.className = 'alerta-linha alerta-warning';
      linhaAv.textContent = avisos.length + ' categoria(s) acima de 80%: ';
      avisos.forEach(function(s, i) {
        var strong = document.createElement('strong');
        strong.textContent = s.categoria + ' (' + s.percentual + '%)';
        linhaAv.appendChild(strong);
        if (i < avisos.length - 1) linhaAv.appendChild(document.createTextNode(', '));
      });
      content.appendChild(linhaAv);
    }

    card.appendChild(content);
    if (typeof renderLucideIcons === 'function') renderLucideIcons(card);
    return card;
  }
};

export { AlertaCard };
