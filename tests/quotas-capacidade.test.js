/**
 * quotas-capacidade.test.js — os limites de capacidade do plano gratuito.
 *
 * Estes limites são a metade "firme" do modelo: o FREE registra a vida
 * financeira inteira sem teto de volume, mas a capacidade (quantas metas,
 * quantos gastos fixos, quantas contas a pagar) é onde o Pro começa.
 *
 * Os testes dos módulos rodam sem `BILLING` no sandbox, então os guards
 * degradam para "permitido" e nunca são exercitados por lá. Aqui o stub é
 * injetado dentro do sandbox de propósito — é o único lugar que prova que o
 * limite realmente barra, e que ele some quando o BILLING não carrega.
 */
const { loadCoreModules, resetFixtures, execNoSandbox } = require('./load-sources');

/**
 * Instala um BILLING de mentira no sandbox. `cheias` são as quotas que devem
 * responder "não cabe mais".
 */
function stubBilling(cheias) {
  execNoSandbox(
    'BILLING = { _bloqueios: [],' +
    '  guardQuota: function(kind) {' +
    '    if (' + JSON.stringify(cheias) + '.indexOf(kind) === -1) return true;' +
    '    this._bloqueios.push(kind); return false;' +
    '  },' +
    '  canUse: function() { return true; } };'
  );
}

function bloqueios() {
  return execNoSandbox('BILLING && BILLING._bloqueios ? BILLING._bloqueios.slice() : []');
}

function semBilling() {
  execNoSandbox('BILLING = undefined;');
}

beforeAll(function() { loadCoreModules(); });

beforeEach(function() {
  resetFixtures();
  semBilling();
});

afterEach(function() { semBilling(); });

describe('Quotas de capacidade barram no teto', function() {
  test('a 2ª meta abre o paywall em vez de ser criada', function() {
    global.METAS.init();
    stubBilling(['goal']);

    expect(function() {
      global.METAS.criar({ titulo: 'Segunda viagem', valorAlvo: 3000 });
    }).toThrow();
    expect(bloqueios()).toContain('goal');
    expect(global.METAS.listar().length).toBe(0);
  });

  test('conta a pagar acima do teto não é gravada', function() {
    global.CONTAS_PAGAR.init();
    stubBilling(['bill']);

    expect(function() {
      global.CONTAS_PAGAR.criar({ descricao: 'Luz', valor: 120, vencimento: '2026-10-10' });
    }).toThrow();
    expect(bloqueios()).toContain('bill');
    expect(global.CONTAS_PAGAR.listar().length).toBe(0);
  });

  test('gasto fixo acima do teto não é gravado', function() {
    global.ASSINATURAS.init();
    stubBilling(['subscription']);

    expect(function() {
      global.ASSINATURAS.criar({ nome: 'Streaming', valor: 39.9, diaCobranca: 10 });
    }).toThrow();
    expect(bloqueios()).toContain('subscription');
  });

  test('uma quota cheia não contamina as outras', function() {
    global.METAS.init();
    global.ASSINATURAS.init();
    stubBilling(['goal']);

    expect(function() {
      global.METAS.criar({ titulo: 'X', valorAlvo: 100 });
    }).toThrow();
    // Gasto fixo tem cota própria e continua passando.
    var a = global.ASSINATURAS.criar({ nome: 'Internet', valor: 100, diaCobranca: 5 });
    expect(a).toBeTruthy();
  });
});

describe('Sem teto atingido, tudo passa', function() {
  test('meta é criada quando há espaço', function() {
    global.METAS.init();
    stubBilling([]);

    var m = global.METAS.criar({ titulo: 'Reserva', valorAlvo: 10000 });
    expect(m.id).toBeDefined();
    expect(global.METAS.listar().length).toBe(1);
  });

  test('sem BILLING carregado nada é bloqueado', function() {
    // Boot parcial, script fora do app, teste de módulo: o guard some e o
    // usuário nunca fica preso por causa de um módulo que não carregou.
    global.METAS.init();
    var m = global.METAS.criar({ titulo: 'Sem billing', valorAlvo: 500 });
    expect(m.id).toBeDefined();
  });
});

describe('Categoria personalizada devolve false em vez de lançar', function() {
  test('o guard existe e não derruba o formulário', function() {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'js/categories.js'), 'utf8',
    );
    // Lançar aqui derrubaria o fluxo de criação de transação no meio, porque
    // a categoria nova nasce dentro dele. O contrato é `false` = não criou.
    expect(src).toMatch(/guardQuota\('category', 1\)/);
    expect(src).toMatch(/guardQuota\('category', 1\)\)\s*\{\s*\n\s*return false;/);
  });
});
