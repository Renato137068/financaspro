/**
 * precisao-monetaria.test.js — dinheiro em ponto flutuante nas fronteiras.
 *
 * Origem: a auditoria de dimensões ocultas reproduziu, no módulo ORCAMENTO
 * real, mil lançamentos de R$ 0,10 contra um limite de R$ 100. A tela mostrava
 * "R$ 100,00 de R$ 100,00 — 100%" e o selo dizia "atenção" em vez de
 * "excedido": a soma dava 99,9999999999986 e `>= 100` era false por 1,4e-12.
 *
 * O bug não é "arredondamento feio". É a interface se contradizendo — o mesmo
 * card afirmando 100% consumido e não excedido ao mesmo tempo. Quem confere o
 * orçamento no fim do mês vê os dois e não sabe em qual acreditar.
 *
 * Estes testes travam as duas garantias:
 *   1. somar N parcelas em centavos devolve o valor exato;
 *   2. o percentual exibido e o status NUNCA se contradizem — a tela só
 *      mostra 100% quando o limite foi de fato atingido.
 */
const path = require('path');
const { loadCoreModules, resetFixtures } = require('./load-sources');

loadCoreModules();

const BUDGET_SERVICE = require(path.join(__dirname, '..', 'js', 'services', 'budgetService.js'));

const U = () => global.UTILS;
const O = () => global.ORCAMENTO;

beforeEach(function() {
  resetFixtures();
  O().init();
});

/** Lança N despesas do mesmo valor na categoria, no mês corrente. */
function lancar(n, valor, categoria) {
  const hoje = new Date();
  const mes = hoje.getMonth() + 1;
  const ano = hoje.getFullYear();
  const dia = String(Math.min(hoje.getDate(), 28)).padStart(2, '0');
  const data = `${ano}-${String(mes).padStart(2, '0')}-${dia}`;

  for (let i = 0; i < n; i++) {
    global.DADOS.salvarTransacao({
      id: `tx-${i}`,
      tipo: global.CONFIG.TIPO_DESPESA,
      valor: valor,
      categoria: categoria,
      data: data,
      descricao: 'parcela',
    });
  }
  return { mes: mes, ano: ano };
}

// ─── soma exata ──────────────────────────────────────────────────────────────
describe('UTILS.paraCentavos / somarMoeda', function() {
  test('converte reais em centavos inteiros', function() {
    expect(U().paraCentavos(0.1)).toBe(10);
    expect(U().paraCentavos(100)).toBe(10000);
    expect(U().paraCentavos(39.9)).toBe(3990);
  });

  test('aceita string no formato brasileiro', function() {
    expect(U().paraCentavos('39,90')).toBe(3990);
  });

  test('valor inválido vira 0 em vez de NaN', function() {
    // NaN em centavos contamina toda a soma seguinte silenciosamente.
    expect(U().paraCentavos('abc')).toBe(0);
    expect(U().paraCentavos(undefined)).toBe(0);
    expect(U().paraCentavos(Infinity)).toBe(0);
  });

  test('mil parcelas de R$ 0,10 somam exatamente 100', function() {
    // Em float puro isto dá 99.9999999999986.
    const parcelas = new Array(1000).fill(0.1);
    expect(U().somarMoeda(parcelas)).toBe(100);
    expect(parcelas.reduce((a, b) => a + b, 0)).not.toBe(100);
  });

  test('somas com centavos quebrados fecham exatas', function() {
    expect(U().somarMoeda([0.07, 0.07, 0.07])).toBe(0.21);
    expect(U().somarMoeda([19.99, 19.99, 19.99])).toBe(59.97);
    expect(U().somarMoeda([1234.56, 8765.44])).toBe(10000);
  });
});

// ─── o caso da auditoria, no módulo real ─────────────────────────────────────
describe('ORCAMENTO — o caso que motivou a correção', function() {
  test('1000 × R$ 0,10 contra limite de R$ 100 é dado como excedido', function() {
    O().definirLimite('Alimentação', 100);
    const { mes, ano } = lancar(1000, 0.1, 'Alimentação');

    const s = O().obterStatus('Alimentação', mes, ano);

    expect(s.gasto).toBe(100);
    expect(s.percentual).toBe(100);
    expect(s.status).toBe('excedido');
    expect(s.restante).toBe(0);
  });
});

// ─── coerência entre o que se vê e o que se decide ───────────────────────────
describe('coerência entre percentual exibido e status', function() {
  /**
   * Varredura de fronteira: para cada gasto de 0 a 105% do limite, em passos de
   * um centavo perto das bordas, exibir "100%" e não estar excedido é proibido.
   */
  test('exibir 100% implica status excedido — sem exceção', function() {
    const limite = 100;
    const contradicoes = [];

    for (let centavos = 9800; centavos <= 10200; centavos++) {
      const s = BUDGET_SERVICE.avaliar(centavos / 100, limite);
      const mostra100 = s.percentual >= 100;
      const excedido = s.status === 'excedido';
      if (mostra100 !== excedido) {
        contradicoes.push(`R$ ${(centavos / 100).toFixed(2)}: ${s.percentual}% / ${s.status}`);
      }
    }

    expect(contradicoes).toEqual([]);
  });

  test('R$ 99,60 de R$ 100 mostra 99%, não 100%', function() {
    // O arredondamento antigo exibia 100% aqui — e o selo dizia "atenção".
    const s = BUDGET_SERVICE.avaliar(99.6, 100);
    expect(s.percentual).toBe(99);
    expect(s.status).toBe('alerta');
  });

  test('exatamente no limite conta como excedido', function() {
    const s = BUDGET_SERVICE.avaliar(100, 100);
    expect(s.status).toBe('excedido');
    expect(s.percentual).toBe(100);
    expect(s.restante).toBe(0);
  });

  test('um centavo abaixo do limite ainda não excedeu', function() {
    const s = BUDGET_SERVICE.avaliar(99.99, 100);
    expect(s.status).toBe('alerta');
    expect(s.percentual).toBe(99);
    expect(s.restante).toBe(0.01);
  });

  test('a fronteira do alerta é 80% exatos', function() {
    expect(BUDGET_SERVICE.avaliar(79.99, 100).status).toBe('ok');
    expect(BUDGET_SERVICE.avaliar(80, 100).status).toBe('alerta');
  });

  test('acima do limite o percentual real aparece', function() {
    // Passar de 100% precisa ser visível — limitar a 100 esconderia o tamanho
    // do estouro justo de quem mais precisa vê-lo.
    expect(BUDGET_SERVICE.avaliar(150, 100).percentual).toBe(150);
  });

  test('restante nunca é negativo nem uma fração de centavo', function() {
    const s = BUDGET_SERVICE.avaliar(100.005, 100);
    expect(s.restante).toBe(0);
    expect(Number.isInteger(Math.round(s.restante * 100))).toBe(true);
  });

  test('limite zero ou inválido não gera divisão por zero', function() {
    expect(BUDGET_SERVICE.avaliar(50, 0)).toMatchObject({ percentual: 0, status: 'ok' });
    expect(BUDGET_SERVICE.avaliar(50, NaN)).toMatchObject({ percentual: 0, status: 'ok' });
  });
});

// ─── o service e o fallback precisam concordar ───────────────────────────────
describe('BUDGET_SERVICE e o fallback do ORCAMENTO dão a mesma resposta', function() {
  // ORCAMENTO tem um caminho próprio para quando o service não está carregado.
  // Se os dois divergirem, o selo muda conforme a ordem de carga dos scripts.
  const CASOS = [
    [99.9999999999986, 100],
    [99.99, 100],
    [100, 100],
    [80, 100],
    [79.99, 100],
    [150, 100],
    [0, 100],
  ];

  test.each(CASOS)('gasto %s / limite %s produz o mesmo status nos dois', function(gasto, limite) {
    const viaService = BUDGET_SERVICE.avaliar(gasto, limite);

    O().definirLimite('Teste', limite);
    global.DADOS.salvarTransacao({
      id: 'unico',
      tipo: global.CONFIG.TIPO_DESPESA,
      valor: gasto,
      categoria: 'Teste',
      data: new Date().toISOString().slice(0, 10),
      descricao: 'x',
    });
    const hoje = new Date();
    const viaFallback = O().obterStatus('Teste', hoje.getMonth() + 1, hoje.getFullYear());

    expect(viaFallback.status).toBe(viaService.status);
    expect(viaFallback.percentual).toBe(viaService.percentual);
  });
});

// ─── caminho de produção do service (getStatus/calculateSpent/getAllStatus) ───
describe('BUDGET_SERVICE.getStatus / calculateSpent / getAllStatus', function() {
  var txs = [
    { tipo: 'despesa', categoria: 'Alimentação', valor: 0.10 },
    { tipo: 'despesa', categoria: 'Alimentação', valor: 0.20 },
    { tipo: 'receita', categoria: 'Alimentação', valor: 999 }, // receita não conta
    { tipo: 'despesa', categoria: 'Transporte', valor: 50 },
  ];

  test('calculateSpent soma só despesas da categoria, em centavos', function() {
    // 0,10 + 0,20 = 0,30 exato (em float daria 0.30000000000000004).
    expect(BUDGET_SERVICE.calculateSpent(txs, 'Alimentação', null, null)).toBe(0.30);
    expect(BUDGET_SERVICE.calculateSpent(txs, 'Transporte', null, null)).toBe(50);
    expect(BUDGET_SERVICE.calculateSpent(txs, 'Inexistente', null, null)).toBe(0);
  });

  test('getStatus devolve status coerente para categoria com limite', function() {
    var s = BUDGET_SERVICE.getStatus({ Transporte: { limite: 100 } }, txs, 'Transporte', null, null);
    expect(s.limite).toBe(100);
    expect(s.gasto).toBe(50);
    expect(s.percentual).toBe(50);
    expect(s.status).toBe('ok');
  });

  test('getStatus de categoria sem entry é sem-limite', function() {
    var s = BUDGET_SERVICE.getStatus({}, txs, 'Transporte', null, null);
    expect(s.status).toBe('sem-limite');
    expect(s.limite).toBeNull();
  });

  test('limite inválido ou zerado degrada para sem-limite, não estoura', function() {
    // Regressão: normalizeLimit() estourava aqui na leitura, derrubando
    // getAllStatus e a seção de orçamento do dashboard por uma entrada ruim.
    ['0', 0, null, '', 'abc', -5].forEach(function(lim) {
      expect(function() {
        var s = BUDGET_SERVICE.getStatus({ Transporte: { limite: lim } }, txs, 'Transporte', null, null);
        expect(s.status).toBe('sem-limite');
        expect(s.limite).toBeNull();
      }).not.toThrow();
    });
  });

  test('getAllStatus não estoura quando uma entrada tem limite inválido', function() {
    var budgets = { Transporte: { limite: 100 }, Quebrada: { limite: 0 } };
    var todos;
    expect(function() { todos = BUDGET_SERVICE.getAllStatus(budgets, txs, null, null); }).not.toThrow();
    expect(todos).toHaveLength(2);
    var quebrada = todos.filter(function(s) { return s.categoria === 'Quebrada'; })[0];
    expect(quebrada.status).toBe('sem-limite');
  });

  test('limite em string BR é aceito na leitura', function() {
    var s = BUDGET_SERVICE.getStatus({ Transporte: { limite: '100,00' } }, txs, 'Transporte', null, null);
    expect(s.limite).toBe(100);
    expect(s.gasto).toBe(50);
  });
});
