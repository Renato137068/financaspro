/**
 * invariantes-financeiras.test.js — Fase 3: regras que o dinheiro não pode quebrar.
 */
const { loadCoreModules, resetFixtures } = require('./load-sources');

beforeAll(() => { loadCoreModules(); });
beforeEach(() => { resetFixtures(); DADOS._modoLocal = true; });

describe('invariante: saldo = inicial + receitas - despesas', () => {
  test('por conta, com centavos exatos', () => {
    DADOS.salvarConfig({ saldosIniciais: { Nubank: 1000 } });
    DADOS.salvarTransacao({ id: 't1', tipo: 'receita', valor: 500, categoria: 'salario', data: '2026-08-01', descricao: 'x', banco: 'Nubank' });
    DADOS.salvarTransacao({ id: 't2', tipo: 'despesa', valor: 200.5, categoria: 'outro', data: '2026-08-02', descricao: 'y', banco: 'Nubank' });

    const c = CONTAS.saldos().find((x) => x.nome === 'Nubank');
    expect(c.saldoInicial).toBe(1000);
    expect(c.entradas).toBe(500);
    expect(c.saidas).toBe(200.5);
    expect(c.saldo).toBe(1299.5);
  });
});

describe('invariante: transferências não alteram patrimônio', () => {
  test('saldo total constante após transferência', () => {
    DADOS.salvarTransacao({ id: 'r1', tipo: 'receita', valor: 5000, categoria: 'salario', data: '2026-08-01', descricao: 's', banco: 'A' });
    const antes = CONTAS.saldoTotal();
    TRANSACOES.criarTransferencia({ valor: 1500, data: '2026-08-02', origem: 'A', destino: 'B' });
    expect(CONTAS.saldoTotal()).toBe(antes);
  });
});

describe('invariante: import idempotente', () => {
  test('mesmo id importado duas vezes não duplica', () => {
    const payload = {
      transacoes: [{
        id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
        tipo: 'despesa', valor: 99, categoria: 'outro', data: '2026-08-05', descricao: 'unico',
      }],
    };
    INIT_CONFIG.importarDados(payload);
    INIT_CONFIG.importarDados(payload);
    expect(DADOS.getTransacoes()).toHaveLength(1);
  });
});

describe('parser e validação — Fase 3', () => {
  test('parseMoeda aceita 1234.56 (US) e 1234,56 (BR)', () => {
    expect(UTILS.parseMoeda('1234.56')).toBeCloseTo(1234.56, 2);
    expect(UTILS.parseMoeda('1234,56')).toBeCloseTo(1234.56, 2);
    expect(UTILS.parseMoeda('1.234,56')).toBeCloseTo(1234.56, 2);
  });

  test('rejeita Infinity e NaN em validarValor', () => {
    expect(VALIDATIONS.validarValor(Infinity).valido).toBe(false);
    expect(VALIDATIONS.validarValor('abc').valido).toBe(false);
  });

  test('validarData rejeita 2026-02-31', () => {
    expect(VALIDATIONS.validarData('2026-02-31').valido).toBe(false);
    expect(VALIDATIONS.validarData('2026-08-09').valido).toBe(true);
  });
});
