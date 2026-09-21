/**
 * simulador.test.js — simulações financeiras (à vista vs parcelado, juros
 * compostos, financiamento Price). Carrega o módulo puro num contexto vm para
 * a cobertura mapear de volta ao arquivo-fonte.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadSimulador() {
  const ctx = vm.createContext({ Math, Number, JSON, parseFloat, isFinite });
  const file = path.join(__dirname, '..', 'js', 'simulador.js');
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  return ctx.SIMULADOR;
}

const SIM = loadSimulador();

describe('SIMULADOR._cent / helpers', () => {
  test('arredonda ao centavo e resiste ao binário (1.005 → 1.01)', () => {
    expect(SIM._cent(1.005)).toBe(1.01);
    expect(SIM._cent(2.675)).toBe(2.68);
    expect(SIM._cent(10)).toBe(10);
    expect(SIM._cent('lixo')).toBe(0);
    expect(SIM._cent(Infinity)).toBe(0);
  });

  test('_periodos exige inteiro 1..MAX', () => {
    expect(SIM._periodos(12)).toBe(12);
    expect(SIM._periodos(0)).toBe(0);
    expect(SIM._periodos(-3)).toBe(0);
    expect(SIM._periodos(601)).toBe(0);
    expect(SIM._periodos(12.9)).toBe(12);
  });

  test('_valorPresente com i=0 é soma simples', () => {
    expect(SIM._valorPresente(100, 0, 10)).toBe(1000);
  });
});

describe('SIMULADOR.compararParcelado', () => {
  test('entrada incompleta é inválida', () => {
    expect(SIM.compararParcelado({ precoVista: 1000 }).valido).toBe(false);
    expect(SIM.compararParcelado({}).valido).toBe(false);
    expect(SIM.compararParcelado({ precoVista: 1000, numParcelas: 0, valorParcela: 100 }).valido).toBe(false);
  });

  test('parcelado sem juros (10x de 100 = 1000 à vista): taxa 0 e semJuros', () => {
    const r = SIM.compararParcelado({ precoVista: 1000, numParcelas: 10, valorParcela: 100 });
    expect(r.valido).toBe(true);
    expect(r.acrescimo).toBe(0);
    expect(r.taxaMensal).toBe(0);
    expect(r.semJuros).toBe(true);
  });

  test('sem rendimento, parcelado sem juros é indiferente (VP = total)', () => {
    const r = SIM.compararParcelado({ precoVista: 1000, numParcelas: 10, valorParcela: 100, taxaInvestimento: 0 });
    expect(r.vantagem).toBe('indiferente');
    expect(r.valorPresenteParcelado).toBe(1000);
    expect(r.economia).toBe(0);
  });

  test('parcelado sem juros + dinheiro rendendo → parcelar vale a pena', () => {
    const r = SIM.compararParcelado({
      precoVista: 1200, numParcelas: 12, valorParcela: 100, taxaInvestimento: 0.01,
    });
    expect(r.taxaMensal).toBe(0);
    expect(r.vantagem).toBe('parcelado');
    // VP de 12x100 a 1% a.m. = 100·(1-1.01^-12)/0.01
    const vp = 100 * (1 - Math.pow(1.01, -12)) / 0.01;
    expect(r.valorPresenteParcelado).toBeCloseTo(Math.round((vp + Number.EPSILON) * 100) / 100, 2);
    expect(r.economia).toBeCloseTo(1200 - vp, 1);
  });

  test('taxa embutida: 1000 à vista vs 12x de ~100 recupera ~2,92% a.m.', () => {
    // 12 parcelas de 100 por um bem de 1000 à vista.
    const r = SIM.compararParcelado({ precoVista: 1000, numParcelas: 12, valorParcela: 100 });
    expect(r.acrescimo).toBe(200);
    expect(r.acrescimoPct).toBeCloseTo(20, 5);
    // A taxa que zera 1000 = 100·(1-(1+i)^-12)/i ~ 2,9229% a.m.
    expect(r.taxaMensalPct).toBeGreaterThan(2.7);
    expect(r.taxaMensalPct).toBeLessThan(3.1);
    // Sem rendimento assumido, à vista ganha (há juros embutido).
    expect(r.vantagem).toBe('vista');
  });

  test('taxa embutida verificada: recompor a parcela pela taxa devolvida', () => {
    const r = SIM.compararParcelado({ precoVista: 5000, numParcelas: 24, valorParcela: 260 });
    const i = r.taxaMensal;
    // Recompõe o valor presente com a taxa achada → deve bater o preço à vista.
    const vp = 260 * (1 - Math.pow(1 + i, -24)) / i;
    expect(vp).toBeCloseTo(5000, 1);
  });

  test('precoParcelado (em vez de valorParcela) é dividido pelas parcelas', () => {
    const r = SIM.compararParcelado({ precoVista: 900, numParcelas: 10, precoParcelado: 1000 });
    expect(r.valorParcela).toBe(100);
    expect(r.totalParcelado).toBe(1000);
    expect(r.acrescimo).toBe(100);
  });

  test('taxa de investimento fora da faixa é inválida', () => {
    expect(SIM.compararParcelado({ precoVista: 100, numParcelas: 2, valorParcela: 50, taxaInvestimento: 2 }).valido).toBe(false);
  });
});

describe('SIMULADOR.jurosCompostos', () => {
  test('prazo ausente é inválido', () => {
    expect(SIM.jurosCompostos({ principal: 1000, taxaMensal: 0.01 }).valido).toBe(false);
  });

  test('sem principal e sem aporte é inválido', () => {
    expect(SIM.jurosCompostos({ meses: 12, taxaMensal: 0.01 }).valido).toBe(false);
  });

  test('só principal: 1000 a 1% por 12 meses = 1000·1.01^12', () => {
    const r = SIM.jurosCompostos({ principal: 1000, taxaMensal: 0.01, meses: 12 });
    expect(r.valido).toBe(true);
    const esperado = Math.round((1000 * Math.pow(1.01, 12) + Number.EPSILON) * 100) / 100;
    expect(r.montante).toBe(esperado);
    expect(r.totalAportado).toBe(1000);
    expect(r.jurosGanhos).toBe(Math.round((esperado - 1000 + Number.EPSILON) * 100) / 100);
  });

  test('taxa zero: montante = aportado (principal + aportes)', () => {
    const r = SIM.jurosCompostos({ principal: 500, aporteMensal: 100, taxaMensal: 0, meses: 10 });
    expect(r.montante).toBe(1500);
    expect(r.totalAportado).toBe(1500);
    expect(r.jurosGanhos).toBe(0);
  });

  test('aportes: 100/mês a 1% por 12 meses = 100·(1.01^12−1)/0.01', () => {
    const r = SIM.jurosCompostos({ aporteMensal: 100, taxaMensal: 0.01, meses: 12 });
    const fvA = 100 * (Math.pow(1.01, 12) - 1) / 0.01;
    expect(r.montante).toBeCloseTo(Math.round((fvA + Number.EPSILON) * 100) / 100, 2);
    expect(r.totalAportado).toBe(1200);
    expect(r.jurosGanhos).toBeCloseTo(fvA - 1200, 1);
  });

  test('valor negativo é inválido', () => {
    expect(SIM.jurosCompostos({ principal: -1, taxaMensal: 0.01, meses: 5 }).valido).toBe(false);
  });
});

describe('SIMULADOR.aporteParaMeta', () => {
  test('meta ou prazo ausente é inválido', () => {
    expect(SIM.aporteParaMeta({ meses: 12 }).valido).toBe(false);
    expect(SIM.aporteParaMeta({ objetivo: 1000 }).valido).toBe(false);
  });

  test('taxa zero: aporte = (meta − inicial) / meses', () => {
    const r = SIM.aporteParaMeta({ objetivo: 1200, inicial: 0, taxaMensal: 0, meses: 12 });
    expect(r.valido).toBe(true);
    expect(r.aporteMensal).toBe(100);
    expect(r.totalAportado).toBe(1200);
    expect(r.jurosGanhos).toBe(0);
  });

  test('taxa zero com inicial: desconta o que já se tem', () => {
    const r = SIM.aporteParaMeta({ objetivo: 1200, inicial: 200, taxaMensal: 0, meses: 10 });
    expect(r.aporteMensal).toBe(100);
  });

  test('é o inverso de jurosCompostos: o aporte achado atinge a meta', () => {
    const meta = 50000;
    const r = SIM.aporteParaMeta({ objetivo: meta, inicial: 5000, taxaMensal: 0.008, meses: 36 });
    expect(r.valido).toBe(true);
    // Alimenta jurosCompostos com o aporte achado → montante deve bater a meta.
    const check = SIM.jurosCompostos({
      principal: 5000, aporteMensal: r.aporteMensal, taxaMensal: 0.008, meses: 36,
    });
    expect(check.montante).toBeCloseTo(meta, 0);
  });

  test('inicial rendendo já cobre a meta → aporte zero e jaAlcanca', () => {
    const r = SIM.aporteParaMeta({ objetivo: 1000, inicial: 1000, taxaMensal: 0.02, meses: 12 });
    expect(r.aporteMensal).toBe(0);
    expect(r.jaAlcanca).toBe(true);
  });

  test('inicial negativo é inválido', () => {
    expect(SIM.aporteParaMeta({ objetivo: 1000, inicial: -1, taxaMensal: 0, meses: 12 }).valido).toBe(false);
  });
});

describe('SIMULADOR.financiamento', () => {
  test('valor ausente é inválido', () => {
    expect(SIM.financiamento({ numParcelas: 12, taxaMensal: 0.01 }).valido).toBe(false);
  });

  test('entrada >= valor é inválida', () => {
    expect(SIM.financiamento({ valor: 1000, entrada: 1000, numParcelas: 12, taxaMensal: 0.01 }).valido).toBe(false);
  });

  test('Price: 10000 em 12x a 1,5% a.m. — parcela pela fórmula', () => {
    const r = SIM.financiamento({ valor: 10000, numParcelas: 12, taxaMensal: 0.015 });
    expect(r.valido).toBe(true);
    expect(r.valorFinanciado).toBe(10000);
    const parcela = 10000 * 0.015 / (1 - Math.pow(1.015, -12));
    expect(r.valorParcela).toBe(Math.round((parcela + Number.EPSILON) * 100) / 100);
    // total pago = parcela·12; juros = total − PV
    expect(r.totalPago).toBeCloseTo(parcela * 12, 1);
    expect(r.totalJuros).toBeCloseTo(parcela * 12 - 10000, 1);
    expect(r.totalJuros).toBeGreaterThan(0);
  });

  test('entrada reduz o valor financiado e entra no total pago', () => {
    const r = SIM.financiamento({ valor: 10000, entrada: 2000, numParcelas: 12, taxaMensal: 0.015 });
    expect(r.valorFinanciado).toBe(8000);
    const parcela = 8000 * 0.015 / (1 - Math.pow(1.015, -12));
    expect(r.totalPago).toBeCloseTo(parcela * 12 + 2000, 1);
  });

  test('taxa zero: parcela = PV/n e juros zero', () => {
    const r = SIM.financiamento({ valor: 1200, numParcelas: 12, taxaMensal: 0 });
    expect(r.valorParcela).toBe(100);
    expect(r.totalJuros).toBe(0);
    expect(r.totalPago).toBe(1200);
  });
});
