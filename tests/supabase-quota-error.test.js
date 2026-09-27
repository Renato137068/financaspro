/**
 * supabase-quota-error.test.js — contrato de erro QUOTA_EXCEEDED do PostgREST.
 *
 * A versão anterior reescrevia isQuotaExceededError aqui dentro. Uma cópia
 * envelhece calada: quando o SQL v3 passou a recusar metas, contas a pagar,
 * assinaturas e categorias, o teste continuou verde testando a lista antiga de
 * três tipos, enquanto o app mostrava "Limite de uso no plano gratuito" — uma
 * frase que não diz nada. Agora o teste roda o fonte de verdade, então um tipo
 * novo no SQL sem tratamento no cliente reprova aqui.
 *
 * O arquivo inteiro é carregado por carregarScript, e a detecção de cota é
 * exercitada pelo caminho real — um push que o PostgREST recusa. A versão
 * anterior recortava QUOTA_KINDS e a função do meio do arquivo e os rodava com
 * o filename de supabase-sync.js: a cobertura v8 é somada por posição de
 * caractere, então a execução do recorte caía sobre as primeiras linhas do
 * arquivo, não sobre as funções que de fato rodaram.
 */
const fs = require('fs');
const path = require('path');
const { carregarScript } = require('./carregar-script');

/** Tipos que o SQL sabe levantar — a fonte é o texto das migrations. */
function tiposNoSql() {
  const dir = path.join(__dirname, '..', 'supabase', 'migrations');
  const tipos = new Set();
  fs.readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .forEach((f) => {
      const sql = fs.readFileSync(path.join(dir, f), 'utf8');
      const achados = sql.match(/QUOTA_EXCEEDED:(\w+)/g) || [];
      achados.forEach((a) => tipos.add(a.split(':')[1]));
    });
  return [...tipos].sort();
}

// O que o próximo upsert do PostgREST devolve: { error } resolvido, ou uma
// rejeição crua (`throw null` de um cliente quebrado, por exemplo).
let resposta;
const SB = {
  from: () => ({
    upsert: () => (resposta.rejeita ? Promise.reject(resposta.valor) : Promise.resolve({ error: resposta.error })),
  }),
  auth: { onAuthStateChange: () => {} },
};

let SUPA_SYNC;
let avisos;

beforeAll(() => {
  // supabase-sync.js só se instala com o Supabase ativo e lê SB na carga.
  global.SB = SB;
  global.SUPA_AUTH = {
    isActive: () => true,
    getSessionSync: () => ({ user: { id: 'user-1' } }),
  };
  SUPA_SYNC = carregarScript('js/core/supabase-sync.js', { global: 'SUPA_SYNC' });
});

afterAll(() => {
  delete global.SB;
  delete global.SUPA_AUTH;
  delete global.SUPA_SYNC;
});

beforeEach(() => {
  avisos = [];
  global.BILLING = { onPaymentRequired: (p) => avisos.push(p.message) };
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  delete global.BILLING;
  delete global.UTILS;
  console.warn.mockRestore();
});

const TX = { id: 'tx-1', tipo: 'despesa', valor: 10 };

/** Faz um push que o PostgREST recusa com `error`; devolve o que ele resolveu. */
function pushRecusado(error) {
  resposta = { error };
  return SUPA_SYNC.pushTx(TX);
}

describe('Supabase quota errors', function() {
  test('detecta P0001 com mensagem QUOTA_EXCEEDED:transaction', async function() {
    expect(await pushRecusado({ code: 'P0001', message: 'QUOTA_EXCEEDED:transaction' })).toBe(TX);
    expect(avisos).toHaveLength(1);
    expect(console.warn).not.toHaveBeenCalled();
  });

  test('detecta mensagem em details', async function() {
    await pushRecusado({ details: 'QUOTA_EXCEEDED:account' });
    expect(avisos).toHaveLength(1);
  });

  test('ignora erro genérico de sync', async function() {
    expect(await pushRecusado({ code: '23505', message: 'duplicate key' })).toBe(TX);
    expect(avisos).toEqual([]);
    expect(console.warn).toHaveBeenCalledWith('Supabase push falhou:', 'duplicate key');
  });

  test('P0001 sem o marcador não é cota — o código é o de qualquer RAISE', async function() {
    await pushRecusado({ code: 'P0001', message: 'violação de regra de negócio' });
    expect(avisos).toEqual([]);
  });

  test('nulo e indefinido não são quota', async function() {
    for (const valor of [null, undefined]) {
      resposta = { rejeita: true, valor };
      expect(await SUPA_SYNC.pushTx(TX)).toBe(TX);
    }
    expect(avisos).toEqual([]);
    expect(console.warn).toHaveBeenCalledTimes(2);
  });

  test('todo tipo que o SQL levanta é reconhecido pelo cliente', async function() {
    const doSql = tiposNoSql();
    expect(doSql.length).toBeGreaterThanOrEqual(5);
    for (const kind of doSql) {
      avisos = [];
      // Sem o code P0001: aqui interessa a lista de tipos, não o atalho.
      await pushRecusado({ message: 'QUOTA_EXCEEDED:' + kind });
      expect([kind, avisos.length]).toEqual([kind, 1]);
    }
  });

  test('um tipo inventado não vira aviso de cota', async function() {
    await pushRecusado({ message: 'QUOTA_EXCEEDED:foguete' });
    expect(avisos).toEqual([]);
  });

  test('pushConta passa pelo mesmo tratamento', async function() {
    const conta = { id: 'c-1', nome: 'Carteira' };
    resposta = { error: { message: 'QUOTA_EXCEEDED:account' } };
    expect(await SUPA_SYNC.pushConta(conta)).toBe(conta);
    expect(avisos).toHaveLength(1);
  });
});

describe('Mensagem mostrada ao usuário', function() {
  test('prefere a copy do BILLING, que nomeia o que o Pro faz', async function() {
    global.BILLING._QUOTAS = { goal: { limite: 'maxGoals', msg: 'Você já tem %L metas. O Pro libera quantas quiser.' } };
    global.BILLING.getLimits = () => ({ maxGoals: 2 });
    await pushRecusado({ message: 'QUOTA_EXCEEDED:goal' });
    expect(avisos).toEqual(['Você já tem 2 metas. O Pro libera quantas quiser.']);
  });

  test('limite infinito no BILLING cai no plano B', async function() {
    global.BILLING._QUOTAS = { goal: { limite: 'maxGoals', msg: '%L metas' } };
    global.BILLING.getLimits = () => ({ maxGoals: Infinity });
    await pushRecusado({ message: 'QUOTA_EXCEEDED:goal' });
    expect(avisos).toEqual(['Limite de metas no plano gratuito. Assine o Pro para continuar.']);
  });

  test('o plano B cobre todos os tipos do SQL — nada cai em "uso"', async function() {
    for (const kind of tiposNoSql()) {
      avisos = [];
      await pushRecusado({ message: 'QUOTA_EXCEEDED:' + kind });
      expect([kind, avisos[0]]).toEqual([kind, expect.stringMatching(/^Limite de .+ no plano gratuito/)]);
      expect([kind, avisos[0]]).not.toEqual([kind, expect.stringContaining('Limite de uso')]);
    }
  });

  test('sem BILLING, o aviso sai como toast do UTILS', async function() {
    delete global.BILLING;
    global.UTILS = { mostrarToast: jest.fn() };
    await pushRecusado({ message: 'QUOTA_EXCEEDED:budget' });
    expect(global.UTILS.mostrarToast).toHaveBeenCalledWith(
      'Limite de orçamentos no plano gratuito. Assine o Pro para continuar.',
      'warning',
    );
  });
});
