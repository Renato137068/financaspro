/**
 * calendario.js — Agenda financeira do mês (o que vence e quando).
 *
 * Consolida numa só linha do tempo os compromissos datados do mês que hoje
 * moram em telas separadas: contas a pagar pendentes e vencimentos de fatura
 * de cartão. É a leitura que Mobills/Organizze dão no calendário — "o que cai
 * em cada dia" — reaproveitando os módulos que o app já tem. Puro, sem DOM.
 */
var CALENDARIO = {
  _hoje: function(hoje) {
    return (hoje && typeof hoje.getTime === 'function' && !isNaN(hoje.getTime()))
      ? hoje : new Date();
  },

  /**
   * Compromissos datados do mês, ordenados por vencimento.
   *
   * @param {number} mes 1-12
   * @param {number} ano
   * @param {Date} [hoje] injetável para teste
   * @returns {{eventos:Array<{data:string, tipo:'conta'|'cartao', titulo:string,
   *            valor:number, dias:?number, status:?string, competencia?:string}>,
   *            total:number, quantidade:number}}
   */
  agendaDoMes: function(mes, ano, hoje) {
    var eventos = [];

    // Contas a pagar pendentes com vencimento no mês.
    if (typeof CONTAS_PAGAR !== 'undefined' && CONTAS_PAGAR.listarNoMes) {
      CONTAS_PAGAR.listarNoMes(mes, ano).forEach(function(c) {
        if (!c || !c.vencimento) return;
        eventos.push({
          data: String(c.vencimento).slice(0, 10),
          tipo: 'conta',
          titulo: c.descricao || 'Conta',
          valor: Number(c.valor) || 0,
          status: (CONTAS_PAGAR.situacao ? CONTAS_PAGAR.situacao(c) : null)
        });
      });
    }

    // Vencimentos de fatura de cartão que caem no mês (fatura atual e próxima).
    if (typeof CARTOES !== 'undefined' && CARTOES.listarResumos) {
      var prefixo = ano + '-' + String(mes).padStart(2, '0');
      var vistos = {};
      CARTOES.listarResumos(this._hoje(hoje)).forEach(function(r) {
        if (!r) return;
        [r.faturaAtual, r.proximaFatura].forEach(function(f) {
          if (!f || !f.vencimento || !(Number(f.total) > 0)) return;
          if (String(f.vencimento).slice(0, 7) !== prefixo) return;
          // Fatura atual e próxima podem coincidir num mesmo mês curto: dedup.
          var chave = (r.nome || '') + '|' + (f.competencia || f.vencimento);
          if (vistos[chave]) return;
          vistos[chave] = true;
          eventos.push({
            data: String(f.vencimento).slice(0, 10),
            tipo: 'cartao',
            titulo: 'Fatura ' + (r.nome || 'cartão'),
            valor: Number(f.total) || 0,
            competencia: f.competencia
          });
        });
      });
    }

    // Dias até o vencimento (0 = hoje, negativo = vencido), quando UTILS souber.
    if (typeof UTILS !== 'undefined' && typeof UTILS.diasAte === 'function') {
      eventos.forEach(function(e) { e.dias = UTILS.diasAte(e.data); });
    }

    eventos.sort(function(a, b) {
      if (a.data !== b.data) return a.data < b.data ? -1 : 1;
      return a.tipo < b.tipo ? -1 : a.tipo > b.tipo ? 1 : 0;
    });

    var totalCent = eventos.reduce(function(s, e) {
      return s + (typeof UTILS !== 'undefined' && UTILS.paraCentavos
        ? UTILS.paraCentavos(e.valor)
        : Math.round((Number(e.valor) || 0) * 100));
    }, 0);

    return { eventos: eventos, total: totalCent / 100, quantidade: eventos.length };
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CALENDARIO;
}
