/**
 * plano-metas.js — texto compartilhável do plano de metas.
 *
 * Reúne as metas ativas num resumo curto que o usuário pode enviar a si mesmo
 * ou a quem acompanha o objetivo junto: quanto já juntou, quanto falta e o
 * aporte mensal para chegar no prazo. Só leitura, reaproveita METAS.
 *
 * Puro, sem DOM. Dependências checadas com typeof.
 */
var PLANO_METAS = {

  _fmt: function(v) {
    return (typeof UTILS !== 'undefined' && UTILS.formatarMoeda)
      ? UTILS.formatarMoeda(v)
      : ('R$ ' + Number(v).toFixed(2));
  },

  /** Uma entrada por meta ativa, com a frase de projeção pronta. */
  linhas: function(hoje) {
    if (typeof METAS === 'undefined' || !METAS.listar || !METAS.calcularProjecao) return [];
    var metas = METAS.listar(true) || [];
    return metas.map(function(m) {
      var p = METAS.calcularProjecao(m, hoje);
      return {
        titulo: m.titulo || 'Meta',
        percentual: p.percentual,
        valorAtual: m.valorAtual,
        valorAlvo: m.valorAlvo,
        restante: p.restante,
        aporteMensalNecessario: p.aporteMensalNecessario,
        mensagem: METAS.mensagemProjecao ? METAS.mensagemProjecao(m, hoje) : ''
      };
    });
  },

  /** Soma dos aportes mensais necessários (só metas com prazo têm um). */
  totalMensal: function(hoje) {
    return this.linhas(hoje).reduce(function(acc, l) {
      return acc + (l.aporteMensalNecessario > 0 ? l.aporteMensalNecessario : 0);
    }, 0);
  },

  /**
   * Texto pronto para compartilhar. null quando não há meta ativa — não há
   * plano a enviar. Sem exclamação nem jargão (voz da marca).
   */
  texto: function(hoje) {
    var linhas = this.linhas(hoje);
    if (!linhas.length) return null;
    var self = this;

    var out = [];
    out.push('Meu plano de metas');
    out.push('');
    linhas.forEach(function(l, i) {
      out.push((i + 1) + '. ' + l.titulo + ' — ' + self._fmt(l.valorAtual) +
        ' de ' + self._fmt(l.valorAlvo) + ' (' + l.percentual + '%)');
      if (l.mensagem) out.push('   ' + l.mensagem);
    });

    var total = this.totalMensal(hoje);
    if (total > 0) {
      out.push('');
      out.push('Para manter o plano: ' + self._fmt(total) + ' por mês');
    }
    out.push('');
    out.push('Organizado no FinançasPro');
    return out.join('\n');
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PLANO_METAS;
}
