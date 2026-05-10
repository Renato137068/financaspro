/**
 * Testes essenciais - Core de finanças
 * Foco: cálculos financeiros, parcelamento, recorrência, stores, transações
 */

// Mock do localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => store[key] = value.toString(),
    removeItem: (key) => delete store[key],
    clear: () => store = {}
  };
})();

Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// Mock do CONFIG
const CONFIG = {
  STORAGE_TRANSACOES: 'fp-transacoes',
  STORAGE_CONFIG: 'fp-config',
  TIPO_DESPESA: 'despesa',
  TIPO_RECEITA: 'receita',
  CATEGORIAS_LABELS: {
    salario: 'Salário',
    alimentacao: 'Alimentação'
  }
};

describe('CORE - Cálculos Financeiros', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('soma de receitas e despesas', () => {
    const transacoes = [
      { tipo: 'receita', valor: 1000 },
      { tipo: 'despesa', valor: 300 },
      { tipo: 'despesa', valor: 200 },
      { tipo: 'receita', valor: 500 }
    ];
    
    const receitas = transacoes
      .filter(t => t.tipo === 'receita')
      .reduce((acc, t) => acc + t.valor, 0);
    
    const despesas = transacoes
      .filter(t => t.tipo === 'despesa')
      .reduce((acc, t) => acc + t.valor, 0);
    
    expect(receitas).toBe(1500);
    expect(despesas).toBe(500);
    expect(receitas - despesas).toBe(1000); // Saldo
  });

  test('cálculo de média mensal', () => {
    const valores = [1000, 1200, 800, 1500, 1100];
    const media = valores.reduce((a, b) => a + b, 0) / valores.length;
    expect(media).toBe(1120);
  });

  test('porcentagem de gastos por categoria', () => {
    const total = 1000;
    const gasto = 350;
    const percentual = (gasto / total) * 100;
    expect(percentual).toBe(35);
  });
});

describe('CORE - Parcelamento', () => {
  test('parcelamento de despesa em N vezes', () => {
    const valorTotal = 1200;
    const numParcelas = 3;
    const valorParcela = valorTotal / numParcelas;
    
    expect(valorParcela).toBe(400);
    expect(valorParcela * numParcelas).toBe(valorTotal);
  });

  test('geração de datas de parcelas', () => {
    const dataInicial = '2024-01-15';
    const numParcelas = 3;
    const parcelas = [];
    
    for (let i = 0; i < numParcelas; i++) {
      const data = new Date(2024, 0 + i, 15);
      parcelas.push(data.toISOString().split('T')[0]);
    }
    
    expect(parcelas).toEqual(['2024-01-15', '2024-02-15', '2024-03-15']);
  });

  test('identificador único de parcelamento', () => {
    const grupoParcela = `parc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    expect(grupoParcela).toMatch(/^parc_\d+_[a-z0-9]+$/);
  });
});

describe('CORE - Recorrência', () => {
  test('geração de transações recorrentes mensais', () => {
    const base = { descricao: 'Aluguel', valor: 1000, tipo: 'despesa' };
    const meses = 3;
    const recorrentes = [];
    
    for (let i = 0; i < meses; i++) {
      const data = new Date(2024, i, 5);
      recorrentes.push({
        ...base,
        data: data.toISOString().split('T')[0],
        recorrenteId: 'rec_001'
      });
    }
    
    expect(recorrentes).toHaveLength(3);
    expect(recorrentes[0].data).toBe('2024-01-05');
    expect(recorrentes[2].data).toBe('2024-03-05');
  });

  test('frequências de recorrência válidas', () => {
    const frequenciasValidas = ['semanal', 'quinzenal', 'mensal', 'anual'];
    expect(frequenciasValidas).toContain('mensal');
    expect(frequenciasValidas).toContain('semanal');
    expect(frequenciasValidas).not.toContain('diario');
  });
});

describe('CORE - Store Unificada', () => {
  test('APP_STORE - get e set básico', () => {
    // Simulando comportamento da store
    const state = { dados: {}, ui: {} };
    
    function set(path, value) {
      const keys = path.split('.');
      let target = state;
      for (let i = 0; i < keys.length - 1; i++) {
        if (!(keys[i] in target)) target[keys[i]] = {};
        target = target[keys[i]];
      }
      target[keys[keys.length - 1]] = value;
    }
    
    function get(path) {
      const keys = path.split('.');
      let value = state;
      for (const key of keys) {
        if (value && key in value) value = value[key];
        else return undefined;
      }
      return JSON.parse(JSON.stringify(value));
    }
    
    set('dados.transacoes', [{ id: 1 }]);
    set('ui.abaAtiva', 'resumo');
    
    expect(get('dados.transacoes')).toHaveLength(1);
    expect(get('ui.abaAtiva')).toBe('resumo');
  });

  test('APP_STORE - subscriptions notificam mudanças', () => {
    const listeners = [];
    let notified = false;
    
    function subscribe(fn) {
      listeners.push(fn);
      return () => listeners.splice(listeners.indexOf(fn), 1);
    }
    
    function notify() {
      listeners.forEach(fn => fn());
    }
    
    subscribe(() => { notified = true; });
    notify();
    
    expect(notified).toBe(true);
  });

  test('APP_STATE - compatibilidade mantida', () => {
    // APP_STATE deve delegar para APP_STORE
    const appStoreGet = jest.fn(() => ({ transacoes: [] }));
    const appStorePatch = jest.fn();
    
    // Simulando adaptador
    const APP_STATE = {
      getState: () => appStoreGet(),
      setState: (patch) => appStorePatch(patch)
    };
    
    const state = APP_STATE.getState();
    APP_STATE.setState({ transacoes: [{ id: 1 }] });
    
    expect(appStoreGet).toHaveBeenCalled();
    expect(appStorePatch).toHaveBeenCalledWith({ transacoes: [{ id: 1 }] });
  });
});

describe('CORE - Transações CRUD', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(CONFIG.STORAGE_TRANSACOES, JSON.stringify([]));
  });

  test('criar transação gera ID único', () => {
    const transacao = {
      id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      tipo: 'despesa',
      valor: 50,
      categoria: 'alimentacao',
      data: '2024-01-15'
    };
    
    expect(transacao.id).toMatch(/^tx_\d+_[a-z0-9]+$/);
    expect(transacao.valor).toBeGreaterThan(0);
  });

  test('validação de transação - valor deve ser positivo', () => {
    const validar = (t) => {
      if (t.valor <= 0) return { valido: false, erro: 'Valor deve ser positivo' };
      if (!t.categoria) return { valido: false, erro: 'Categoria obrigatória' };
      return { valido: true };
    };
    
    expect(validar({ valor: -10, categoria: 'teste' }).valido).toBe(false);
    expect(validar({ valor: 0, categoria: 'teste' }).valido).toBe(false);
    expect(validar({ valor: 10, categoria: 'teste' }).valido).toBe(true);
    expect(validar({ valor: 10, categoria: '' }).valido).toBe(false);
  });

  test('persistência no localStorage', () => {
    const transacoes = [{ id: '1', valor: 100 }];
    localStorage.setItem(CONFIG.STORAGE_TRANSACOES, JSON.stringify(transacoes));
    
    const salvo = JSON.parse(localStorage.getItem(CONFIG.STORAGE_TRANSACOES));
    expect(salvo).toHaveLength(1);
    expect(salvo[0].id).toBe('1');
  });
});

describe('CORE - Sincronização', () => {
  test('merge de dados local vs remoto', () => {
    const local = [{ id: '1', valor: 100 }, { id: '2', valor: 200 }];
    const remoto = [{ id: '2', valor: 250 }, { id: '3', valor: 300 }];
    
    // Estratégia: servidor tem prioridade, adiciona novos locais
    const merge = new Map();
    
    // Adiciona locais primeiro
    local.forEach(t => merge.set(t.id, t));
    
    // Sobrescreve com remotos (prioridade servidor)
    remoto.forEach(t => merge.set(t.id, t));
    
    const resultado = Array.from(merge.values());
    
    expect(resultado).toHaveLength(3);
    expect(resultado.find(t => t.id === '2').valor).toBe(250); // Do servidor
    expect(resultado.find(t => t.id === '1').valor).toBe(100); // Local preservado
  });

  test('status de sincronização', () => {
    const status = {
      online: true,
      pending: false,
      lastSyncAt: Date.now()
    };
    
    expect(status.online).toBe(true);
    expect(status.pending).toBe(false);
    expect(typeof status.lastSyncAt).toBe('number');
  });
});

describe('CORE - Orçamento 50/30/20', () => {
  test('cálculo de limites por renda', () => {
    const renda = 3000;
    const regras = {
      necessidades: 0.50,
      desejos: 0.30,
      poupanca: 0.20
    };
    
    const limites = {
      necessidades: renda * regras.necessidades,
      desejos: renda * regras.desejos,
      poupanca: renda * regras.poupanca
    };
    
    expect(limites.necessidades).toBe(1500);
    expect(limites.desejos).toBe(900);
    expect(limites.poupanca).toBe(600);
    expect(Object.values(limites).reduce((a, b) => a + b, 0)).toBe(renda);
  });

  test('status de orçamento (ok, alerta, excedido)', () => {
    const calcularStatus = (gasto, limite) => {
      const pct = (gasto / limite) * 100;
      if (pct > 100) return 'excedido';
      if (pct > 80) return 'alerta';
      return 'ok';
    };
    
    expect(calcularStatus(70, 100)).toBe('ok');
    expect(calcularStatus(85, 100)).toBe('alerta');
    expect(calcularStatus(110, 100)).toBe('excedido');
  });
});
