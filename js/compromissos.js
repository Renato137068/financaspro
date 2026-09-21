/**
 * compromissos.js — o que já tem dono, e o que sobra de verdade.
 * v11.0 — Depende de: config.js, dados.js, utils.js, contas.js
 *
 * O dashboard sabia dizer quanto entrou e quanto saiu. Não sabia dizer as duas
 * coisas que decidem se a pessoa compra ou não compra algo hoje:
 *
 *   COMPROMETIDO — dinheiro que ainda está na conta mas já tem destino:
 *   parcelas de meses futuros, contas a pagar em aberto.
 *
 *   DISPONÍVEL — o saldo menos o comprometido.
 *
 * A diferença entre os dois é onde o orçamento estoura. Um saldo de R$ 3.000
 * parece folga; se R$ 2.400 já estão prometidos ao cartão, a folga real é
 * R$ 600 — e é esse o número que muda uma decisão.
 *
 * Nada aqui é armazenado: tudo é derivado das transações e das contas a pagar,
 * pelo mesmo motivo do saldo por conta — um número guardado precisa ser mantido
 * em sincronia com registros que são editados e apagados, e é assim que nascem
 * divergências que ninguém consegue explicar depois.
 */
var COMPROMISSOS = {

  /** Normaliza "hoje", aceitando Date de qualquer realm (ver METAS._agora). */
  _agora: function(valor) {
    if (valor && typeof valor.getTime === 'function' && !isNaN(valor.getTime())) {
      return valor;
    }
    return new Date();
  },

  /**
   * Soma o que já está comprometido daqui para frente.
   *
   * @param {Date} [hoje] injetável para teste
   * @returns {{parcelasFuturas:number, contasPagar:number, total:number}}
   */
  comprometido: function(hoje) {
    var ref = this._agora(hoje);
    var hojeIso = UTILS.dataLocalIso(ref);

    var txs = (typeof DADOS !== 'undefined' && DADOS.getTransacoes)
      ? DADOS.getTransacoes() : [];
    var config = (typeof DADOS !== 'undefined' && DADOS.getConfig)
      ? DADOS.getConfig() : {};

    // ── Despesas já lançadas com data futura ─────────────────────────────
    // É assim que o parcelamento grava: uma transação por parcela, cada uma
    // no mês em que cai. As de meses à frente ainda não saíram da conta, mas
    // já estão prometidas.
    //
    // Só DESPESA entra. Transferência agendada não é compromisso — o dinheiro
    // continua com o usuário, só muda de conta. Receita futura, obviamente,
    // também não.
    var parcelasCent = 0;
    txs.forEach(function(t) {
      if (!t || t.tipo !== CONFIG.TIPO_DESPESA) return;

      // Compra em cartão cadastrado é contabilizada pelo ciclo de fatura, logo
      // abaixo. Deixá-la aqui também contaria o mesmo dinheiro duas vezes —
      // uma parcela futura no cartão é, ao mesmo tempo, "despesa futura" e
      // "compra no cartão", e só pode entrar por um caminho.
      if (typeof CARTOES !== 'undefined' && CARTOES.obter(t.cartao)) return;

      var data = String(t.data || '').slice(0, 10);
      // Estritamente maior que hoje: o que vence hoje já entrou no mês corrente
      // e contá-lo de novo seria cobrar a mesma despesa duas vezes.
      if (data > hojeIso) parcelasCent += UTILS.paraCentavos(t.valor);
    });

    // ── Faturas de cartão ainda não vencidas ─────────────────────────────
    // Diferente das parcelas acima, aqui entram TAMBÉM as compras já feitas
    // neste ciclo: o dinheiro ainda está na conta, mas já tem destino.
    var cartoesCent = 0;
    if (typeof CARTOES !== 'undefined' && CARTOES.totalComprometido) {
      cartoesCent = UTILS.paraCentavos(CARTOES.totalComprometido(ref));
    }

    // ── Contas a pagar em aberto ─────────────────────────────────────────
    var contasCent = 0;
    (config.contasPagar || []).forEach(function(c) {
      if (!c || c.status !== 'pendente') return;
      contasCent += UTILS.paraCentavos(c.valor);
    });

    return {
      parcelasFuturas: parcelasCent / 100,
      contasPagar: contasCent / 100,
      cartoes: cartoesCent / 100,
      total: (parcelasCent + contasCent + cartoesCent) / 100
    };
  },

  /**
   * O comprometido daqui para frente, mês a mês — a agenda de desembolsos que
   * `comprometido()` só entrega somada. Responde "quanto já está prometido de
   * outubro, de novembro, de dezembro", que é o que permite ver um mês pesado
   * chegando antes de ele chegar.
   *
   * Cada mês soma três fontes, pela data em que o dinheiro sai:
   *   • faturas de cartão AINDA ABERTAS, pelo mês do vencimento;
   *   • parcelas/despesas futuras fora de cartão cadastrado (senão contaria a
   *     mesma parcela duas vezes — igual a `comprometido()`), pelo mês da data;
   *   • contas a pagar pendentes, pelo mês do vencimento (as já vencidas caem
   *     no primeiro mês da janela, pois ainda são devidas).
   *
   * A janela começa no mês corrente. Só despesa; centavos inteiros.
   *
   * @param {number} [meses=3] tamanho da janela
   * @param {Date} [hoje] injetável para teste
   * @returns {Array<{ano:number, mes:number, cartoes:number, parcelas:number,
   *   contas:number, total:number}>} do mês corrente para frente
   */
  porMes: function(meses, hoje) {
    var ref = this._agora(hoje);
    var janela = (meses && meses > 0) ? meses : 3;
    var hojeIso = UTILS.dataLocalIso(ref);

    // Janela de meses a partir do corrente.
    var baseIdx = ref.getFullYear() * 12 + ref.getMonth(); // mês 0-based
    var buckets = [];
    var porChave = {};
    for (var d = 0; d < janela; d++) {
      var idx = baseIdx + d;
      var ano = Math.floor(idx / 12);
      var mes = (idx % 12) + 1;
      var chave = ano + '-' + String(mes).padStart(2, '0');
      var b = { ano: ano, mes: mes, cartoesCent: 0, parcelasCent: 0, contasCent: 0 };
      buckets.push(b);
      porChave[chave] = b;
    }
    var chaveDe = function(iso) { return String(iso || '').slice(0, 7); };
    var primeira = buckets[0];
    var ultimaChave = buckets[janela - 1].ano + '-' + String(buckets[janela - 1].mes).padStart(2, '0');

    var txs = (typeof DADOS !== 'undefined' && DADOS.getTransacoes)
      ? DADOS.getTransacoes() : [];
    var config = (typeof DADOS !== 'undefined' && DADOS.getConfig)
      ? DADOS.getConfig() : {};

    // ── Parcelas/despesas futuras fora da fatura de cartão ───────────────────
    txs.forEach(function(t) {
      if (!t || t.tipo !== CONFIG.TIPO_DESPESA) return;
      // Cartão COM ciclo entra pela fatura, logo abaixo — contá-lo aqui também
      // duplicaria. Cartão SEM ciclo não tem fatura por competência para cair
      // ali, então a despesa futura dele entra aqui pela data, como uma parcela
      // qualquer; senão sumiria da agenda (mas segue no total comprometido).
      var cardReg = (typeof CARTOES !== 'undefined') ? CARTOES.obter(t.cartao) : null;
      if (cardReg && cardReg.temCiclo) return;
      var data = String(t.data || '').slice(0, 10);
      if (!(data > hojeIso)) return; // só o que ainda vai sair
      var b = porChave[chaveDe(data)];
      if (b) b.parcelasCent += UTILS.paraCentavos(t.valor);
    });

    // ── Faturas de cartão ainda abertas, pelo mês do vencimento ──────────────
    if (typeof CARTOES !== 'undefined' && CARTOES.obter) {
      var cartoes = (config.cartoes || []);
      cartoes.forEach(function(c) {
        var nome = UTILS.nomeDeConta(c);
        var cartao = CARTOES.obter(nome);
        if (!cartao || !cartao.temCiclo) return;
        // Enumera competências cujo vencimento pode cair na janela. Começa em -1:
        // num cartão "fecha 28 / vence 5" (vencimento <= fechamento), a fatura da
        // competência ANTERIOR vence neste mês — sem o -1, o mês corrente perdia
        // essa fatura (e não batia com CARTOES.totalComprometido). Os guardas
        // abaixo (vencida, paga, fora da janela) evitam contar a mais.
        for (var d = -1; d <= janela; d++) {
          var comp = CARTOES._competenciaDe(cartao, ref, d);
          if (!comp) continue;
          var fat = CARTOES.fatura(nome, comp, cartao);
          if (!fat || !fat.vencimento || fat.total <= 0) continue;
          // "Ainda vai sair" = vence de hoje em diante e não foi paga. Não uso
          // fat.status: ele é medido contra o relógio real, e aqui `hoje` é
          // injetável — a mesma regra de CARTOES.resumo, que COMPROMISSOS usa.
          if (fat.vencimento < hojeIso) continue;
          if (CARTOES.faturaEstaPaga(nome, comp)) continue;
          var b = porChave[chaveDe(fat.vencimento)];
          if (b) b.cartoesCent += UTILS.paraCentavos(fat.total);
        }
      });
    }

    // ── Contas a pagar pendentes, pelo mês do vencimento ─────────────────────
    (config.contasPagar || []).forEach(function(conta) {
      if (!conta || conta.status !== 'pendente') return;
      var venc = chaveDe(conta.vencimento);
      var b = porChave[venc];
      if (!b) {
        // Vencida (antes da janela) → devida agora, no primeiro mês. Depois da
        // janela → fora do horizonte, ignora.
        if (venc && venc < (primeira.ano + '-' + String(primeira.mes).padStart(2, '0'))) b = primeira;
        else if (venc && venc > ultimaChave) return;
        else return;
      }
      b.contasCent += UTILS.paraCentavos(conta.valor);
    });

    return buckets.map(function(b) {
      return {
        ano: b.ano,
        mes: b.mes,
        cartoes: b.cartoesCent / 100,
        parcelas: b.parcelasCent / 100,
        contas: b.contasCent / 100,
        total: (b.cartoesCent + b.parcelasCent + b.contasCent) / 100
      };
    });
  },

  /**
   * Quanto realmente sobra: saldo das contas menos o comprometido.
   *
   * `situacao` existe para a UI escolher a cor sem repetir a regra:
   *   negativo  — já deve mais do que tem
   *   apertado  — sobra menos de 10% do saldo
   *   folga     — o resto
   *
   * @param {Date} [hoje] injetável para teste
   * @returns {{valor:number, saldo:number, comprometido:number, situacao:string}}
   */
  disponivel: function(hoje) {
    var ref = this._agora(hoje);
    // Mesma data de corte nos dois lados: o saldo conta o que já aconteceu até
    // hoje, o comprometido conta o que vem depois. Usar datas diferentes faria
    // uma parcela ser descontada do saldo E somada ao comprometido.
    var saldo = (typeof CONTAS !== 'undefined' && CONTAS.saldoTotal)
      ? CONTAS.saldoTotal({ ate: ref }) : 0;
    // Guarda o objeto inteiro (não só .total) para o render reusar sem recalcular
    // comprometido() — que roda CARTOES.totalComprometido/listarResumos.
    var comp = this.comprometido(ref);

    var saldoCent = UTILS.paraCentavos(saldo);
    var compCent = UTILS.paraCentavos(comp.total);
    var dispCent = saldoCent - compCent;

    var situacao;
    if (dispCent < 0) situacao = 'negativo';
    else if (saldoCent > 0 && dispCent < saldoCent * 0.1) situacao = 'apertado';
    else situacao = 'folga';

    return {
      valor: dispCent / 100,
      saldo: saldoCent / 100,
      comprometido: compCent / 100,
      situacao: situacao,
      detalhe: comp
    };
  },

  /**
   * Renderiza os dois KPIs no dashboard.
   *
   * A seção fica escondida enquanto não houver saldo nem compromisso: mostrar
   * "R$ 0,00 disponível" para quem acabou de instalar o app não informa nada e
   * ainda ocupa o espaço mais nobre da tela.
   */
  render: function() {
    var secao = document.getElementById('secao-disponivel');
    var valEl = document.getElementById('kpi-disponivel');
    var compEl = document.getElementById('kpi-comprometido');
    var detEl = document.getElementById('kpi-comprometido-detalhe');
    if (!valEl) return;

    var d = this.disponivel();
    var c = d.detalhe; // já calculado dentro de disponivel(); não recalcula

    if (d.saldo === 0 && c.total === 0) {
      if (secao) secao.style.display = 'none';
      return;
    }
    if (secao) secao.style.display = '';

    valEl.textContent = UTILS.formatarMoeda(d.valor);
    valEl.className = 'kpi-disponivel-valor kpi--' + d.situacao;

    if (compEl) compEl.textContent = UTILS.formatarMoeda(c.total);

    if (detEl) {
      // A composição importa: R$ 2.400 comprometidos em fatura de cartão pedem
      // uma reação diferente de R$ 2.400 em contas a pagar.
      var partes = [];
      if (c.cartoes > 0) {
        partes.push('cartões ' + UTILS.formatarMoeda(c.cartoes));
      }
      if (c.parcelasFuturas > 0) {
        partes.push('parcelas ' + UTILS.formatarMoeda(c.parcelasFuturas));
      }
      if (c.contasPagar > 0) {
        partes.push('contas ' + UTILS.formatarMoeda(c.contasPagar));
      }
      detEl.textContent = partes.join(' · ');
    }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = COMPROMISSOS;
}
