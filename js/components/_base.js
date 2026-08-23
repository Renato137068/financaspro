// Sobra — UI Components Base
// v11.0 — Carregado antes de todos os outros componentes em js/components/
// Centraliza fallbacks de UTILS/CONFIG para uso interno do namespace UI
(function() {
  var UI = window.UI || {};

  UI._utils = {
    esc: function(s) {
      if (typeof UTILS !== 'undefined' && UTILS.escapeHtml) return UTILS.escapeHtml(s);
      var d = document.createElement('div');
      d.textContent = String(s);
      return d.innerHTML;
    },
    moeda: function(v) {
      if (typeof UTILS !== 'undefined' && UTILS.formatarMoeda) return UTILS.formatarMoeda(v);
      return 'R$ ' + Number(v).toFixed(2).replace('.', ',');
    },
    label: function(cat) {
      if (typeof UTILS !== 'undefined' && UTILS.labelCategoria) return UTILS.labelCategoria(cat);
      if (typeof CONFIG !== 'undefined' && CONFIG.getCatLabel) return CONFIG.getCatLabel(cat);
      return String(cat);
    },
    dataRel: function(d) {
      if (typeof UTILS !== 'undefined' && UTILS.formatarDataRelativa) return UTILS.formatarDataRelativa(d);
      return String(d);
    },
    isReceita: function(tipo) {
      return tipo === (typeof CONFIG !== 'undefined' ? CONFIG.TIPO_RECEITA : 'receita');
    },

    /**
     * Descreve o estado de um orçamento com ícone + texto.
     *
     * Existe porque o badge de orçamento distinguia "dentro", "atenção" e
     * "excedido" APENAS pela cor — o que descumpre o critério WCAG 1.4.1 e
     * torna os três estados indistinguíveis para quem tem daltonismo (cerca de
     * 8% dos homens). O ícone é o segundo sinal visual; o texto é o que o
     * leitor de tela anuncia antes do percentual.
     */
    statusOrcamento: function(status) {
      var mapa = {
        ok:        { icone: 'circle-check',  texto: 'Dentro do orçamento' },
        alerta:    { icone: 'triangle-alert', texto: 'Atenção, perto do limite' },
        excedido:  { icone: 'circle-alert',  texto: 'Orçamento excedido' }
      };
      return mapa[status] || null;
    },

    /**
     * Monta um badge de status com ícone, texto para leitor de tela e valor.
     * Devolve um HTMLElement pronto para inserção.
     */
    badgeStatus: function(status, valor) {
      var badge = document.createElement('span');
      badge.className = 'status-' + status;

      var info = UI._utils.statusOrcamento(status);
      if (info) {
        var icone = document.createElement('i');
        icone.setAttribute('data-lucide', info.icone);
        icone.setAttribute('aria-hidden', 'true');
        badge.appendChild(icone);

        var leitor = document.createElement('span');
        leitor.className = 'sr-only';
        leitor.textContent = info.texto + ': ';
        badge.appendChild(leitor);
      }

      var texto = document.createElement('span');
      texto.textContent = valor;
      badge.appendChild(texto);

      // Sem esta chamada o <i data-lucide> permanece vazio: quem transforma o
      // atributo em SVG é o lucide, e ele só varre o que já está no DOM.
      // Mesmo padrão usado por Indicador.js e CardTransacao.js.
      if (typeof renderLucideIcons === 'function') {
        renderLucideIcons(badge);
      }

      return badge;
    }
  };

  window.UI = UI;
})();
