/**
 * transacoes-tags.test.js — tags/marcadores nos lançamentos (feature nova).
 *
 * Tags agrupam lançamentos ENTRE categorias (uma categoria por lançamento,
 * várias tags): "quanto gastei na viagem" somando comida + transporte. Aqui se
 * cobre a normalização, a gravação em criar/atualizar, a lista distinta e o
 * filtro por tag — tudo no módulo real.
 */
const { loadCoreModules, resetFixtures } = require('./load-sources');

beforeAll(function() { loadCoreModules(); });
beforeEach(function() {
  resetFixtures();
  global.TRANSACOES.init();
});

const T = () => global.TRANSACOES;

describe('TRANSACOES.normalizarTags', function() {
  test('string separada por vírgula vira array minúsculo e aparado', function() {
    expect(T().normalizarTags(' Viagem, Reembolsável ')).toEqual(['viagem', 'reembolsável']);
  });

  test('aceita array e remove o # inicial', function() {
    expect(T().normalizarTags(['#Casa', '##dupla'])).toEqual(['casa', 'dupla']);
  });

  test('remove vazias e duplicadas (case-insensitive)', function() {
    expect(T().normalizarTags('a,,A, b , a')).toEqual(['a', 'b']);
  });

  test('colapsa espaços internos', function() {
    expect(T().normalizarTags('viagem    rio')).toEqual(['viagem rio']);
  });

  test('limita a 8 tags', function() {
    expect(T().normalizarTags('1,2,3,4,5,6,7,8,9,10')).toHaveLength(8);
  });

  test('limita cada tag a 30 caracteres', function() {
    var longa = 'a'.repeat(40);
    expect(T().normalizarTags(longa)[0]).toHaveLength(30);
  });

  test('entrada vazia/nula devolve []', function() {
    expect(T().normalizarTags('')).toEqual([]);
    expect(T().normalizarTags(null)).toEqual([]);
    expect(T().normalizarTags(undefined)).toEqual([]);
  });
});

describe('TRANSACOES.criar — tags', function() {
  test('grava tags normalizadas quando informadas', function() {
    var tx = T().criar('despesa', 50, 'lazer', '2026-05-10', 'Cinema', '', '', { tags: 'Viagem, cinema' });
    expect(tx.tags).toEqual(['viagem', 'cinema']);
  });

  test('sem tags, o campo não é criado', function() {
    var tx = T().criar('despesa', 50, 'lazer', '2026-05-10', 'Cinema');
    expect(tx.tags).toBeUndefined();
  });

  test('tags só de lixo não criam o campo', function() {
    var tx = T().criar('despesa', 50, 'lazer', '2026-05-10', 'Cinema', '', '', { tags: ' , , ' });
    expect(tx.tags).toBeUndefined();
  });
});

describe('TRANSACOES.atualizar — tags', function() {
  test('atualiza as tags quando fornecidas', function() {
    var tx = T().criar('despesa', 50, 'lazer', '2026-05-10', 'Cinema', '', '', { tags: 'a' });
    var up = T().atualizar(tx.id, { tags: 'B, c' });
    expect(up.tags).toEqual(['b', 'c']);
  });

  test('sem tags no update, as tags atuais são preservadas', function() {
    var tx = T().criar('despesa', 50, 'lazer', '2026-05-10', 'Cinema', '', '', { tags: 'viagem' });
    var up = T().atualizar(tx.id, { descricao: 'Outro' });
    expect(up.tags).toEqual(['viagem']);
  });

  test('tags vazias limpam o marcador', function() {
    var tx = T().criar('despesa', 50, 'lazer', '2026-05-10', 'Cinema', '', '', { tags: 'viagem' });
    var up = T().atualizar(tx.id, { tags: '' });
    expect(up.tags).toEqual([]);
  });
});

describe('TRANSACOES.tagsUsadas e porTag', function() {
  test('tagsUsadas devolve lista distinta e ordenada', function() {
    T().criar('despesa', 10, 'lazer', '2026-05-10', 'A', '', '', { tags: 'viagem, comida' });
    T().criar('despesa', 20, 'transporte', '2026-05-11', 'B', '', '', { tags: 'Viagem, uber' });
    expect(T().tagsUsadas()).toEqual(['comida', 'uber', 'viagem']);
  });

  test('porTag devolve só as transações com aquela tag', function() {
    T().criar('despesa', 10, 'lazer', '2026-05-10', 'A', '', '', { tags: 'viagem' });
    T().criar('despesa', 20, 'transporte', '2026-05-11', 'B', '', '', { tags: 'viagem' });
    T().criar('despesa', 30, 'saude', '2026-05-12', 'C', '', '', { tags: 'casa' });

    var res = T().porTag('Viagem'); // aceita entrada não-normalizada
    expect(res.map(function(t) { return t.descricao; }).sort()).toEqual(['A', 'B']);
  });

  test('porTag com tag inexistente ou vazia devolve []', function() {
    T().criar('despesa', 10, 'lazer', '2026-05-10', 'A', '', '', { tags: 'viagem' });
    expect(T().porTag('inexistente')).toEqual([]);
    expect(T().porTag('')).toEqual([]);
  });
});
