/**
 * accountId-patrimonio.test.js — write-path accountId + reconciliação patrimônio.
 */
const { loadCoreModules, resetFixtures } = require('./load-sources');

loadCoreModules();

const UUID_A = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const UUID_B = '9c858901-8a57-4791-81fe-4c455b099bc9';

beforeEach(function() {
  resetFixtures();
});

function semearConta(over) {
  const c = Object.assign({ id: UUID_A, nome: 'Nubank', tipo: 'corrente' }, over || {});
  DADOS.salvarContas([c].concat(DADOS.getContas().filter((x) => x.id !== c.id)));
  CONTAS.init();
  return c;
}

describe('accountId no write-path', function() {
  test('criar resolve accountId pelo nome do banco', function() {
    semearConta();
    const tx = TRANSACOES.criar('receita', 100, 'salario', '2026-08-01', 'Salário', 'Nubank', '');
    expect(tx.accountId).toBe(UUID_A);
  });

  test('criarTransferencia grava accountId e contaDestinoId', function() {
    DADOS.salvarContas([
      { id: UUID_A, nome: 'Corrente', tipo: 'corrente' },
      { id: UUID_B, nome: 'Poupança', tipo: 'poupanca' },
    ]);
    CONTAS.init();
    const tx = TRANSACOES.criarTransferencia({
      valor: 50,
      data: '2026-08-02',
      origem: 'Corrente',
      destino: 'Poupança',
    });
    expect(tx.accountId).toBe(UUID_A);
    expect(tx.contaDestinoId).toBe(UUID_B);
  });

  test('saldo sobrevive a rename via accountId', function() {
    semearConta({ nome: 'Nubank' });
    DADOS.salvarConfig({ bancos: ['Nubank'], saldosIniciais: { Nubank: 1000 } });
    TRANSACOES.criar('despesa', 100, 'outro', '2026-08-04', 'Mercado', 'Nubank', '');
    CONTAS.salvar({ id: UUID_A, nome: 'Nu Conta', tipo: 'corrente' });
    CONTAS.propagarRename(UUID_A, 'Nubank', 'Nu Conta');
    const depois = CONTAS.saldos().find((c) => c.nome === 'Nu Conta');
    expect(depois.saldo).toBe(900);
  });
});

describe('PATRIMONIO.reconciliarContas', function() {
  test('detecta sobreposição por contaId', function() {
    semearConta();
    DADOS.salvarConfig({ bancos: ['Nubank'], saldosIniciais: { Nubank: 500 } });
    PATRIMONIO.criarAtivo({ nome: 'Nubank', tipo: 'corrente', valor: 500, contaId: UUID_A });
    const r = PATRIMONIO.reconciliarContas();
    expect(r.overlaps).toHaveLength(1);
    expect(r.liquidoSemSobreposicao).toBe(0);
  });

  test('sugerirDeContas inclui saldo do ledger', function() {
    semearConta();
    DADOS.salvarConfig({ bancos: ['Nubank'], saldosIniciais: { Nubank: 350.5 } });
    const sug = PATRIMONIO.sugerirDeContas();
    expect(sug[0].saldoLedger).toBe(350.5);
  });
});

describe('CONTAS.renderBancoSelect', function() {
  test('mescla fp-contas (id) com bancos legados (nome)', function() {
    semearConta({ nome: 'Nubank' });
    DADOS.salvarConfig({ bancos: [{ nome: 'Itaú', tipo: 'Conta Corrente' }] });
    document.body.innerHTML = '<select id="novo-banco"></select>';
    CONTAS.renderBancoSelect('novo-banco');
    const sel = document.getElementById('novo-banco');
    const values = Array.from(sel.options).map((o) => o.value).filter(Boolean);
    expect(values).toContain(UUID_A);
    expect(values).toContain('Itaú');
    expect(values).not.toContain('Nubank');
  });

  test('resolveBancoSelectValue mapeia nome para id', function() {
    semearConta({ nome: 'Nubank' });
    expect(CONTAS.resolveBancoSelectValue('Nubank')).toBe(UUID_A);
  });

  test('mesmaConta compara id com nome legado', function() {
    semearConta({ nome: 'Nubank' });
    expect(CONTAS.mesmaConta(UUID_A, 'Nubank')).toBe(true);
  });
});

describe('RECORRENTES com accountId', function() {
  test('materializa lançamento com accountId', function() {
    semearConta({ nome: 'Nubank' });
    DADOS._modoLocal = true;
    DADOS.salvarConfig({
      recorrentes: [{
        id: 'rec-acc',
        tipo: 'despesa',
        valor: 99,
        categoria: 'assinaturas',
        descricao: 'Stream',
        frequencia: 'mensal',
        dataInicio: '2026-08-05',
        ativo: true,
        banco: 'Nubank',
        accountId: UUID_A,
      }],
    });
    const criadas = RECORRENTES.processar(new Date(2026, 7, 10));
    expect(criadas).toHaveLength(1);
    expect(criadas[0].accountId).toBe(UUID_A);
  });
});
