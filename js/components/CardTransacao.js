/**
 * CardTransacao — item de transação na lista
 * API: UI.CardTransacao.render(transacao) → Element
 */
(function() {
  var UI = window.UI || {};

  UI.CardTransacao = {
    /**
     * @param {Object} t - objeto transação { descricao, categoria, tipo, valor, data, banco, cartao }
     * @returns {HTMLElement}
     */
    render: function(t) {
      var escape = typeof UTILS !== 'undefined' ? UTILS.escapeHtml : function(s) { return String(s); };
      var moeda  = typeof UTILS !== 'undefined' ? UTILS.formatarMoeda : function(v) { return 'R$ ' + v.toFixed(2); };
      var label  = typeof UTILS !== 'undefined' ? UTILS.labelCategoria(t.categoria) : t.categoria;
      var dataRel = typeof UTILS !== 'undefined' && UTILS.formatarDataRelativa
        ? UTILS.formatarDataRelativa(t.data)
        : t.data;

      var isReceita = t.tipo === (typeof CONFIG !== 'undefined' ? CONFIG.TIPO_RECEITA : 'receita');

      var item = document.createElement('div');
      item.className = 'transacao-item';

      // Info (descrição + meta)
      var info = document.createElement('div');
      info.className = 'transacao-info';

      var desc = document.createElement('div');
      desc.className = 'transacao-descricao';
      desc.textContent = t.descricao || t.categoria;
      info.appendChild(desc);

      var meta = document.createElement('div');
      meta.className = 'transacao-data';
      var metaParts = [escape(label), dataRel];
      if (t.banco)  metaParts.push('🏦 ' + escape(t.banco));
      if (t.cartao) metaParts.push('💳 ' + escape(t.cartao));
      meta.textContent = metaParts.join(' · ');
      info.appendChild(meta);

      item.appendChild(info);

      // Valor
      var valor = document.createElement('div');
      valor.className = 'transacao-valor ' + t.tipo;
      valor.textContent = (isReceita ? '+ ' : '- ') + moeda(t.valor);
      item.appendChild(valor);

      return item;
    },

    /** Variante para o resumo do dashboard (layout compacto com ícone) */
    renderResumo: function(t) {
      var escape = typeof UTILS !== 'undefined' ? UTILS.escapeHtml : function(s) { return String(s); };
      var isReceita = t.tipo === (typeof CONFIG !== 'undefined' ? CONFIG.TIPO_RECEITA : 'receita');

      var item = document.createElement('div');
      item.className = 'transacao-resumo-item transacao-tipo-' + t.tipo;

      var icon = document.createElement('div');
      icon.className = 'transacao-icon';
      icon.textContent = isReceita ? '💚' : '❤️';
      item.appendChild(icon);

      var info = document.createElement('div');
      info.className = 'transacao-info';

      var desc = document.createElement('div');
      desc.className = 'transacao-desc';
      desc.textContent = t.descricao || t.categoria;
      info.appendChild(desc);

      var metaEl = document.createElement('div');
      metaEl.className = 'transacao-meta';
      var dataRel = typeof UTILS !== 'undefined' && UTILS.formatarDataRelativa
        ? UTILS.formatarDataRelativa(t.data)
        : t.data;
      metaEl.textContent = t.categoria + ' · ' + dataRel;
      info.appendChild(metaEl);

      item.appendChild(info);

      var valorEl = document.createElement('div');
      valorEl.className = 'transacao-valor ' + (isReceita ? 'valor-receita' : 'valor-despesa');
      var moeda = typeof UTILS !== 'undefined' ? UTILS.formatarMoeda : function(v) { return 'R$ ' + v.toFixed(2); };
      valorEl.textContent = (isReceita ? '+ ' : '- ') + moeda(t.valor);
      item.appendChild(valorEl);

      return item;
    }
  };

  window.UI = UI;
})();
