/**
 * sync-merge.test.js — fusão do que vem da nuvem com o aparelho (#2, §7).
 * Prova que os bugs de perda de dados D1/D2/D3 ficam resolvidos.
 */
const { carregarScript } = require('./helpers/carregar-script.cjs');
// require direto, e não vm.runInContext.
//
// O módulo é puro (zero DOM, zero global) e termina com `module.exports`, então
// não precisa de sandbox. E carregá-lo pelo mesmo caminho que sync-dados.test
// usa garante UMA única cópia instrumentada: quando cada
// suíte executava o arquivo no seu próprio vm, o provider v8 registrava várias
// cópias do mesmo caminho absoluto e mesclava as contagens — o relatório
// mostrava 66% de linhas e 54% de funções num módulo que os testes cobrem
// inteiro, e o piso de 95% falhava por ruído de medição.
const SM = carregarScript('js/core/sync-merge.js');
const T1 = '2026-07-09T10:00:00Z';
const T2 = '2026-07-09T11:00:00Z';

describe('SYNC_MERGE.mergeDelta', () => {
  test('D1: registro pendente NÃO é sobrescrito pelo servidor', () => {
    const local = [{ id: 'a', descricao: 'local não sincronizado', updatedAt: T1 }];
    const delta = [{ id: 'a', descricao: 'versão servidor', updatedAt: T2 }];
    const r = SM.mergeDelta(local, ['a'], delta);
    expect(r).toHaveLength(1);
    expect(r[0].descricao).toBe('local não sincronizado'); // protegido
  });

  test('D2: tombstone remove do cache (sem ressurreição)', () => {
    const local = [{ id: 'b', descricao: 'gasto', updatedAt: T1 }];
    const delta = [{ id: 'b', deletedAt: T2 }];
    expect(SM.mergeDelta(local, [], delta)).toEqual([]);
  });

  test('D2b: tombstone de item pendente é ignorado (pendente vence)', () => {
    const local = [{ id: 'b', descricao: 'editado offline', updatedAt: T2 }];
    const delta = [{ id: 'b', deletedAt: T1 }];
    const r = SM.mergeDelta(local, ['b'], delta);
    expect(r).toHaveLength(1);
  });

  test('D3: merge por registro — delta mais novo sobrescreve', () => {
    const local = [{ id: 'c', valor: 10, updatedAt: T1 }];
    const delta = [{ id: 'c', valor: 20, updatedAt: T2 }];
    expect(SM.mergeDelta(local, [], delta)[0].valor).toBe(20);
  });

  test('D3b: delta mais antigo NÃO sobrescreve local mais novo', () => {
    const local = [{ id: 'c', valor: 99, updatedAt: T2 }];
    const delta = [{ id: 'c', valor: 5, updatedAt: T1 }];
    expect(SM.mergeDelta(local, [], delta)[0].valor).toBe(99);
  });

  test('registro novo do servidor é adicionado', () => {
    const r = SM.mergeDelta([], [], [{ id: 'd', valor: 1, updatedAt: T1 }]);
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe('d');
  });

  test('tombstone de item inexistente é no-op', () => {
    expect(SM.mergeDelta([], [], [{ id: 'z', deletedAt: T1 }])).toEqual([]);
  });

  test('não muda nada com delta vazio', () => {
    const local = [{ id: 'a', updatedAt: T1 }];
    expect(SM.mergeDelta(local, [], [])).toHaveLength(1);
  });

  test('aceita Set em pendingIds', () => {
    const local = [{ id: 'a', v: 'local', updatedAt: T1 }];
    const delta = [{ id: 'a', v: 'srv', updatedAt: T2 }];
    const r = SM.mergeDelta(local, new Set(['a']), delta);
    expect(r[0].v).toBe('local');
  });
});

describe('SYNC_MERGE.detectarConflitos', () => {
  test('detecta edição simultânea com timestamps próximos', () => {
    const local = [{ id: 'a', valor: 10, updatedAt: T1 }];
    const delta = [{ id: 'a', valor: 20, updatedAt: '2026-07-09T10:00:30Z' }];
    expect(SM.detectarConflitos(local, [], delta)).toHaveLength(1);
  });

  test('ignora quando remoto é muito mais antigo (LWW automático)', () => {
    const local = [{ id: 'a', valor: 10, updatedAt: T2 }];
    const delta = [{ id: 'a', valor: 20, updatedAt: T1 }];
    expect(SM.detectarConflitos(local, [], delta)).toHaveLength(0);
  });

  test('ignora registros pendentes na outbox', () => {
    const local = [{ id: 'a', valor: 10, updatedAt: T1 }];
    const delta = [{ id: 'a', valor: 20, updatedAt: T1 }];
    expect(SM.detectarConflitos(local, ['a'], delta)).toHaveLength(0);
  });
});

describe('SYNC_MERGE.aplicarResolucoes', () => {
  test('mantém versão local quando escolhido', () => {
    const local = [{ id: 'a', valor: 10, updatedAt: T1 }];
    const delta = [{ id: 'a', valor: 20, updatedAt: T2 }];
    const r = SM.aplicarResolucoes(local, [], delta, { a: 'local' });
    expect(r.find(x => x.id === 'a').valor).toBe(10);
  });

  test('aceita remoto quando escolhido', () => {
    const local = [{ id: 'a', valor: 10, updatedAt: T1 }];
    const delta = [{ id: 'a', valor: 20, updatedAt: T2 }];
    const r = SM.aplicarResolucoes(local, [], delta, { a: 'remote' });
    expect(r.find(x => x.id === 'a').valor).toBe(20);
  });

  test('escolher remoto vence mesmo com o local MAIS NOVO (não é LWW)', () => {
    // Regressão: com o local mais novo (T2) que o remoto (T1), o LWW do
    // mergeDelta descartava o delta e a escolha "remoto" sumia — o usuário
    // resolvia o conflito e o app mantinha o local.
    const local = [{ id: 'a', valor: 10, updatedAt: T2 }];
    const delta = [{ id: 'a', valor: 20, updatedAt: T1 }];
    const r = SM.aplicarResolucoes(local, [], delta, { a: 'remote' });
    expect(r.find(x => x.id === 'a').valor).toBe(20);
  });

  test('escolher local vence mesmo com o remoto mais novo', () => {
    const local = [{ id: 'a', valor: 10, updatedAt: T1 }];
    const delta = [{ id: 'a', valor: 20, updatedAt: T2 }];
    const r = SM.aplicarResolucoes(local, [], delta, { a: 'local' });
    expect(r.find(x => x.id === 'a').valor).toBe(10);
  });
});

/**
 * As entradas defensivas do módulo não são luxo: `mergeDelta` recebe o corpo
 * de uma resposta HTTP e o cache do localStorage, duas fontes que já chegaram
 * corrompidas em produção (JSON truncado por cota, resposta 200 com corpo
 * vazio). Se qualquer uma dessas guardas falhar, o erro não é uma exceção — é
 * o extrato do usuário sumindo da tela.
 */
describe('SYNC_MERGE._ms — normalização de timestamp', () => {
  test('aceita Date, ISO string e epoch em ISO', () => {
    expect(SM._ms(new Date(T1))).toBe(Date.parse(T1));
    expect(SM._ms(T1)).toBe(Date.parse(T1));
  });

  test('null e undefined viram NaN (e não 1970)', () => {
    // Se virassem 0, todo registro sem updatedAt pareceria antiquíssimo e
    // seria sobrescrito pelo servidor sem análise.
    expect(Number.isNaN(SM._ms(null))).toBe(true);
    expect(Number.isNaN(SM._ms(undefined))).toBe(true);
  });

  test('string inválida vira NaN', () => {
    expect(Number.isNaN(SM._ms('ontem à tarde'))).toBe(true);
    expect(Number.isNaN(SM._ms(''))).toBe(true);
  });

  test('Date inválido vira NaN', () => {
    expect(Number.isNaN(SM._ms(new Date('nada')))).toBe(true);
  });
});

describe('SYNC_MERGE._pendingSet — formatos de entrada', () => {
  test('aceita Array, Set e ausência', () => {
    expect(SM._pendingSet(['a', 'b'])).toEqual({ a: true, b: true });
    expect(SM._pendingSet(new Set(['a']))).toEqual({ a: true });
    expect(SM._pendingSet(null)).toEqual({});
    expect(SM._pendingSet(undefined)).toEqual({});
    expect(SM._pendingSet([])).toEqual({});
  });
});

describe('SYNC_MERGE.mergeDelta — entradas malformadas', () => {
  test('local não-array é tratado como vazio, não explode', () => {
    expect(SM.mergeDelta(null, [], [{ id: 'a', updatedAt: T1 }])).toHaveLength(1);
    expect(SM.mergeDelta(undefined, [], [])).toEqual([]);
    expect(SM.mergeDelta('lixo', [], [])).toEqual([]);
  });

  test('delta não-array é ignorado, preservando o cache local', () => {
    const local = [{ id: 'a', updatedAt: T1 }];
    expect(SM.mergeDelta(local, [], null)).toHaveLength(1);
    expect(SM.mergeDelta(local, [], 'lixo')).toHaveLength(1);
  });

  test('registro local sem id é descartado do índice', () => {
    const local = [{ descricao: 'sem id' }, { id: 'a', updatedAt: T1 }];
    const r = SM.mergeDelta(local, [], []);
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe('a');
  });

  test('item nulo ou sem id no delta é ignorado', () => {
    const local = [{ id: 'a', valor: 1, updatedAt: T1 }];
    const r = SM.mergeDelta(local, [], [null, undefined, { valor: 9 }]);
    expect(r).toHaveLength(1);
    expect(r[0].valor).toBe(1);
  });

  test('updatedAt ilegível dos dois lados: servidor vence (é a fonte)', () => {
    const local = [{ id: 'a', valor: 1, updatedAt: 'quebrado' }];
    const delta = [{ id: 'a', valor: 2, updatedAt: 'também quebrado' }];
    expect(SM.mergeDelta(local, [], delta)[0].valor).toBe(2);
  });

  test('local sem updatedAt cede ao delta', () => {
    const local = [{ id: 'a', valor: 1 }];
    const delta = [{ id: 'a', valor: 2, updatedAt: T1 }];
    expect(SM.mergeDelta(local, [], delta)[0].valor).toBe(2);
  });

  test('mesmo instante nos dois lados: servidor vence (>=)', () => {
    const local = [{ id: 'a', valor: 1, updatedAt: T1 }];
    const delta = [{ id: 'a', valor: 2, updatedAt: T1 }];
    expect(SM.mergeDelta(local, [], delta)[0].valor).toBe(2);
  });
});

describe('SYNC_MERGE.orcamentosToArray / arrayToOrcamentos', () => {
  test('ida e volta preserva limite, id, período e datas', () => {
    const orc = {
      alimentacao: { id: 'o1', limite: 500, periodo: 'mensal', definidoEm: T1, updatedAt: T2 },
      lazer: { id: 'o2', limite: 200, definidoEm: T1 },
    };
    const lista = SM.orcamentosToArray(orc);
    expect(lista).toEqual([
      { id: 'o1', categoria: 'alimentacao', limite: 500, periodo: 'mensal', definidoEm: T1, updatedAt: T2, ativo: true },
      { id: 'o2', categoria: 'lazer', limite: 200, periodo: 'mensal', definidoEm: T1, updatedAt: T1, ativo: true },
    ]);
    expect(SM.arrayToOrcamentos(lista)).toEqual({
      alimentacao: { id: 'o1', limite: 500, periodo: 'mensal', definidoEm: T1, updatedAt: T2 },
      lazer: { id: 'o2', limite: 200, periodo: 'mensal', definidoEm: T1, updatedAt: T1 },
    });
  });

  test('entrada vazia ou inválida vira lista vazia; entradas nulas são puladas', () => {
    expect(SM.orcamentosToArray(null)).toEqual([]);
    expect(SM.orcamentosToArray('x')).toEqual([]);
    expect(SM.orcamentosToArray({ a: null })).toEqual([]);
  });

  test('na volta, apagados, inativos e sem categoria saem', () => {
    expect(SM.arrayToOrcamentos([
      null,
      { id: 'x', limite: 1 },
      { id: 'a', categoria: 'a', limite: 1, deletedAt: T1 },
      { id: 'b', categoria: 'b', limite: 1, ativo: false },
      { id: 'c', categoria: 'c', limite: 3, updatedAt: T2 },
    ])).toEqual({ c: { id: 'c', limite: 3, periodo: 'mensal', definidoEm: T2, updatedAt: T2 } });
    expect(SM.arrayToOrcamentos(undefined)).toEqual({});
  });
});
