/**
 * resumo-mensal.js — texto compartilhável do "meu mês em números".
 *
 * Transforma o resumo do mês (RELATORIOS.resumoMes) num texto curto e honesto
 * que o usuário pode enviar a si mesmo, à família ou a quem divide as contas —
 * via Web Share ou área de transferência. É só leitura: não altera nada.
 *
 * Puro, sem DOM. Dependências checadas com typeof.
 */
var RESUMO_MENSAL = {

  _fmt: function(v) {
    return (typeof UTILS !== 'undefined' && UTILS.formatarMoeda)
      ? UTILS.formatarMoeda(v)
      : ('R$ ' + Number(v).toFixed(2));
  },

  /** Nome do mês por componentes locais (nunca new Date('YYYY-MM-DD')). */
  _nomeMes: function(mes, ano) {
    var d = new Date(ano, mes - 1, 1);
    var s = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  },

  /**
   * Números do mês + taxa de poupança derivada. null quando não há lançamentos
   * — não faz sentido compartilhar um mês vazio.
   */
  dados: function(mes, ano) {
    if (typeof RELATORIOS === 'undefined' || !RELATORIOS.resumoMes) return null;
    var r = RELATORIOS.resumoMes(mes, ano);
    if (!r || !r.transacoes) return null;

    // Poupança só faz sentido com receita e sobra positiva; senão, null.
    var taxaPoupanca = (r.receitas > 0 && r.saldo > 0)
      ? Math.round((r.saldo / r.receitas) * 100)
      : null;

    return {
      mes: mes,
      ano: ano,
      nomeMes: this._nomeMes(mes, ano),
      receitas: r.receitas,
      despesas: r.despesas,
      saldo: r.saldo,
      taxaPoupanca: taxaPoupanca,
      topCategoria: (r.topCategorias && r.topCategorias[0]) ? r.topCategorias[0] : null,
      transacoes: r.transacoes
    };
  },

  /**
   * Texto pronto para compartilhar. null quando não há dados no mês.
   *
   * Sem exclamação e sem jargão (voz da marca); positivo quando há sobra,
   * honesto quando o mês fechou no vermelho.
   */
  texto: function(mes, ano) {
    var d = this.dados(mes, ano);
    if (!d) return null;

    var linhas = [];
    linhas.push('Meu mês em números — ' + d.nomeMes);
    linhas.push('');
    linhas.push('Receitas: ' + this._fmt(d.receitas));
    linhas.push('Despesas: ' + this._fmt(d.despesas));

    if (d.saldo >= 0) {
      linhas.push('Saldo: ' + this._fmt(d.saldo));
      if (d.taxaPoupanca != null) {
        linhas.push('Você poupou ' + d.taxaPoupanca + '% do que ganhou');
      }
    } else {
      linhas.push('Saldo: -' + this._fmt(Math.abs(d.saldo)) + ' (fechou no vermelho)');
    }

    if (d.topCategoria) {
      linhas.push('Maior gasto: ' + d.topCategoria.label + ' — ' + this._fmt(d.topCategoria.valor) +
        (d.topCategoria.percentual ? ' (' + d.topCategoria.percentual + '%)' : ''));
    }

    linhas.push('');
    linhas.push('Organizado no FinançasPro');
    return linhas.join('\n');
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = RESUMO_MENSAL;
}
