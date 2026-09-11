/**
 * e2e/caminho-do-dinheiro.spec.cjs
 * Porta o cenário de tests/caminho-do-dinheiro.test.js para o navegador.
 */
const { test, expect } = require('@playwright/test');
const { waitForAppBoot, dismissOverlays } = require('./helpers.cjs');

async function seedCenario(page) {
  await page.addInitScript(function() {
    if (localStorage.getItem('fp-caminho-e2e')) return;
    localStorage.setItem('fp-config', JSON.stringify({
      nome: 'Caminho E2E',
      moeda: 'BRL',
      tema: 'light',
      plano: 'free',
      pinAtivo: false,
      onboardingConcluido: true,
      renda: 6000,
      saldosIniciais: { Corrente: 2000 },
      cartoes: [{ nome: 'Cartão', limite: 8000, fechamento: 20, vencimento: 28 }],
      contasPagar: [{
        id: 'cp-1', descricao: 'Aluguel', valor: 1800,
        vencimento: '2026-08-25', status: 'pendente',
      }],
      metas: [{
        id: 'meta-1', titulo: 'Reserva', valorAlvo: 12000, valorAtual: 3000,
        prazo: '2027-02-28', criadoEm: new Date(2026, 1, 15).toISOString(),
        concluida: false,
      }],
      _schemaVer: 2,
    }));
    localStorage.setItem('fp-transacoes', '[]');
    localStorage.setItem('fp-contas', '[]');
    localStorage.setItem('fp-caminho-e2e', '1');
  });
}

test.describe('caminho do dinheiro — E2E', function() {
  test('módulos concordam no mesmo cenário mensal', async function({ page, baseURL }) {
    await seedCenario(page);
    await page.goto((baseURL || 'http://127.0.0.1:4321') + '/?offline=1');
    await waitForAppBoot(page);
    await dismissOverlays(page);

    var resultado = await page.evaluate(async function() {
      if (typeof ORCAMENTO !== 'undefined') ORCAMENTO.init();
      ORCAMENTO.definirLimite('alimentacao', 1000);

      TRANSACOES.criar('receita', 6000, 'salario', '2026-08-01', 'Salário', 'Corrente', '');
      TRANSACOES.criar('despesa', 700, 'alimentacao', '2026-08-05', 'Mercado', 'Corrente', '');

      var parcelas = UTILS.dividirEmParcelas(1200, 3);
      parcelas.forEach(function(valor, i) {
        TRANSACOES.criar(
          'despesa', valor, 'compras',
          UTILS.addMesesClamp('2026-08-10', i),
          'TV (' + (i + 1) + '/3)', '', 'Cartão',
        );
      });

      TRANSACOES.criarTransferencia({
        valor: 500, data: '2026-08-12', origem: 'Corrente', destino: 'Poupança',
      });

      if (typeof DADOS !== 'undefined' && DADOS.aguardarDisco) {
        await DADOS.aguardarDisco();
      }

      var resumo = TRANSACOES.obterResumoMes(8, 2026);
      var corrente = CONTAS.saldos({ ate: new Date(2026, 7, 15) }).find(function(c) {
        return c.nome === 'Corrente';
      });
      var poupanca = CONTAS.saldos({ ate: new Date(2026, 7, 15) }).find(function(c) {
        return c.nome === 'Poupança';
      });
      var comprometido = COMPROMISSOS.comprometido(new Date(2026, 7, 15));
      var disponivel = COMPROMISSOS.disponivel(new Date(2026, 7, 15));
      var painel = typeof FINANCE_RECONCILER !== 'undefined'
        ? FINANCE_RECONCILER.verificarPainel()
        : { ok: true };

      return {
        resumo: resumo,
        corrente: corrente && corrente.saldo,
        poupanca: poupanca && poupanca.saldo,
        saldoTotal: CONTAS.saldoTotal({ ate: new Date(2026, 7, 15) }),
        comprometido: comprometido,
        disponivel: disponivel,
        painelOk: painel.ok,
      };
    });

    expect(resultado.resumo.receitas).toBe(6000);
    expect(resultado.resumo.despesas).toBe(1100);
    expect(resultado.corrente).toBe(6800);
    expect(resultado.poupanca).toBe(500);
    expect(resultado.saldoTotal).toBe(7300);
    expect(resultado.comprometido.total).toBe(3000);
    expect(resultado.disponivel.valor).toBe(4300);
    expect(resultado.painelOk).toBe(true);
  });
});
