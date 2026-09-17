/**
 * projecao.js — Projeção determinística do saldo de fim de mês.
 *
 * Responde "como meu mês vai fechar?" com o que o app JÁ SABE, sem IA e sem
 * paywall: parte do saldo realizado do mês (receitas − despesas já lançadas) e
 * desconta as contas a pagar ainda EM ABERTO no mês — saídas certas que ainda
 * não viraram lançamento. É o fluxo de caixa projetado que Mobills/Organizze
 * destacam, mas honesto sobre o que entra na conta.
 *
 * Por que cartão fica de fora: uma compra no cartão já entra como despesa na
 * DATA DA COMPRA (cartoes.js soma as transações do ciclo), então ela já pesou
 * no saldo realizado. Somar também o vencimento da fatura contaria o mesmo
 * gasto duas vezes — num app financeiro, errar para baixo o saldo é pior do
 * que não projetar. Por isso a projeção usa só as contas a pagar pendentes,
 * que ainda não foram lançadas (marcarPago é que gera a despesa).
 *
 * Não confundir com AI_ENGINE.projetarFimMes (insights): aquela extrapola o
 * RITMO de gastos do mês (taxa diária × dias restantes) e é Pro. Esta é o
 * recorte determinístico e gratuito — só o que já está lançado menos o que já
 * se sabe que ainda vai sair.
 *
 * Puro, sem DOM. Dependências checadas com typeof.
 */
var PROJECAO = {
  /**
   * Projeção do saldo ao fim do mês.
   *
   * @param {number} mes 1-12
   * @param {number} ano
   * @returns {{saldoAtual:number, aPagar:number, projetado:number,
   *            contasEmAberto:number, positivo:boolean, temDados:boolean}}
   */
  doMes: function(mes, ano) {
    var paraCent = (typeof UTILS !== 'undefined' && UTILS.paraCentavos)
      ? UTILS.paraCentavos
      : function(v) { var n = Number(v); return isFinite(n) ? Math.round(n * 100) : 0; };

    // Saldo já realizado no mês (receitas − despesas lançadas), em centavos.
    var resumo = (typeof RELATORIOS !== 'undefined' && RELATORIOS.resumoMes)
      ? RELATORIOS.resumoMes(mes, ano) : null;
    var saldoCent = resumo ? paraCent(resumo.saldo) : 0;

    // Contas a pagar em aberto no mês: listarNoMes já devolve só as pendentes.
    var aPagarCent = 0;
    var emAberto = 0;
    if (typeof CONTAS_PAGAR !== 'undefined' && CONTAS_PAGAR.listarNoMes) {
      CONTAS_PAGAR.listarNoMes(mes, ano).forEach(function(c) {
        if (!c) return;
        aPagarCent += paraCent(c.valor);
        emAberto++;
      });
    }

    var projetadoCent = saldoCent - aPagarCent;
    return {
      saldoAtual: saldoCent / 100,
      aPagar: aPagarCent / 100,
      projetado: projetadoCent / 100,
      contasEmAberto: emAberto,
      positivo: projetadoCent >= 0,
      temDados: resumo != null
    };
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PROJECAO;
}
