/**
 * finance-contract.test.js — contrato PT↔EN único (Fase 2).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadFC() {
  const file = path.join(__dirname, '..', 'js', 'core', 'finance-contract.js');
  const ctx = vm.createContext({ Date, parseFloat, isNaN, Object, Array, String, Number, DADOS: null, module: { exports: {} } });
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  return ctx.FINANCE_CONTRACT;
}

const FC = loadFC();
const UUID_A = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const UUID_B = '9c858901-8a57-4791-81fe-4c455b099bc9';
const contas = [
  { id: UUID_A, nome: 'Corrente' },
  { id: UUID_B, nome: 'Poupança' },
];

describe('FINANCE_CONTRACT — transações', () => {
  test('txPtToEn resolve nomes de conta para UUID', () => {
    const en = FC.txPtToEn({
      tipo: 'despesa', valor: 50, descricao: 'Teste', categoria: 'outro', data: '2026-08-05',
      banco: 'Corrente',
    }, contas);
    expect(en.accountId).toBe(UUID_A);
  });

  test('transferencia mapeia conta destino', () => {
    const en = FC.txPtToEn({
      tipo: 'transferencia', valor: 1000, categoria: 'transferencia', data: '2026-08-05',
      descricao: 'Transf', banco: 'Corrente', contaDestino: 'Poupança',
    }, contas);
    expect(en.accountId).toBe(UUID_A);
    expect(en.targetAccountId).toBe(UUID_B);
  });

  test('txEnToPt restaura labels legíveis', () => {
    const pt = FC.txEnToPt({
      id: UUID_A, type: 'transferencia', amount: 100, category: 'transferencia',
      description: 'T', date: '2026-08-05T00:00:00.000Z',
      accountId: UUID_A, targetAccountId: UUID_B,
    }, contas);
    expect(pt.banco).toBe('Corrente');
    expect(pt.contaDestino).toBe('Poupança');
    expect(pt.contaDestinoId).toBe(UUID_B);
  });
});

describe('FINANCE_CONTRACT — contas', () => {
  test('contaPtToEn mapeia tipo corrente → checking', () => {
    expect(FC.contaPtToEn({ nome: 'Nubank', tipo: 'corrente', saldo: 10 }).type).toBe('checking');
  });

  test('contaEnToPt mapeia checking → corrente', () => {
    expect(FC.contaEnToPt({ id: UUID_A, name: 'X', type: 'checking', balance: 5 }).tipo).toBe('corrente');
  });
});

describe('FINANCE_CONTRACT — recorrentes', () => {
  test('recorrentePtToEn usa dataInicio e frequencia mensal', () => {
    const en = FC.recorrentePtToEn({
      tipo: 'despesa', valor: 1500, descricao: 'Aluguel', categoria: 'moradia',
      frequencia: 'mensal', dataInicio: '2026-06-05',
    });
    expect(en.frequency).toBe('monthly');
    expect(en.startDate).toContain('2026-06-05');
    expect(en.nextDue).toContain('2026-06-05');
  });

  test('recorrenteEnToPt converte frequency monthly → mensal', () => {
    const pt = FC.recorrenteEnToPt({
      id: 'r1', type: 'despesa', amount: 59.9, description: 'Stream', category: 'assinaturas',
      frequency: 'monthly', startDate: '2026-08-01T00:00:00.000Z', nextDue: '2026-09-01T00:00:00.000Z',
    });
    expect(pt.frequencia).toBe('mensal');
    expect(pt.dataInicio).toBe('2026-08-01');
  });
});
