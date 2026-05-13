// FinançasPro — CardTransacao: item de transação na lista
// v11.0 — Depende de: _base.js
(function() {
  var UI = window.UI || {};

  UI.CardTransacao = {
    // render(t) → HTMLElement — layout completo para a tela Extrato
    render: function(t) {
      var u = UI._utils;
      var isReceita = u.isReceita(t.tipo);

      var item = document.createElement('div');
      item.className = 'transacao-item';

      var info = document.createElement('div');
      info.className = 'transacao-info';

      var desc = document.createElement('div');
      desc.className = 'transacao-descricao';
      desc.textContent = t.descricao || t.categoria;
      info.appendChild(desc);

      var meta = document.createElement('div');
      meta.className = 'transacao-data';
      var parts = [u.label(t.categoria), u.dataRel(t.data)];
      if (t.banco)  parts.push('🏦 ' + t.banco);
      if (t.cartao) parts.push('💳 ' + t.cartao);
      meta.textContent = parts.join(' · ');
      info.appendChild(meta);

      item.appendChild(info);

      var valor = document.createElement('div');
      valor.className = 'transacao-valor ' + t.tipo;
      valor.textContent = (isReceita ? '+ ' : '- ') + u.moeda(t.valor);
      item.appendChild(valor);

      return item;
    },

    // renderResumo(t) → HTMLElement — layout compacto com ícone para o Dashboard
    renderResumo: function(t) {
      var u = UI._utils;
      var isReceita = u.isReceita(t.tipo);

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
      metaEl.textContent = u.label(t.categoria) + ' · ' + u.dataRel(t.data);
      info.appendChild(metaEl);

      item.appendChild(info);

      var valorEl = document.createElement('div');
      valorEl.className = 'transacao-valor ' + (isReceita ? 'valor-receita' : 'valor-despesa');
      valorEl.textContent = (isReceita ? '+ ' : '- ') + u.moeda(t.valor);
      item.appendChild(valorEl);

      return item;
    }
  };

  window.UI = UI;
})();
