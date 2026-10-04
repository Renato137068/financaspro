/**
 * vitrine-dados.cjs — dados de exemplo das capturas da Play Store.
 *
 * Uma pessoa fictícia num mês comum: salário, aluguel, mercado, cartão com
 * compras parceladas, orçamento com uma categoria perto do limite e duas metas
 * em andamento. Tudo relativo a `hoje`, para as capturas nunca mostrarem um
 * mês vazio nem um mês velho; quem gera fixa `hoje` no dia 24, quando o mês já
 * tem movimento e a fatura do cartão já fechou.
 *
 * Os campos são os que o app grava (fp-config, fp-transacoes, fp-contas). As
 * parcelas seguem o formulário de lançamento: uma transação por mês, com
 * "(i/n)" na descrição e o nome do cartão no campo `cartao`.
 */

function pad(n) { return String(n).padStart(2, '0'); }

/** 'AAAA-MM-DD' de `dia` no mês `hoje + desloc`, sem passar do último dia. */
function dataNoMes(hoje, desloc, dia) {
  var base = new Date(hoje.getFullYear(), hoje.getMonth() + desloc, 1);
  var ultimo = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  return base.getFullYear() + '-' + pad(base.getMonth() + 1) + '-' + pad(Math.min(dia, ultimo));
}

function orcamentos(limites, hoje) {
  var definidoEm = new Date(hoje.getFullYear(), hoje.getMonth() - 3, 1).toISOString();
  var out = {};
  Object.keys(limites).forEach(function(cat) { out[cat] = { limite: limites[cat], definidoEm: definidoEm }; });
  return out;
}

/** Faturas dos últimos meses marcadas como pagas (chave de CARTOES._chaveFatura). */
function faturasPagas(cartao, hoje) {
  var out = {};
  for (var m = -6; m <= 0; m++) {
    var competencia = dataNoMes(hoje, m, 1).slice(0, 7);
    out[cartao.toLowerCase() + '|' + competencia] = dataNoMes(hoje, m, 7);
  }
  return out;
}

function dadosDaVitrine(hoje) {
  var seq = 0;
  var tx = [];
  function lanc(tipo, valor, categoria, data, descricao, extra) {
    seq += 1;
    tx.push(Object.assign({
      id: 'vit-' + seq,
      tipo: tipo,
      valor: valor,
      categoria: categoria,
      data: data,
      descricao: descricao,
      criadoEm: data + 'T12:00:00.000Z',
      updatedAt: data + 'T12:00:00.000Z',
    }, extra || {}));
  }

  // Três meses de histórico (para gráficos e comparação) mais o mês atual.
  for (var m = -3; m <= 0; m++) {
    var atual = m === 0;
    var f = 1 + (m * 0.03); // meses anteriores um pouco diferentes
    lanc('receita', 6800, 'salario', dataNoMes(hoje, m, 5), 'Salário');
    if (m !== -2) lanc('receita', atual ? 950 : 720, 'freelance', dataNoMes(hoje, m, 14), 'Projeto freelance');
    lanc('despesa', 1850, 'moradia', dataNoMes(hoje, m, 6), 'Aluguel');
    lanc('despesa', 119.9, 'servicos_financeiros', dataNoMes(hoje, m, 8), 'Internet e celular');
    lanc('despesa', 55.9, 'assinaturas', dataNoMes(hoje, m, 10), 'Streaming');
    lanc('despesa', 99.9, 'saude', dataNoMes(hoje, m, 3), 'Academia');
    lanc('despesa', Math.round(412.37 * f * 100) / 100, 'alimentacao', dataNoMes(hoje, m, 7), 'Supermercado');
    lanc('despesa', Math.round(286.15 * f * 100) / 100, 'alimentacao', dataNoMes(hoje, m, 18), 'Supermercado');
    lanc('despesa', 78.9, 'alimentacao', dataNoMes(hoje, m, 12), 'Delivery');
    lanc('despesa', Math.round(230 * f * 100) / 100, 'transporte', dataNoMes(hoje, m, 9), 'Combustível');
    lanc('despesa', 42.5, 'transporte', dataNoMes(hoje, m, 16), 'Transporte por app');
    lanc('despesa', atual ? 138 : 96, 'lazer', dataNoMes(hoje, m, 20), atual ? 'Show' : 'Cinema');
    lanc('despesa', 64.3, 'saude', dataNoMes(hoje, m, 11), 'Farmácia', { cartao: 'Cartão Roxo' });
    lanc('despesa', 189, 'educacao', dataNoMes(hoje, m, 2), 'Curso de inglês');
  }
  lanc('despesa', 112.4, 'alimentacao', dataNoMes(hoje, 0, 22), 'Feira e padaria');
  lanc('despesa', 159.9, 'vestuario', dataNoMes(hoje, 0, 15), 'Tênis', { cartao: 'Cartão Roxo' });

  // Compras parceladas no cartão: começaram antes e seguem nos próximos meses.
  [
    { desc: 'Geladeira', total: 3299, n: 10, inicio: -3 },
    { desc: 'Notebook', total: 4188, n: 12, inicio: -1 },
    { desc: 'Passagens de férias', total: 1740, n: 6, inicio: 0 },
  ].forEach(function(c) {
    var cent = Math.round(c.total * 100);
    var base = Math.floor(cent / c.n);
    for (var p = 0; p < c.n; p++) {
      var valor = (p === 0 ? cent - base * (c.n - 1) : base) / 100;
      lanc('despesa', valor, c.desc === 'Passagens de férias' ? 'viagem' : 'compras',
        dataNoMes(hoje, c.inicio + p, 4), c.desc + ' (' + (p + 1) + '/' + c.n + ')',
        { cartao: 'Cartão Roxo' });
    }
  });

  var config = {
    nome: 'Marina',
    moeda: 'BRL',
    tema: 'light',
    plano: 'free',
    renda: 7750,
    pinAtivo: false,
    onboardingConcluido: true,
    tourConcluido: true,
    // Formato que o app grava (BUDGET_SERVICE.setBudget).
    orcamentos: orcamentos({
      alimentacao: 1100,
      moradia: 2000,
      transporte: 450,
      lazer: 300,
      saude: 300,
      educacao: 250,
    }, hoje),
    // As faturas que já venceram estão pagas; sem isso o resumo abre com
    // "Fatura vencida — foi paga?" em cima de tudo.
    faturasPagas: faturasPagas('Cartão Roxo', hoje),
    // Backup feito: sem isso o aviso "N transações sem backup" cobre a tela.
    ultimoExportoDados: hoje.toISOString(),
    regra503020: { necessidades: 50, desejos: 30, poupanca: 20 },
    cartoes: [
      { nome: 'Cartão Roxo', bandeira: 'mastercard', limite: 12000, fechamento: 1, vencimento: 8 },
    ],
    metas: [
      { id: 'meta-1', nome: 'Reserva de emergência', valorAlvo: 15000, valorAtual: 9300, prazo: dataNoMes(hoje, 8, 28), criadaEm: dataNoMes(hoje, -6, 1) },
      { id: 'meta-2', nome: 'Viagem de férias', valorAlvo: 6000, valorAtual: 2450, prazo: dataNoMes(hoje, 5, 15), criadaEm: dataNoMes(hoje, -3, 1) },
    ],
    assinaturas: [
      { id: 'sub-1', nome: 'Streaming', valor: 55.9, diaCobranca: 10, ativa: true, categoria: 'assinaturas' },
    ],
    _schemaVer: 2,
  };

  var contas = [
    { id: 'conta-1', nome: 'Conta corrente', tipo: 'corrente', saldoInicial: 2400, cor: '#12694E' },
  ];

  return {
    'fp-config': JSON.stringify(config),
    'fp-transacoes': JSON.stringify(tx),
    'fp-contas': JSON.stringify(contas),
  };
}

module.exports = { dadosDaVitrine, dataNoMes };
