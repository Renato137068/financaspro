/**
 * patrimonio-real.test.js — exercita js/patrimonio.js REAL.
 *
 * Substitui `patrimonio.test.js`, que reimplementava a aritmética inline e
 * portanto nunca protegeu o arquivo de produção. Patrimônio líquido é um número
 * que o usuário lê como verdade sobre a própria vida financeira: um erro de
 * sinal aqui não é bug de UI.
 */
const { loadCoreModules, resetFixtures } = require('./load-sources');

loadCoreModules();

const P = () => global.PATRIMONIO;

beforeEach(function() {
  resetFixtures();
});

describe('PATRIMONIO — criação de ativos', function() {
  test('cria ativo com id, data e valor numérico', function() {
    const a = P().criarAtivo({ nome: 'Apartamento', valor: '250000', tipo: 'imovel' });

    expect(a.id).toEqual(expect.any(String));
    expect(a.nome).toBe('Apartamento');
    expect(a.tipo).toBe('imovel');
    expect(a.valor).toBe(250000);
    expect(a.criadoEm).toEqual(expect.any(String));
  });

  test('aplica trim no nome', function() {
    expect(P().criarAtivo({ nome: '  Poupança  ', valor: 100 }).nome).toBe('Poupança');
  });

  test('recusa nome vazio', function() {
    expect(() => P().criarAtivo({ nome: '', valor: 100 })).toThrow(/nome/i);
    expect(() => P().criarAtivo({ nome: '   ', valor: 100 })).toThrow(/nome/i);
  });

  test('recusa valor inválido', function() {
    expect(() => P().criarAtivo({ nome: 'X', valor: 'abc' })).toThrow(/inválido/i);
    expect(() => P().criarAtivo({ nome: 'X', valor: -1 })).toThrow(/inválido/i);
  });

  test('aceita ativo de valor zero — conta zerada continua sendo um ativo', function() {
    expect(P().criarAtivo({ nome: 'Conta nova', valor: 0 }).valor).toBe(0);
  });

  test('tipo desconhecido cai em "outro" em vez de gravar lixo', function() {
    expect(P().criarAtivo({ nome: 'X', valor: 10, tipo: 'cripto' }).tipo).toBe('outro');
  });

  test('tipo omitido assume conta corrente', function() {
    expect(P().criarAtivo({ nome: 'X', valor: 10 }).tipo).toBe('corrente');
  });

  test('ativos criados aparecem na listagem', function() {
    P().criarAtivo({ nome: 'A', valor: 10 });
    P().criarAtivo({ nome: 'B', valor: 20 });

    expect(P().listarAtivos()).toHaveLength(2);
  });
});

describe('PATRIMONIO — criação de dívidas', function() {
  test('cria dívida com os campos esperados', function() {
    const d = P().criarDivida({ nome: 'Financiamento', valor: '80000', tipo: 'financiamento' });

    expect(d.nome).toBe('Financiamento');
    expect(d.tipo).toBe('financiamento');
    expect(d.valor).toBe(80000);
  });

  test('recusa dívida de valor zero — dívida quitada não é dívida', function() {
    // Regra diferente da de ativos, e proposital.
    expect(() => P().criarDivida({ nome: 'X', valor: 0 })).toThrow(/inválido/i);
  });

  test('recusa valor negativo', function() {
    expect(() => P().criarDivida({ nome: 'X', valor: -5 })).toThrow(/inválido/i);
  });

  test('tipo desconhecido cai em "outro"', function() {
    expect(P().criarDivida({ nome: 'X', valor: 10, tipo: 'agiota' }).tipo).toBe('outro');
  });
});

describe('PATRIMONIO — atualização', function() {
  test('atualiza campos do ativo preservando o resto', function() {
    const a = P().criarAtivo({ nome: 'Carro', valor: 50000, tipo: 'veiculo' });
    const out = P().atualizarAtivo(a.id, { valor: 45000 });

    expect(out.valor).toBe(45000);
    expect(out.nome).toBe('Carro');
    expect(out.id).toBe(a.id);
  });

  test('converte valor em string na atualização', function() {
    const a = P().criarAtivo({ nome: 'Carro', valor: 50000 });
    expect(P().atualizarAtivo(a.id, { valor: '45000' }).valor).toBe(45000);
  });

  test('recusa valor inválido na atualização', function() {
    const a = P().criarAtivo({ nome: 'Carro', valor: 50000 });
    expect(() => P().atualizarAtivo(a.id, { valor: 'muito' })).toThrow(/inválido/i);
  });

  test('id inexistente lança em vez de criar silenciosamente', function() {
    expect(() => P().atualizarAtivo('nao-existe', { valor: 1 })).toThrow(/não encontrado/i);
    expect(() => P().atualizarDivida('nao-existe', { valor: 1 })).toThrow(/não encontrada/i);
  });

  test('atualiza dívida', function() {
    const d = P().criarDivida({ nome: 'Cartão', valor: 3000, tipo: 'cartao' });
    expect(P().atualizarDivida(d.id, { valor: 1500 }).valor).toBe(1500);
  });
});

describe('PATRIMONIO — exclusão', function() {
  test('remove só o ativo indicado', function() {
    const a = P().criarAtivo({ nome: 'A', valor: 10 });
    P().criarAtivo({ nome: 'B', valor: 20 });

    P().excluirAtivo(a.id);
    const restantes = P().listarAtivos();

    expect(restantes).toHaveLength(1);
    expect(restantes[0].nome).toBe('B');
  });

  test('excluir id inexistente não altera nada nem lança', function() {
    P().criarAtivo({ nome: 'A', valor: 10 });
    P().excluirAtivo('fantasma');
    expect(P().listarAtivos()).toHaveLength(1);
  });

  test('remove dívida', function() {
    const d = P().criarDivida({ nome: 'D', valor: 100 });
    P().excluirDivida(d.id);
    expect(P().listarDividas()).toHaveLength(0);
  });
});

describe('PATRIMONIO — busca', function() {
  test('obterAtivo devolve o item ou null', function() {
    const a = P().criarAtivo({ nome: 'A', valor: 10 });

    expect(P().obterAtivo(a.id).nome).toBe('A');
    expect(P().obterAtivo('nao-existe')).toBeNull();
  });

  test('obterDivida devolve o item ou null', function() {
    const d = P().criarDivida({ nome: 'D', valor: 10 });

    expect(P().obterDivida(d.id).nome).toBe('D');
    expect(P().obterDivida('nao-existe')).toBeNull();
  });
});

describe('PATRIMONIO — cálculo do líquido', function() {
  test('sem nada cadastrado tudo é zero', function() {
    expect(P().totalAtivos()).toBe(0);
    expect(P().totalDividas()).toBe(0);
    expect(P().patrimonioLiquido()).toBe(0);
  });

  test('líquido é a diferença entre ativos e dívidas', function() {
    P().criarAtivo({ nome: 'Imóvel', valor: 300000, tipo: 'imovel' });
    P().criarAtivo({ nome: 'Poupança', valor: 20000, tipo: 'poupanca' });
    P().criarDivida({ nome: 'Financiamento', valor: 180000, tipo: 'financiamento' });

    expect(P().totalAtivos()).toBe(320000);
    expect(P().totalDividas()).toBe(180000);
    expect(P().patrimonioLiquido()).toBe(140000);
  });

  test('líquido negativo é reportado como negativo, não zerado', function() {
    // Endividamento acima do patrimônio é informação, não erro a esconder.
    P().criarAtivo({ nome: 'Carro', valor: 30000 });
    P().criarDivida({ nome: 'Financiamento', valor: 45000 });

    expect(P().patrimonioLiquido()).toBe(-15000);
  });

  test('decimais somam sem perda relevante', function() {
    P().criarAtivo({ nome: 'A', valor: 1000.5 });
    P().criarAtivo({ nome: 'B', valor: 2000.25 });

    expect(P().totalAtivos()).toBeCloseTo(3000.75, 2);
  });
});

describe('PATRIMONIO — rótulos e ícones', function() {
  test('todos os tipos de ativo têm rótulo próprio', function() {
    const semRotulo = P().TIPOS_ATIVO.filter(t => P().tipoAtivoLabel(t) === 'Outro' && t !== 'outro');
    expect(semRotulo).toEqual([]);
  });

  test('todos os tipos de dívida têm rótulo próprio', function() {
    const semRotulo = P().TIPOS_DIVIDA
      .filter(t => P().tipoDividaLabel(t) === 'Outra dívida' && t !== 'outro');
    expect(semRotulo).toEqual([]);
  });

  test('tipo desconhecido cai no rótulo genérico', function() {
    expect(P().tipoAtivoLabel('inventado')).toBe('Outro');
    expect(P().tipoDividaLabel('inventado')).toBe('Outra dívida');
  });

  test('todo tipo tem ícone — nenhum card fica sem símbolo', function() {
    P().TIPOS_ATIVO.forEach(t => expect(P().iconeAtivo(t)).toEqual(expect.any(String)));
    P().TIPOS_DIVIDA.forEach(t => expect(P().iconeDivida(t)).toEqual(expect.any(String)));
    expect(P().iconeAtivo('inventado')).toBe('wallet');
    expect(P().iconeDivida('inventado')).toBe('alert-circle');
  });
});

describe('PATRIMONIO — integração com contas', function() {
  test('sem o módulo CONTAS a sugestão devolve lista vazia em vez de quebrar', function() {
    expect(P().sugerirDeContas()).toEqual([]);
  });
});

describe('PATRIMONIO — isolamento de estado', function() {
  test('listar devolve cópia — mutar o resultado não corrompe o armazenado', function() {
    P().criarAtivo({ nome: 'A', valor: 10 });

    const lista = P().listarAtivos();
    lista.push({ nome: 'injetado', valor: 999999 });

    expect(P().listarAtivos()).toHaveLength(1);
    expect(P().totalAtivos()).toBe(10);
  });
});
