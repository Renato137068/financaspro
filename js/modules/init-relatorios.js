/**
 * init-relatorios.js — Painel de relatório mensal no dashboard
 */
const INIT_RELATORIOS = {
  render: function() {
    var el = document.getElementById('relatorios-panel');
    if (!el || typeof RELATORIOS === 'undefined') return;

    var agora = new Date();
    var mes = agora.getMonth() + 1;
    var ano = agora.getFullYear();
    var cmp = RELATORIOS.compararMesAnterior(mes, ano);
    if (!cmp) {
      el.innerHTML = '<p class="rel-empty">Sem dados suficientes para o relatório.</p>';
      return;
    }

    var a = cmp.atual;
    var nomeMes = agora.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    nomeMes = nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1);

    function fmtDiff(v) {
      var s = v >= 0 ? '+' : '';
      return s + UTILS.formatarMoeda(v);
    }

    var html = '<div class="rel-header"><h3>' + UTILS.escapeHtml(nomeMes) + '</h3>' +
      '<span class="rel-tx-count">' + a.transacoes + ' lançamentos</span></div>' +
      '<div class="rel-kpis">' +
        '<div class="rel-kpi rel-kpi--rec"><span>Receitas</span><strong>' + UTILS.formatarMoeda(a.receitas) + '</strong>' +
          '<small>' + fmtDiff(cmp.diffReceitas) + ' vs mês ant.</small></div>' +
        '<div class="rel-kpi rel-kpi--desp"><span>Despesas</span><strong>' + UTILS.formatarMoeda(a.despesas) + '</strong>' +
          '<small>' + fmtDiff(cmp.diffDespesas) + ' vs mês ant.</small></div>' +
        '<div class="rel-kpi rel-kpi--saldo"><span>Saldo</span><strong>' + UTILS.formatarMoeda(a.saldo) + '</strong>' +
          '<small>' + fmtDiff(cmp.diffSaldo) + ' vs mês ant.</small></div>' +
      '</div>';

    // Saldo do mês depois de honrar as contas a pagar ainda em aberto. É um
    // recorte determinístico e gratuito (saldo realizado − contas pendentes),
    // distinto da "Projeção de fim de mês" por ritmo/IA dos insights: aqui não
    // há extrapolação, só o que já está lançado menos o que já se sabe que
    // ainda vai sair. Só aparece quando há contas em aberto — senão o número
    // seria igual ao saldo e não informa nada.
    if (typeof PROJECAO !== 'undefined' && PROJECAO.doMes) {
      var proj = PROJECAO.doMes(mes, ano);
      if (proj.temDados && proj.contasEmAberto > 0) {
        var sinal = proj.positivo ? 'rel-proj--pos' : 'rel-proj--neg';
        var icone = proj.positivo ? 'wallet' : 'alert-triangle';
        html += '<div class="rel-insight rel-proj ' + sinal + '">' +
          '<i data-lucide="' + icone + '" aria-hidden="true"></i> ' +
          'Depois das contas em aberto: <strong>' + UTILS.formatarMoeda(proj.projetado) + '</strong> ' +
          '<span class="rel-proj-calc">(' + UTILS.formatarMoeda(proj.saldoAtual) + ' hoje − ' +
            UTILS.formatarMoeda(proj.aPagar) + ' a pagar em ' + proj.contasEmAberto +
            (proj.contasEmAberto > 1 ? ' contas' : ' conta') + ')</span>' +
        '</div>';
      }
    }

    if (a.topCategorias.length > 0) {
      html += '<h4 class="rel-subtitle">Top despesas por categoria</h4><ul class="rel-cat-list">';
      a.topCategorias.forEach(function(c) {
        html += '<li class="rel-cat-item"><span class="rel-cat-name">' + UTILS.escapeHtml(c.label) + '</span>' +
          '<span class="rel-cat-bar-wrap"><span class="rel-cat-bar" style="width:' + c.percentual + '%"></span></span>' +
          '<span class="rel-cat-val">' + UTILS.formatarMoeda(c.valor) + ' (' + c.percentual + '%)</span></li>';
      });
      html += '</ul>';
    }

    // Acima da média: categorias em que o gasto do mês superou a linha de base
    // pessoal (média dos 3 meses anteriores). É o "fora do seu normal" que os
    // concorrentes destacam, sem exigir orçamento configurado. Filtros contra
    // alarme falso: só categorias com histórico em ≥ 2 dos 3 meses, variação
    // ≥ 25% e ao menos R$ 25 acima da média.
    if (typeof RELATORIOS.mediaPorCategoria === 'function') {
      var acima = RELATORIOS.mediaPorCategoria(mes, ano).filter(function(c) {
        return c.variacao != null && c.mesesComDados >= 2 && c.variacao >= 25 && c.diff >= 25;
      });
      if (acima.length > 0) {
        html += '<h4 class="rel-subtitle">Acima da média</h4><ul class="rel-cat-list">';
        acima.slice(0, 3).forEach(function(c) {
          html += '<li class="rel-cat-item">' +
            '<span class="rel-cat-name"><i data-lucide="trending-up" aria-hidden="true"></i> ' +
              UTILS.escapeHtml(c.label) + '</span>' +
            '<span class="rel-cat-val">' + UTILS.formatarMoeda(c.atual) +
              ' · +' + c.variacao + '% vs média (' + UTILS.formatarMoeda(c.media) + ')</span>' +
          '</li>';
        });
        html += '</ul>';
      }
    }

    // Gastos por marcador: o retorno do relatório sobre as tags. Como uma
    // transação pode ter várias tags, a soma por marcador pode passar do total
    // do mês — por isso cada barra é limitada a 100%, mas o % real é exibido.
    if (typeof TRANSACOES !== 'undefined' && TRANSACOES.resumoPorTag) {
      var porTag = TRANSACOES.resumoPorTag({ mes: mes, ano: ano }).filter(function(t) {
        return t.despesa > 0;
      });
      if (porTag.length > 0) {
        html += '<h4 class="rel-subtitle">Gastos por marcador</h4><ul class="rel-cat-list">';
        porTag.slice(0, 5).forEach(function(t) {
          var pct = a.despesas > 0 ? Math.round((t.despesa / a.despesas) * 100) : 0;
          html += '<li class="rel-cat-item"><span class="rel-cat-name">#' + UTILS.escapeHtml(t.tag) + '</span>' +
            '<span class="rel-cat-bar-wrap"><span class="rel-cat-bar" style="width:' + Math.min(100, pct) + '%"></span></span>' +
            '<span class="rel-cat-val">' + UTILS.formatarMoeda(t.despesa) + ' (' + pct + '%)</span></li>';
        });
        html += '</ul>';
      }
    }

    // Agenda: o que vence no mês (contas a pagar + faturas de cartão),
    // consolidado numa linha do tempo — o recorte de calendário financeiro.
    if (typeof CALENDARIO !== 'undefined' && CALENDARIO.agendaDoMes) {
      var agenda = CALENDARIO.agendaDoMes(mes, ano);
      if (agenda.quantidade > 0) {
        html += '<h4 class="rel-subtitle">Vencimentos do mês</h4><ul class="rel-cat-list">';
        agenda.eventos.slice(0, 6).forEach(function(e) {
          var diaTxt = e.data.slice(8, 10) + '/' + e.data.slice(5, 7);
          var quando = (e.dias == null) ? ''
            : (e.dias < 0 ? 'vencida' : e.dias === 0 ? 'hoje' : 'em ' + e.dias + (e.dias > 1 ? ' dias' : ' dia'));
          var icone = e.tipo === 'cartao' ? 'credit-card' : 'file-text';
          html += '<li class="rel-cat-item">' +
            '<span class="rel-cat-name"><i data-lucide="' + icone + '" aria-hidden="true"></i> ' +
              diaTxt + ' · ' + UTILS.escapeHtml(e.titulo) + '</span>' +
            '<span class="rel-cat-val">' + UTILS.formatarMoeda(e.valor) +
              (quando ? ' · ' + quando : '') + '</span>' +
          '</li>';
        });
        html += '</ul>';
        if (agenda.quantidade > 6) {
          html += '<p class="rel-insight"><i data-lucide="calendar" aria-hidden="true"></i> + ' +
            (agenda.quantidade - 6) + ' outros · total do mês ' + UTILS.formatarMoeda(agenda.total) + '</p>';
        }
      }
    }

    if (typeof ASSINATURAS !== 'undefined') {
      var subTotal = ASSINATURAS.totalMensal();
      if (subTotal > 0) {
        var pctRenda = a.despesas > 0 ? Math.round((subTotal / a.despesas) * 100) : 0;
        html += '<p class="rel-insight"><i data-lucide="tv" aria-hidden="true"></i> Assinaturas representam ' +
          UTILS.formatarMoeda(subTotal) + '/mês (' + pctRenda + '% das despesas do mês).</p>';
      }
    }

    // Zoom out: os números por trás do gráfico de evolução — média de despesa,
    // taxa de poupança e mês mais caro dos últimos 6 meses. Só aparece com
    // histórico suficiente (>= 3 meses com lançamento), senão engana.
    if (typeof RELATORIOS.resumoPeriodo === 'function') {
      var per = RELATORIOS.resumoPeriodo(mes, ano, 6);
      if (per && per.mesesComDados >= 3) {
        var MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
        html += '<h4 class="rel-subtitle">Últimos 6 meses</h4>';
        html += '<p class="rel-insight"><i data-lucide="calendar-range" aria-hidden="true"></i> ' +
          'Despesa média: <strong>' + UTILS.formatarMoeda(per.mediaDespesaMensal) + '/mês</strong>' +
          (per.taxaPoupanca != null ? ' · poupança do período ' + per.taxaPoupanca + '%' : '') + '.</p>';
        if (per.maiorDespesaMes) {
          var mm = per.maiorDespesaMes;
          html += '<p class="rel-insight"><i data-lucide="trending-up" aria-hidden="true"></i> ' +
            'Mês mais caro: <strong>' + MESES_ABREV[mm.mes - 1] + '/' + String(mm.ano).slice(2) + '</strong> (' +
            UTILS.formatarMoeda(mm.despesas) + ').</p>';
        }
      }
    }

    el.innerHTML = html;
    if (typeof renderLucideIconsNow === 'function') renderLucideIconsNow(el);
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = INIT_RELATORIOS;
}

/* P2.5: ordem 50 — último (como no render() original) */
(function() {
  if (typeof RENDER_DASHBOARD === 'undefined' || !RENDER_DASHBOARD.onRender) return;
  if (INIT_RELATORIOS._dashboardHooked) return;
  INIT_RELATORIOS._dashboardHooked = true;
  RENDER_DASHBOARD.onRender(function() {
    if (INIT_RELATORIOS.render) INIT_RELATORIOS.render();
  }, 50);
})();
