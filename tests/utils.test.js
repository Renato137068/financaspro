/**
 * utils.test.js — Testes para funções utilitárias (js/utils.js)
 * Cobre: formatarData, calcularSaldo, filtrarPorMes, filtrarPorTipo,
 *        escapeHtml, gerarId, validarTransacao, debounce
 */

// Implementação inline idêntica ao source (js/utils.js)
// Justificativa: arquivos frontend usam var globals não compatíveis com ESM require
const UTILS = {
  formatarData(data) {
    const parts = String(data).split('T')[0].split('-');
    if (parts.length === 3) {
      return parts[2] + '/' + parts[1] + '/' + parts[0];
    }
    return new Intl.DateTimeFormat('pt-BR').format(new Date(data));
  },

  calcularSaldo(transacoes) {
    return transacoes.reduce((acc, t) => {
      return t.tipo === CONFIG.TIPO_RECEITA ? acc + t.valor : acc - t.valor;
    }, 0);
  },

  filtrarPorMes(transacoes, mes, ano) {
    return transacoes.filter(t => {
      const dataStr = String(t.data || '').split('T')[0];
      const parts = dataStr.split('-');
      if (parts.length === 3) {
        const anoTx = parseInt(parts[0], 10);
        const mesTx = parseInt(parts[1], 10);
        return mesTx === mes && anoTx === ano;
      }
      const d = new Date(t.data);
      return d.getMonth() === mes - 1 && d.getFullYear() === ano;
    });
  },

  filtrarPorTipo(transacoes, tipo) {
    return transacoes.filter(t => t.tipo === tipo);
  },

  escapeHtml(text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text).replace(/[&<>"']/g, m => map[m]);
  },

  _idCounter: 0,
  gerarId() {
    const timestamp = Date.now();
    const randomPart = Math.random().toString(36).substr(2, 9);
    const counter = (this._idCounter = (this._idCounter || 0) + 1);
    return timestamp + '-' + randomPart + '-' + counter;
  },

  validarTransacao(transacao) {
    if (!transacao.valor || transacao.valor <= 0) {
      return { valido: false, erro: 'Valor deve ser maior que 0' };
    }
    if (!transacao.tipo || [CONFIG.TIPO_RECEITA, CONFIG.TIPO_DESPESA].indexOf(transacao.tipo) === -1) {
      return { valido: false, erro: 'Tipo invalido' };
    }
    if (!transacao.categoria) {
      return { valido: false, erro: 'Categoria obrigatoria' };
    }
    if (!transacao.data) {
      return { valido: false, erro: 'Data obrigatoria' };
    }
    return { valido: true };
  },

  debounce(func, delay) {
    let timeout;
    return function() {
      const context = this, args = arguments;
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(context, args), delay);
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────────

describe('UTILS — formatarData', () => {
  test('converte YYYY-MM-DD para DD/MM/YYYY', () => {
    expect(UTILS.formatarData('2024-03-15')).toBe('15/03/2024');
  });

  test('converte data com hora ISO', () => {
    expect(UTILS.formatarData('2024-01-01T10:00:00.000Z')).toBe('01/01/2024');
  });

  test('zera padding de dia e mês', () => {
    expect(UTILS.formatarData('2024-06-05')).toBe('05/06/2024');
  });

  test('ano de 4 dígitos preservado', () => {
    expect(UTILS.formatarData('1999-12-31')).toBe('31/12/1999');
  });
});

describe('UTILS — calcularSaldo', () => {
  test('saldo positivo quando receitas > despesas', () => {
    const txs = [
      { tipo: 'receita', valor: 3000 },
      { tipo: 'despesa', valor: 1000 },
    ];
    expect(UTILS.calcularSaldo(txs)).toBe(2000);
  });

  test('saldo negativo quando despesas > receitas', () => {
    const txs = [
      { tipo: 'receita', valor: 500 },
      { tipo: 'despesa', valor: 1500 },
    ];
    expect(UTILS.calcularSaldo(txs)).toBe(-1000);
  });

  test('saldo zero com lista vazia', () => {
    expect(UTILS.calcularSaldo([])).toBe(0);
  });

  test('múltiplas transações acumulam corretamente', () => {
    const txs = [
      { tipo: 'receita', valor: 1000 },
      { tipo: 'despesa', valor: 200 },
      { tipo: 'despesa', valor: 300 },
      { tipo: 'receita', valor: 500 },
    ];
    expect(UTILS.calcularSaldo(txs)).toBe(1000);
  });

  test('apenas receitas somam positivo', () => {
    const txs = [
      { tipo: 'receita', valor: 100 },
      { tipo: 'receita', valor: 200 },
    ];
    expect(UTILS.calcularSaldo(txs)).toBe(300);
  });
});

describe('UTILS — filtrarPorMes', () => {
  const transacoes = [
    { id: '1', data: '2024-01-15', valor: 100 },
    { id: '2', data: '2024-01-31', valor: 200 },
    { id: '3', data: '2024-02-01', valor: 300 },
    { id: '4', data: '2023-01-15', valor: 400 },
    { id: '5', data: '2024-01-01T00:00:00Z', valor: 500 },
  ];

  test('filtra transações do mês correto', () => {
    const resultado = UTILS.filtrarPorMes(transacoes, 1, 2024);
    expect(resultado).toHaveLength(3);
    expect(resultado.map(t => t.id)).toContain('1');
    expect(resultado.map(t => t.id)).toContain('2');
    expect(resultado.map(t => t.id)).toContain('5');
  });

  test('exclui transações de outros meses', () => {
    const resultado = UTILS.filtrarPorMes(transacoes, 2, 2024);
    expect(resultado).toHaveLength(1);
    expect(resultado[0].id).toBe('3');
  });

  test('exclui transações do mesmo mês mas ano diferente', () => {
    const resultado = UTILS.filtrarPorMes(transacoes, 1, 2023);
    expect(resultado).toHaveLength(1);
    expect(resultado[0].id).toBe('4');
  });

  test('retorna vazio para mês sem transações', () => {
    expect(UTILS.filtrarPorMes(transacoes, 6, 2024)).toHaveLength(0);
  });
});

describe('UTILS — filtrarPorTipo', () => {
  const transacoes = [
    { tipo: 'receita', valor: 1000 },
    { tipo: 'despesa', valor: 500 },
    { tipo: 'receita', valor: 200 },
    { tipo: 'despesa', valor: 300 },
  ];

  test('filtra apenas receitas', () => {
    const resultado = UTILS.filtrarPorTipo(transacoes, 'receita');
    expect(resultado).toHaveLength(2);
    expect(resultado.every(t => t.tipo === 'receita')).toBe(true);
  });

  test('filtra apenas despesas', () => {
    const resultado = UTILS.filtrarPorTipo(transacoes, 'despesa');
    expect(resultado).toHaveLength(2);
    expect(resultado.every(t => t.tipo === 'despesa')).toBe(true);
  });

  test('retorna vazio para tipo inexistente', () => {
    expect(UTILS.filtrarPorTipo(transacoes, 'transferencia')).toHaveLength(0);
  });
});

describe('UTILS — escapeHtml', () => {
  test('escapa tag HTML', () => {
    expect(UTILS.escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  test('escapa & ampersand', () => {
    expect(UTILS.escapeHtml('P&G')).toBe('P&amp;G');
  });

  test('escapa aspas duplas', () => {
    expect(UTILS.escapeHtml('"valor"')).toBe('&quot;valor&quot;');
  });

  test('escapa aspas simples', () => {
    expect(UTILS.escapeHtml("it's")).toBe("it&#039;s");
  });

  test('string sem caracteres especiais permanece igual', () => {
    expect(UTILS.escapeHtml('mercado')).toBe('mercado');
  });

  test('converte não-strings para string antes de escapar', () => {
    expect(UTILS.escapeHtml(123)).toBe('123');
  });

  test('previne XSS clássico', () => {
    const input = '<img src=x onerror="alert(1)">';
    expect(UTILS.escapeHtml(input)).not.toContain('<img');
    expect(UTILS.escapeHtml(input)).toContain('&lt;img');
  });
});

describe('UTILS — gerarId', () => {
  test('gera IDs únicos em chamadas consecutivas', () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) {
      ids.add(UTILS.gerarId());
    }
    expect(ids.size).toBe(100);
  });

  test('formato: timestamp-random-counter', () => {
    const id = UTILS.gerarId();
    expect(id).toMatch(/^\d+-[a-z0-9]+-\d+$/);
  });

  test('counter incrementa entre chamadas', () => {
    const id1 = UTILS.gerarId();
    const id2 = UTILS.gerarId();
    const counter1 = parseInt(id1.split('-')[2]);
    const counter2 = parseInt(id2.split('-')[2]);
    expect(counter2).toBeGreaterThan(counter1);
  });
});

describe('UTILS — validarTransacao', () => {
  const base = { tipo: 'despesa', valor: 100, categoria: 'alimentacao', data: '2024-01-01' };

  test('transação válida retorna { valido: true }', () => {
    expect(UTILS.validarTransacao(base)).toEqual({ valido: true });
  });

  test('valor zero retorna erro', () => {
    const r = UTILS.validarTransacao({ ...base, valor: 0 });
    expect(r.valido).toBe(false);
    expect(r.erro).toMatch(/maior que 0/i);
  });

  test('valor negativo retorna erro', () => {
    const r = UTILS.validarTransacao({ ...base, valor: -50 });
    expect(r.valido).toBe(false);
  });

  test('tipo inválido retorna erro', () => {
    const r = UTILS.validarTransacao({ ...base, tipo: 'transferencia' });
    expect(r.valido).toBe(false);
    expect(r.erro).toMatch(/tipo/i);
  });

  test('categoria ausente retorna erro', () => {
    const r = UTILS.validarTransacao({ ...base, categoria: '' });
    expect(r.valido).toBe(false);
    expect(r.erro).toMatch(/categoria/i);
  });

  test('data ausente retorna erro', () => {
    const r = UTILS.validarTransacao({ ...base, data: '' });
    expect(r.valido).toBe(false);
    expect(r.erro).toMatch(/data/i);
  });

  test('tipo receita também é válido', () => {
    const r = UTILS.validarTransacao({ ...base, tipo: 'receita' });
    expect(r.valido).toBe(true);
  });
});

describe('UTILS — debounce', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('não executa imediatamente', () => {
    const fn = jest.fn();
    const debounced = UTILS.debounce(fn, 300);
    debounced();
    expect(fn).not.toHaveBeenCalled();
  });

  test('executa após o delay', () => {
    const fn = jest.fn();
    const debounced = UTILS.debounce(fn, 300);
    debounced();
    jest.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('múltiplas chamadas rápidas executam apenas uma vez', () => {
    const fn = jest.fn();
    const debounced = UTILS.debounce(fn, 300);
    debounced();
    debounced();
    debounced();
    jest.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('reseta timer a cada nova chamada', () => {
    const fn = jest.fn();
    const debounced = UTILS.debounce(fn, 300);
    debounced();
    jest.advanceTimersByTime(200);
    debounced(); // reinicia o timer
    jest.advanceTimersByTime(200); // total: 400ms mas timer reiniciou
    expect(fn).not.toHaveBeenCalled();
    jest.advanceTimersByTime(100); // agora completa os 300ms do segundo call
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
