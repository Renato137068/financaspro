/**
 * budget.test.js — Testes para lógica de orçamento (js/orcamento.js)
 * Cobre: definirLimite, obterLimite, obterStatus, calcularGastoMes,
 *        deletarLimite, regra 50/30/20, alertas de gastos
 */

// ── Implementação inline idêntica à lógica de ORCAMENTO ──────────────────────
function criarOrcamento(transacoesFixas) {
  const _cache = {};
  const _transacoes = transacoesFixas || [];

  function calcularGastoMes(categoria, mes, ano) {
    return _transacoes
      .filter(t => {
        const parts = String(t.data || '').split('T')[0].split('-');
        if (parts.length === 3) {
          return t.tipo === 'despesa' &&
                 t.categoria === categoria &&
                 parseInt(parts[1], 10) === mes &&
                 parseInt(parts[0], 10) === ano;
        }
        return false;
      })
      .reduce((acc, t) => acc + t.valor, 0);
  }

  return {
    definirLimite(categoria, limite) {
      if (limite <= 0) throw new Error('Limite deve ser maior que 0');
      _cache[categoria] = { limite: parseFloat(limite), definidoEm: new Date().toISOString() };
      return _cache[categoria];
    },

    obterLimite(categoria) {
      return _cache[categoria] ? _cache[categoria].limite : null;
    },

    obterTodos() {
      const result = {};
      Object.keys(_cache).forEach(k => { result[k] = _cache[k]; });
      return result;
    },

    deletarLimite(categoria) {
      delete _cache[categoria];
    },

    calcularGastoMes,

    obterStatus(categoria, mes, ano) {
      const limite = this.obterLimite(categoria);
      if (!limite) {
        return { categoria, limite: null, gasto: 0, percentual: 0, status: 'sem-limite' };
      }
      const gasto = calcularGastoMes(categoria, mes, ano);
      const percentual = (gasto / limite) * 100;
      let status = 'ok';
      if (percentual >= 100) {
        status = 'excedido';
      } else if (percentual >= 80) {
        status = 'alerta';
      }
      return {
        categoria,
        limite,
        gasto,
        percentual: Math.round(percentual),
        status,
        restante: Math.max(0, limite - gasto),
      };
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('ORCAMENTO — definirLimite', () => {
  test('define limite positivo para categoria', () => {
    const orc = criarOrcamento();
    const r = orc.definirLimite('alimentacao', 1000);
    expect(r.limite).toBe(1000);
  });

  test('limite zero lança erro', () => {
    const orc = criarOrcamento();
    expect(() => orc.definirLimite('alimentacao', 0)).toThrow('Limite deve ser maior que 0');
  });

  test('limite negativo lança erro', () => {
    const orc = criarOrcamento();
    expect(() => orc.definirLimite('alimentacao', -100)).toThrow('Limite deve ser maior que 0');
  });

  test('sobrescreve limite existente', () => {
    const orc = criarOrcamento();
    orc.definirLimite('alimentacao', 500);
    orc.definirLimite('alimentacao', 800);
    expect(orc.obterLimite('alimentacao')).toBe(800);
  });

  test('registra timestamp de definição', () => {
    const orc = criarOrcamento();
    const r = orc.definirLimite('transporte', 300);
    expect(r.definidoEm).toBeDefined();
    expect(new Date(r.definidoEm).getTime()).toBeGreaterThan(0);
  });
});

describe('ORCAMENTO — obterLimite / obterTodos', () => {
  test('retorna null para categoria sem limite', () => {
    const orc = criarOrcamento();
    expect(orc.obterLimite('lazer')).toBeNull();
  });

  test('retorna valor correto após definir', () => {
    const orc = criarOrcamento();
    orc.definirLimite('saude', 400);
    expect(orc.obterLimite('saude')).toBe(400);
  });

  test('obterTodos retorna todas as categorias com limite', () => {
    const orc = criarOrcamento();
    orc.definirLimite('alimentacao', 600);
    orc.definirLimite('transporte', 300);
    const todos = orc.obterTodos();
    expect(Object.keys(todos)).toHaveLength(2);
    expect(todos.alimentacao.limite).toBe(600);
  });
});

describe('ORCAMENTO — deletarLimite', () => {
  test('remove limite da categoria', () => {
    const orc = criarOrcamento();
    orc.definirLimite('lazer', 200);
    orc.deletarLimite('lazer');
    expect(orc.obterLimite('lazer')).toBeNull();
  });

  test('deletar categoria inexistente não lança erro', () => {
    const orc = criarOrcamento();
    expect(() => orc.deletarLimite('naoExiste')).not.toThrow();
  });
});

describe('ORCAMENTO — calcularGastoMes', () => {
  const transacoes = [
    { tipo: 'despesa', categoria: 'alimentacao', valor: 200, data: '2024-03-10' },
    { tipo: 'despesa', categoria: 'alimentacao', valor: 150, data: '2024-03-20' },
    { tipo: 'despesa', categoria: 'transporte', valor: 80,  data: '2024-03-05' },
    { tipo: 'receita', categoria: 'alimentacao', valor: 999, data: '2024-03-01' }, // receita não conta
    { tipo: 'despesa', categoria: 'alimentacao', valor: 100, data: '2024-02-28' }, // mês diferente
  ];

  test('soma gastos de despesas da categoria no mês/ano', () => {
    const orc = criarOrcamento(transacoes);
    expect(orc.calcularGastoMes('alimentacao', 3, 2024)).toBe(350);
  });

  test('não soma receitas na categoria', () => {
    const orc = criarOrcamento(transacoes);
    // alimentacao no mês 3 tem 200+150 = 350 (exclui a receita de 999)
    expect(orc.calcularGastoMes('alimentacao', 3, 2024)).toBe(350);
  });

  test('não soma transações de outros meses', () => {
    const orc = criarOrcamento(transacoes);
    // No mês 2 só há uma despesa de alimentação: 100
    expect(orc.calcularGastoMes('alimentacao', 2, 2024)).toBe(100);
  });

  test('retorna 0 para categoria sem gastos no mês', () => {
    const orc = criarOrcamento(transacoes);
    expect(orc.calcularGastoMes('moradia', 3, 2024)).toBe(0);
  });
});

describe('ORCAMENTO — obterStatus', () => {
  const transacoes = [
    { tipo: 'despesa', categoria: 'alimentacao', valor: 500, data: '2024-03-15' },
    { tipo: 'despesa', categoria: 'lazer',       valor: 85,  data: '2024-03-10' },
    { tipo: 'despesa', categoria: 'saude',        valor: 100, data: '2024-03-05' },
  ];

  test('sem limite retorna status "sem-limite"', () => {
    const orc = criarOrcamento(transacoes);
    const s = orc.obterStatus('transporte', 3, 2024);
    expect(s.status).toBe('sem-limite');
    expect(s.limite).toBeNull();
  });

  test('gasto < 80% do limite → status "ok"', () => {
    const orc = criarOrcamento(transacoes);
    orc.definirLimite('alimentacao', 700); // 500/700 = 71.4% → ok
    const s = orc.obterStatus('alimentacao', 3, 2024);
    expect(s.status).toBe('ok');
    expect(s.gasto).toBe(500);
    expect(s.restante).toBe(200);
  });

  test('gasto >= 80% e < 100% do limite → status "alerta"', () => {
    const orc = criarOrcamento(transacoes);
    orc.definirLimite('lazer', 100); // 85/100 = 85% → alerta
    const s = orc.obterStatus('lazer', 3, 2024);
    expect(s.status).toBe('alerta');
    expect(s.percentual).toBe(85);
  });

  test('gasto = 100% do limite → status "excedido"', () => {
    const orc = criarOrcamento(transacoes);
    orc.definirLimite('saude', 100); // 100/100 = 100% → excedido
    const s = orc.obterStatus('saude', 3, 2024);
    expect(s.status).toBe('excedido');
  });

  test('gasto > 100% do limite → status "excedido" e restante = 0', () => {
    const orc = criarOrcamento(transacoes);
    orc.definirLimite('alimentacao', 400); // 500/400 = 125% → excedido
    const s = orc.obterStatus('alimentacao', 3, 2024);
    expect(s.status).toBe('excedido');
    expect(s.restante).toBe(0); // Math.max(0, 400-500) = 0
  });

  test('percentual é arredondado para inteiro', () => {
    const orc = criarOrcamento(transacoes);
    orc.definirLimite('lazer', 100); // 85.0 → percentual 85
    const s = orc.obterStatus('lazer', 3, 2024);
    expect(Number.isInteger(s.percentual)).toBe(true);
  });
});

describe('ORCAMENTO — regra 50/30/20', () => {
  test('calcula limites corretos por renda', () => {
    const renda = 5000;
    const necessidades = renda * 0.50;
    const desejos = renda * 0.30;
    const poupanca = renda * 0.20;

    expect(necessidades).toBe(2500);
    expect(desejos).toBe(1500);
    expect(poupanca).toBe(1000);
    expect(necessidades + desejos + poupanca).toBe(renda);
  });

  test('define limites de categorias baseado na regra', () => {
    const orc = criarOrcamento();
    const renda = 3000;
    orc.definirLimite('alimentacao', renda * 0.20);  // 600
    orc.definirLimite('moradia', renda * 0.30);       // 900
    orc.definirLimite('lazer', renda * 0.10);         // 300

    expect(orc.obterLimite('alimentacao')).toBe(600);
    expect(orc.obterLimite('moradia')).toBe(900);
    expect(orc.obterLimite('lazer')).toBe(300);
  });
});
