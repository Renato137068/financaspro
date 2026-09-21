/**
 * plano-metas.test.js — texto compartilhável do plano de metas (PLANO_METAS).
 * Módulo puro carregado em vm com METAS/UTILS mockados.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');

function carregar(metasAtivas, projecoes, mensagens) {
  const ctx = {
    Math: Math, Number: Number,
    UTILS: { formatarMoeda: function(v) { return 'R$ ' + Number(v).toFixed(2); } },
    METAS: {
      listar: function() { return metasAtivas; },
      calcularProjecao: function(m) { return projecoes[m.id]; },
      mensagemProjecao: function(m) { return (mensagens || {})[m.id] || ''; },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/plano-metas.js'), 'utf8'), ctx,
    { filename: path.join(root, 'js/plano-metas.js') });
  return ctx.PLANO_METAS;
}

describe('PLANO_METAS', function() {
  test('sem metas ativas devolve null', function() {
    expect(carregar([], {}, {}).texto()).toBeNull();
  });

  test('lista metas com progresso e frase de projeção', function() {
    const metas = [
      { id: 'a', titulo: 'Viagem', valorAtual: 2000, valorAlvo: 12000 },
      { id: 'b', titulo: 'Reserva', valorAtual: 5000, valorAlvo: 10000 },
    ];
    const proj = {
      a: { percentual: 17, restante: 10000, aporteMensalNecessario: 850 },
      b: { percentual: 50, restante: 5000, aporteMensalNecessario: 500 },
    };
    const msg = { a: 'Para o prazo: guarde R$ 850.00 por mês.', b: 'No ritmo certo: R$ 500.00 por mês.' };
    const t = carregar(metas, proj, msg).texto();

    expect(t).toContain('Meu plano de metas');
    expect(t).toContain('1. Viagem — R$ 2000.00 de R$ 12000.00 (17%)');
    expect(t).toContain('Para o prazo: guarde R$ 850.00 por mês.');
    expect(t).toContain('2. Reserva — R$ 5000.00 de R$ 10000.00 (50%)');
    // total mensal = 850 + 500
    expect(t).toContain('Para manter o plano: R$ 1350.00 por mês');
    expect(t).toContain('Organizado no FinançasPro');
  });

  test('metas sem aporte necessário não somam no total (e some a linha do total)', function() {
    const metas = [{ id: 'a', titulo: 'Sonho', valorAtual: 0, valorAlvo: 1000 }];
    const proj = { a: { percentual: 0, restante: 1000, aporteMensalNecessario: null } };
    const t = carregar(metas, proj, {}).texto();
    expect(t).not.toMatch(/Para manter o plano/);
  });

  test('totalMensal ignora aportes nulos/zero', function() {
    const metas = [
      { id: 'a', titulo: 'A', valorAtual: 0, valorAlvo: 100 },
      { id: 'b', titulo: 'B', valorAtual: 0, valorAlvo: 100 },
    ];
    const proj = {
      a: { percentual: 0, aporteMensalNecessario: 300 },
      b: { percentual: 0, aporteMensalNecessario: null },
    };
    expect(carregar(metas, proj, {}).totalMensal()).toBe(300);
  });

  test('não termina em exclamação (voz da marca)', function() {
    const metas = [{ id: 'a', titulo: 'A', valorAtual: 0, valorAlvo: 100 }];
    const proj = { a: { percentual: 0, aporteMensalNecessario: 0 } };
    expect(carregar(metas, proj, {}).texto().trim().endsWith('!')).toBe(false);
  });
});
