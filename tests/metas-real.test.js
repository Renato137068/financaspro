/**
 * metas-real.test.js — exercita js/metas.js REAL
 * Cobre: criar/validar, listar (todas/ativas), atualizar, excluir,
 *        registrarAporte, calcularProgresso (com/sem prazo/concluída).
 */
const { loadCoreModules, resetFixtures } = require('./load-sources');

beforeAll(function() { loadCoreModules(); });
beforeEach(function() {
  resetFixtures();
  global.METAS.init();
});

describe('METAS.criar — validação', function() {
  test('cria meta válida', function() {
    var m = global.METAS.criar({ titulo: 'Viagem', valorAlvo: 5000 });
    expect(m.id).toBeDefined();
    expect(m.valorAlvo).toBe(5000);
    expect(m.concluida).toBe(false);
    expect(m.icone).toBe('target');
  });
  test('título vazio lança', function() {
    expect(function() { global.METAS.criar({ titulo: '  ', valorAlvo: 100 }); }).toThrow(/nome/);
  });
  test('valorAlvo inválido lança', function() {
    expect(function() { global.METAS.criar({ titulo: 'X', valorAlvo: 0 }); }).toThrow(/alvo/);
  });
  test('aceita valorAtual, prazo e ícone customizados', function() {
    var m = global.METAS.criar({ titulo: 'Carro', valorAlvo: 40000, valorAtual: 10000, prazo: '2027-01-01', icone: 'car' });
    expect(m.valorAtual).toBe(10000);
    expect(m.icone).toBe('car');
  });
});

describe('METAS.listar / obter', function() {
  beforeEach(function() {
    global.METAS.criar({ titulo: 'Ativa', valorAlvo: 1000, valorAtual: 100 });
    var done = global.METAS.criar({ titulo: 'Cheia', valorAlvo: 1000, valorAtual: 100 });
    global.METAS.atualizar(done.id, { valorAtual: 1000 }); // vira concluída
  });
  test('listar() traz todas', function() {
    expect(global.METAS.listar()).toHaveLength(2);
  });
  test('listar(true) traz apenas ativas', function() {
    var ativas = global.METAS.listar(true);
    expect(ativas).toHaveLength(1);
    expect(ativas[0].titulo).toBe('Ativa');
  });
  test('obter por id', function() {
    var id = global.METAS.listar()[0].id;
    expect(global.METAS.obter(id).id).toBe(id);
  });
  test('obter id inexistente devolve null', function() {
    expect(global.METAS.obter('zzz')).toBeNull();
  });
});

describe('METAS.atualizar / excluir', function() {
  var id;
  beforeEach(function() { id = global.METAS.criar({ titulo: 'M', valorAlvo: 1000 }).id; });
  test('atualizar aplica patch', function() {
    expect(global.METAS.atualizar(id, { titulo: 'Novo' }).titulo).toBe('Novo');
  });
  test('atualizar marca concluída ao atingir alvo', function() {
    expect(global.METAS.atualizar(id, { valorAtual: 1000 }).concluida).toBe(true);
  });
  test('atualizar id inexistente devolve null', function() {
    expect(global.METAS.atualizar('zzz', { titulo: 'x' })).toBeNull();
  });
  test('excluir remove', function() {
    global.METAS.excluir(id);
    expect(global.METAS.listar()).toHaveLength(0);
  });
});

describe('METAS.registrarAporte', function() {
  var id;
  beforeEach(function() { id = global.METAS.criar({ titulo: 'M', valorAlvo: 1000, valorAtual: 100 }).id; });
  test('soma aporte', function() {
    expect(global.METAS.registrarAporte(id, 200).valorAtual).toBe(300);
  });
  test('não ultrapassa o alvo', function() {
    expect(global.METAS.registrarAporte(id, 5000).valorAtual).toBe(1000);
  });
  test('aporte inválido lança', function() {
    expect(function() { global.METAS.registrarAporte(id, 0); }).toThrow(/inválido/);
  });
  test('meta inexistente lança', function() {
    expect(function() { global.METAS.registrarAporte('zzz', 10); }).toThrow(/encontrada/);
  });
});

describe('METAS.calcularProgresso', function() {
  test('meta nula devolve zeros', function() {
    var p = global.METAS.calcularProgresso(null);
    expect(p.percentual).toBe(0);
    expect(p.concluida).toBe(false);
  });
  test('percentual e restante corretos', function() {
    var p = global.METAS.calcularProgresso({ valorAlvo: 1000, valorAtual: 250 });
    expect(p.percentual).toBe(25);
    expect(p.restante).toBe(750);
  });
  test('percentual limitado a 100', function() {
    var p = global.METAS.calcularProgresso({ valorAlvo: 1000, valorAtual: 5000 });
    expect(p.percentual).toBe(100);
    expect(p.concluida).toBe(true);
  });
  test('valorAlvo zero não divide por zero', function() {
    expect(global.METAS.calcularProgresso({ valorAlvo: 0, valorAtual: 10 }).percentual).toBe(0);
  });
  test('calcula diasRestantes quando há prazo', function() {
    var futuro = new Date(); futuro.setDate(futuro.getDate() + 10);
    var iso = futuro.toISOString().split('T')[0];
    var p = global.METAS.calcularProgresso({ valorAlvo: 1000, valorAtual: 0, prazo: iso });
    expect(p.diasRestantes).toBeGreaterThanOrEqual(9);
    expect(p.diasRestantes).toBeLessThanOrEqual(12);
  });
});
