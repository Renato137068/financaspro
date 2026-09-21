/**
 * resumo-anual.test.js — retrospectiva do ano compartilhável (RESUMO_ANUAL).
 * Módulo puro em vm com RELATORIOS/UTILS mockados.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');

function carregar(resumoAno) {
  const ctx = {
    Math: Math, Number: Number,
    RELATORIOS: { resumoAno: function() { return resumoAno; } },
    UTILS: { formatarMoeda: function(v) { return 'R$ ' + Number(v).toFixed(2); } },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/resumo-anual.js'), 'utf8'), ctx,
    { filename: path.join(root, 'js/resumo-anual.js') });
  return ctx.RESUMO_ANUAL;
}

describe('RESUMO_ANUAL.texto', function() {
  test('poucos meses de dados → null (não é retrospectiva)', function() {
    expect(carregar({ mesesComDados: 1 }).texto(2026)).toBeNull();
    expect(carregar(null).texto(2026)).toBeNull();
  });

  test('ano positivo traz totais, poupança e meses extremos', function() {
    const t = carregar({
      mesesComDados: 12, receitas: 60000, despesas: 42000, saldo: 18000,
      taxaPoupanca: 30, mediaDespesaMensal: 3500,
      maiorDespesaMes: { mes: 12, despesas: 6000 },
      menorDespesaMes: { mes: 2, despesas: 2000 },
    }).texto(2026);
    expect(t).toContain('Meu 2026 em números');
    expect(t).toContain('Receitas: R$ 60000.00');
    expect(t).toContain('Sobrou: R$ 18000.00');
    expect(t).toContain('Você poupou 30% do que ganhou');
    expect(t).toContain('Média de gastos por mês: R$ 3500.00');
    expect(t).toContain('Mês mais caro: Dezembro (R$ 6000.00)');
    expect(t).toContain('Mês mais econômico: Fevereiro (R$ 2000.00)');
    expect(t).toContain('Organizado no FinançasPro');
  });

  test('ano no vermelho é honesto e sem poupança', function() {
    const t = carregar({
      mesesComDados: 8, receitas: 10000, despesas: 13000, saldo: -3000,
      taxaPoupanca: null, mediaDespesaMensal: 1625, maiorDespesaMes: null, menorDespesaMes: null,
    }).texto(2026);
    expect(t).toContain('fechou no vermelho');
    expect(t).not.toMatch(/poupou/);
  });

  test('não repete o mês quando maior e menor coincidem', function() {
    const t = carregar({
      mesesComDados: 3, receitas: 100, despesas: 50, saldo: 50, taxaPoupanca: 50, mediaDespesaMensal: 16,
      maiorDespesaMes: { mes: 5, despesas: 50 }, menorDespesaMes: { mes: 5, despesas: 50 },
    }).texto(2026);
    expect((t.match(/Maio/g) || []).length).toBe(1);
  });

  test('não termina em exclamação (voz da marca)', function() {
    const t = carregar({
      mesesComDados: 2, receitas: 100, despesas: 50, saldo: 50, taxaPoupanca: 50, mediaDespesaMensal: 25,
      maiorDespesaMes: null, menorDespesaMes: null,
    }).texto(2026);
    expect(t.trim().endsWith('!')).toBe(false);
  });
});
