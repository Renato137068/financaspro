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

    // Ritmo de gastos: quanto já saiu no mês até hoje vs. o mesmo dia do mês
    // passado — o "estou gastando mais rápido que o normal?". Verde quando gasta
    // menos ou igual, vermelho quando gasta mais. Só a partir do dia 5 (para
    // não gritar "-100%" com o mês recém-começado) e com base no mês anterior.
    if (typeof RELATORIOS.ritmoGasto === 'function') {
      var ritmo = RELATORIOS.ritmoGasto(mes, ano, agora);
      if (ritmo && ritmo.dia >= 5 && ritmo.anterior > 0 && ritmo.variacao != null) {
        var ritmoBom = ritmo.variacao <= 0;
        var ritmoCls = ritmoBom ? 'rel-proj--pos' : 'rel-proj--neg';
        var ritmoIcone = ritmoBom ? 'trending-down' : 'trending-up';
        var ritmoTxt = ritmoBom
          ? (ritmo.variacao === 0 ? 'no mesmo ritmo do' : Math.abs(ritmo.variacao) + '% abaixo do')
          : '+' + ritmo.variacao + '% acima do';
        html += '<div class="rel-insight rel-proj ' + ritmoCls + '">' +
          '<i data-lucide="' + ritmoIcone + '" aria-hidden="true"></i> ' +
          'Até o dia ' + ritmo.dia + ' você gastou <strong>' + UTILS.formatarMoeda(ritmo.atual) + '</strong> · ' +
          ritmoTxt + ' mesmo período do mês passado ' +
          '<span class="rel-proj-calc">(' + UTILS.formatarMoeda(ritmo.anterior) + ')</span>' +
        '</div>';
      }
    }

    // Compromissos dos próximos meses: a agenda de desembolsos já conhecidos
    // (faturas de cartão, parcelas e contas a pagar) dos meses à frente. É o
    // "mês pesado chegando" — distinto do disponível de hoje. Mostra só os meses
    // futuros com algum compromisso (o mês corrente já aparece em projeção/ritmo).
    if (typeof COMPROMISSOS !== 'undefined' && COMPROMISSOS.porMes) {
      var MESES_PROX = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
      var futuros = COMPROMISSOS.porMes(4, agora).slice(1).filter(function(m) { return m.total > 0; });
      if (futuros.length > 0) {
        var maxProx = futuros.reduce(function(mx, m) { return m.total > mx ? m.total : mx; }, 0);
        html += '<h4 class="rel-subtitle">Compromissos dos próximos meses</h4><ul class="rel-cat-list">';
        futuros.forEach(function(m) {
          var pct = maxProx > 0 ? Math.round((m.total / maxProx) * 100) : 0;
          var label = MESES_PROX[m.mes - 1] + '/' + String(m.ano).slice(2);
          html += '<li class="rel-cat-item"><span class="rel-cat-name">' +
              '<i data-lucide="calendar-clock" aria-hidden="true"></i> ' + label + '</span>' +
            '<span class="rel-cat-bar-wrap"><span class="rel-cat-bar" style="width:' + pct + '%"></span></span>' +
            '<span class="rel-cat-val">' + UTILS.formatarMoeda(m.total) + '</span></li>';
        });
        html += '</ul>';
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

    // Maiores despesas: para onde o dinheiro foi, por descrição normalizada — o
    // "top estabelecimentos" do mercado. Barras proporcionais ao maior item; o
    // % é sobre a despesa do mês. Só aparece com >= 2 descrições distintas,
    // senão vira eco do primeiro lançamento (e não um ranking).
    if (typeof RELATORIOS.topDescricoes === 'function') {
      var topDesc = RELATORIOS.topDescricoes(mes, ano, 5);
      if (topDesc.length >= 2) {
        var maxDesc = topDesc[0].total; // lista já vem ordenada por gasto desc
        html += '<h4 class="rel-subtitle">Maiores despesas</h4><ul class="rel-cat-list">';
        topDesc.forEach(function(d) {
          var pct = maxDesc > 0 ? Math.round((d.total / maxDesc) * 100) : 0;
          var qtd = d.transacoes > 1 ? ' · ' + d.transacoes + 'x' : '';
          html += '<li class="rel-cat-item"><span class="rel-cat-name">' + UTILS.escapeHtml(d.descricao) + '</span>' +
            '<span class="rel-cat-bar-wrap"><span class="rel-cat-bar" style="width:' + pct + '%"></span></span>' +
            '<span class="rel-cat-val">' + UTILS.formatarMoeda(d.total) + ' (' + d.percentual + '%' + qtd + ')</span></li>';
        });
        html += '</ul>';
      }
    }

    // Gastos por conta/cartão: por onde o dinheiro saiu, separando cada cartão
    // e cada conta. Barras proporcionais ao maior; % sobre a despesa do mês. Só
    // com >= 2 fontes distintas (senão é só "tudo numa conta").
    if (typeof RELATORIOS.gastoPorFonte === 'function') {
      var fontes = RELATORIOS.gastoPorFonte(mes, ano);
      if (fontes.length >= 2) {
        var maxFonte = fontes[0].total; // já ordenado por gasto desc
        html += '<h4 class="rel-subtitle">Gastos por conta/cartão</h4><ul class="rel-cat-list">';
        fontes.slice(0, 6).forEach(function(f) {
          var pct = maxFonte > 0 ? Math.round((f.total / maxFonte) * 100) : 0;
          var icone = f.tipo === 'cartao' ? 'credit-card' : (f.tipo === 'conta' ? 'wallet' : 'help-circle');
          html += '<li class="rel-cat-item"><span class="rel-cat-name">' +
              '<i data-lucide="' + icone + '" aria-hidden="true"></i> ' + UTILS.escapeHtml(f.fonte) + '</span>' +
            '<span class="rel-cat-bar-wrap"><span class="rel-cat-bar" style="width:' + pct + '%"></span></span>' +
            '<span class="rel-cat-val">' + UTILS.formatarMoeda(f.total) + ' (' + f.percentual + '%)</span></li>';
        });
        html += '</ul>';
      }
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

    // Gastos por dia da semana: o padrão semanal ("você gasta mais aos
    // sábados"). Barras proporcionais ao maior dia; o pico ganha destaque. Só
    // aparece quando há despesa no mês.
    if (typeof RELATORIOS.gastoPorDiaSemana === 'function') {
      var semana = RELATORIOS.gastoPorDiaSemana(mes, ano);
      var maxDia = semana.reduce(function(mx, d) { return d.total > mx ? d.total : mx; }, 0);
      if (maxDia > 0) {
        var picoIdx = semana.reduce(function(bi, d, i) { return d.total > semana[bi].total ? i : bi; }, 0);
        html += '<h4 class="rel-subtitle">Gastos por dia da semana</h4><ul class="rel-cat-list">';
        semana.forEach(function(d, i) {
          var pct = Math.round((d.total / maxDia) * 100);
          var nomeCls = i === picoIdx ? 'rel-cat-name rel-cat-name--pico' : 'rel-cat-name';
          html += '<li class="rel-cat-item"><span class="' + nomeCls + '">' + d.label + '</span>' +
            '<span class="rel-cat-bar-wrap"><span class="rel-cat-bar" style="width:' + pct + '%"></span></span>' +
            '<span class="rel-cat-val">' + UTILS.formatarMoeda(d.total) + '</span></li>';
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

    // Retrospectiva do ano: o ano civil fechado (jan→dez), complementando a
    // janela móvel de 6 meses. Total do ano, média por mês ativo, poupança e os
    // meses mais caro/econômico. Só aparece com mais de 6 meses de dados no ano:
    // com <= 6, a janela de "Últimos 6 meses" já cobre praticamente o mesmo, e
    // mostrar as duas seria repetição.
    if (typeof RELATORIOS.resumoAno === 'function') {
      var rano = RELATORIOS.resumoAno(ano, agora);
      if (rano && rano.mesesComDados > 6) {
        var MESES_ANO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
        html += '<h4 class="rel-subtitle">Retrospectiva de ' + ano + '</h4>';
        html += '<p class="rel-insight"><i data-lucide="calendar-days" aria-hidden="true"></i> ' +
          'Despesas do ano: <strong>' + UTILS.formatarMoeda(rano.despesas) + '</strong> · média ' +
          UTILS.formatarMoeda(rano.mediaDespesaMensal) + '/mês' +
          (rano.taxaPoupanca != null ? ' · poupança ' + rano.taxaPoupanca + '%' : '') + '.</p>';
        if (rano.maiorDespesaMes && rano.menorDespesaMes) {
          html += '<p class="rel-insight"><i data-lucide="scale" aria-hidden="true"></i> ' +
            'Mês mais caro: <strong>' + MESES_ANO[rano.maiorDespesaMes.mes - 1] + '</strong> (' +
            UTILS.formatarMoeda(rano.maiorDespesaMes.despesas) + ') · mais econômico: <strong>' +
            MESES_ANO[rano.menorDespesaMes.mes - 1] + '</strong> (' +
            UTILS.formatarMoeda(rano.menorDespesaMes.despesas) + ').</p>';
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
