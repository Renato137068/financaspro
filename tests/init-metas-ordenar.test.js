/**
 * init-metas-ordenar.test.js — ordenação da lista de metas por urgência.
 *
 * A tela de Metas recebe tráfego do simulador e dos insights; a lista passa a
 * mostrar primeiro o que precisa de ação (vencida → atrasada → resto →
 * concluída), coerente com o insight que aponta a meta mais crítica.
 */
const INIT_METAS = require('../js/modules/init-metas.js');

describe('INIT_METAS._ordemUrgencia', function() {
  test('rankeia por situação (menor = mais urgente)', function() {
    expect(INIT_METAS._ordemUrgencia({ situacao: 'vencida' })).toBe(0);
    expect(INIT_METAS._ordemUrgencia({ situacao: 'atrasado' })).toBe(1);
    expect(INIT_METAS._ordemUrgencia({ situacao: 'no-ritmo' })).toBe(2);
    expect(INIT_METAS._ordemUrgencia({ situacao: 'sem-ritmo' })).toBe(2);
    expect(INIT_METAS._ordemUrgencia({ situacao: 'adiantado' })).toBe(3);
    expect(INIT_METAS._ordemUrgencia({ situacao: 'sem-prazo' })).toBe(4);
  });

  test('concluída vai para o fim, seja qual for a situação', function() {
    expect(INIT_METAS._ordemUrgencia({ concluida: true, situacao: 'vencida' })).toBe(5);
  });
});

describe('INIT_METAS._projecoesOrdenadas', function() {
  var progs = {
    a: { situacao: 'no-ritmo', percentual: 40, concluida: false },
    b: { situacao: 'vencida', percentual: 10, concluida: false },
    c: { situacao: 'atrasado', percentual: 70, concluida: false },
    d: { situacao: 'concluida', percentual: 100, concluida: true },
    e: { situacao: 'atrasado', percentual: 30, concluida: false },
  };

  beforeAll(function() {
    global.METAS = { calcularProjecao: function(m) { return progs[m.id]; } };
  });
  afterAll(function() { delete global.METAS; });

  test('vencida → atrasadas (menos completa antes) → resto → concluída', function() {
    var metas = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }];
    var ordem = INIT_METAS._projecoesOrdenadas(metas).map(function(x) { return x.meta.id; });
    expect(ordem).toEqual(['b', 'e', 'c', 'a', 'd']);
  });

  test('devolve a projeção junto de cada meta (para o card reusar)', function() {
    var out = INIT_METAS._projecoesOrdenadas([{ id: 'b' }]);
    expect(out[0].prog).toBe(progs.b);
  });

  test('não muta o array recebido', function() {
    var metas = [{ id: 'a' }, { id: 'b' }];
    var copia = metas.slice();
    INIT_METAS._projecoesOrdenadas(metas);
    expect(metas).toEqual(copia);
  });
});
