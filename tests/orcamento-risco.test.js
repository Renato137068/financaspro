/**
 * orcamento-risco.test.js — avisar ANTES de estourar, não depois.
 *
 * O orçamento dizia quanto foi gasto e se já passou do limite. Um selo
 * "excedido" no dia 28 é um obituário: não sobra mês para reagir.
 *
 * O que muda uma decisão é o ritmo. "Você usou 87% do orçamento de alimentação
 * e ainda faltam 12 dias" é acionável no dia 18 — dá tempo de segurar.
 *
 * A projeção é linear de propósito: gasto por dia decorrido, multiplicado pelos
 * dias do mês. Modelos mais elaborados (sazonalidade, dia da semana) exigiriam
 * histórico que a maioria dos usuários não tem, e errariam com ar de precisão.
 */
const { loadCoreModules, resetFixtures } = require('./load-sources');

beforeAll(() => { loadCoreModules(); });
beforeEach(() => {
  resetFixtures();
  // resetFixtures zera ORCAMENTO._cache; init() o recarrega da config.
  ORCAMENTO.init();
});

// 18/08/2026 — agosto tem 31 dias: 18 decorridos, 13 restantes.
const HOJE = new Date(2026, 7, 18);

function gastar(valor, categoria, dia) {
  DADOS.salvarTransacao({
    id: UTILS.gerarId(),
    tipo: 'despesa',
    valor,
    categoria,
    data: '2026-08-' + String(dia).padStart(2, '0'),
    descricao: 'x',
    banco: '',
    cartao: '',
  });
}

describe('ORCAMENTO.projetarCategoria', () => {
  test('projeta o fechamento pelo ritmo do mês', () => {
    ORCAMENTO.definirLimite('alimentacao', 1000);
    gastar(540, 'alimentacao', 10); // R$ 30/dia em 18 dias

    const p = ORCAMENTO.projetarCategoria('alimentacao', HOJE);
    expect(p.gastoDiario).toBeCloseTo(30, 2);
    expect(p.projecao).toBeCloseTo(930, 2); // 30 × 31
  });

  test('quem vai estourar é sinalizado antes de estourar', () => {
    ORCAMENTO.definirLimite('alimentacao', 1000);
    gastar(870, 'alimentacao', 10); // 87% no dia 18

    const p = ORCAMENTO.projetarCategoria('alimentacao', HOJE);
    expect(p.percentual).toBe(87);
    expect(p.diasRestantes).toBe(13);
    expect(p.projecao).toBeGreaterThan(1000);
    expect(p.risco).toBe('vai-estourar');
  });

  test('quem está dentro do ritmo não recebe alarme', () => {
    ORCAMENTO.definirLimite('alimentacao', 1000);
    gastar(400, 'alimentacao', 10); // ritmo fecha em ~689

    expect(ORCAMENTO.projetarCategoria('alimentacao', HOJE).risco).toBe('ok');
  });

  test('quem já estourou é "estourado", não "vai-estourar"', () => {
    ORCAMENTO.definirLimite('alimentacao', 1000);
    gastar(1200, 'alimentacao', 10);

    expect(ORCAMENTO.projetarCategoria('alimentacao', HOJE).risco).toBe('estourado');
  });

  test('categoria sem limite não gera risco', () => {
    gastar(500, 'lazer', 10);
    expect(ORCAMENTO.projetarCategoria('lazer', HOJE).risco).toBe('sem-limite');
  });

  test('nos primeiros dias não projeta — ruído demais', () => {
    // Um almoço caro no dia 2 projetaria um estouro que não existe.
    ORCAMENTO.definirLimite('alimentacao', 1000);
    gastar(200, 'alimentacao', 1);

    const p = ORCAMENTO.projetarCategoria('alimentacao', new Date(2026, 7, 2));
    expect(p.risco).toBe('cedo-demais');
    expect(p.projecao).toBeNull();
  });

  test('no último dia do mês a projeção é o realizado', () => {
    ORCAMENTO.definirLimite('alimentacao', 1000);
    gastar(700, 'alimentacao', 10);

    const p = ORCAMENTO.projetarCategoria('alimentacao', new Date(2026, 7, 31));
    expect(p.diasRestantes).toBe(0);
    expect(p.projecao).toBeCloseTo(700, 2);
    expect(p.risco).toBe('ok');
  });

  test('sem gasto nenhum, a projeção é zero e não NaN', () => {
    ORCAMENTO.definirLimite('alimentacao', 1000);
    const p = ORCAMENTO.projetarCategoria('alimentacao', HOJE);
    expect(p.projecao).toBe(0);
    expect(Number.isNaN(p.projecao)).toBe(false);
  });

  test('transferência não consome orçamento', () => {
    ORCAMENTO.definirLimite('alimentacao', 1000);
    DADOS.salvarTransacao({
      id: UTILS.gerarId(),
      tipo: 'transferencia',
      valor: 900,
      categoria: 'alimentacao',
      data: '2026-08-10',
      descricao: 'x',
      banco: 'A',
      contaDestino: 'B',
    });

    expect(ORCAMENTO.projetarCategoria('alimentacao', HOJE).gasto).toBe(0);
  });
});

describe('ORCAMENTO.categoriasEmRisco', () => {
  test('lista só quem vai estourar ou já estourou, do pior para o melhor', () => {
    ORCAMENTO.definirLimite('alimentacao', 1000);
    ORCAMENTO.definirLimite('transporte', 1000);
    ORCAMENTO.definirLimite('lazer', 1000);

    gastar(1200, 'alimentacao', 10); // estourado
    gastar(870, 'transporte', 10);   // vai estourar
    gastar(200, 'lazer', 10);        // tranquilo

    const risco = ORCAMENTO.categoriasEmRisco(HOJE);
    expect(risco.map((r) => r.categoria)).toEqual(['alimentacao', 'transporte']);
  });

  test('sem risco nenhum devolve lista vazia', () => {
    ORCAMENTO.definirLimite('alimentacao', 1000);
    gastar(100, 'alimentacao', 10);

    expect(ORCAMENTO.categoriasEmRisco(HOJE)).toEqual([]);
  });
});

describe('ORCAMENTO.mensagemRisco', () => {
  test('diz o percentual e quantos dias faltam', () => {
    ORCAMENTO.definirLimite('alimentacao', 1000);
    gastar(870, 'alimentacao', 10);

    const msg = ORCAMENTO.mensagemRisco('alimentacao', HOJE);
    expect(msg).toContain('87%');
    expect(msg).toContain('13 dias');
  });

  test('para quem já estourou, diz de quanto foi', () => {
    ORCAMENTO.definirLimite('alimentacao', 1000);
    gastar(1200, 'alimentacao', 10);

    expect(ORCAMENTO.mensagemRisco('alimentacao', HOJE)).toMatch(/200/);
  });

  test('sem risco não inventa mensagem', () => {
    ORCAMENTO.definirLimite('alimentacao', 1000);
    gastar(50, 'alimentacao', 10);

    expect(ORCAMENTO.mensagemRisco('alimentacao', HOJE)).toBe('');
  });

  test('sugere um teto diário para o resto do mês', () => {
    ORCAMENTO.definirLimite('alimentacao', 1000);
    gastar(870, 'alimentacao', 10);

    // Restam R$ 130 para 13 dias: R$ 10 por dia.
    const p = ORCAMENTO.projetarCategoria('alimentacao', HOJE);
    expect(p.tetoDiarioSugerido).toBeCloseTo(10, 2);
  });

  test('quem já estourou não recebe teto diário', () => {
    ORCAMENTO.definirLimite('alimentacao', 1000);
    gastar(1200, 'alimentacao', 10);

    expect(ORCAMENTO.projetarCategoria('alimentacao', HOJE).tetoDiarioSugerido).toBe(0);
  });
});
