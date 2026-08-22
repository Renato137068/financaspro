/**
 * open-finance.test.js — adapters de agregação bancária.
 *
 * Este é o único ponto do sistema onde dado financeiro entra vindo de fora.
 * O que precisa ser inegociável: sinal do valor determina receita/despesa,
 * valor importado é sempre positivo, e resposta malformada do provedor não
 * pode virar lançamento errado no extrato do usuário.
 */
import { jest } from '@jest/globals';

const SECRET_ID = 'belvo-id';
const SECRET_PASS = 'belvo-pass';

let belvo, index, sandbox;

/** Recarrega os módulos com uma configuração de ambiente específica. */
async function carregar({ configurado = true, env = 'sandbox', provider = 'belvo' } = {}) {
  jest.resetModules();
  if (configurado) {
    process.env.BELVO_SECRET_ID = SECRET_ID;
    process.env.BELVO_SECRET_PASSWORD = SECRET_PASS;
  } else {
    delete process.env.BELVO_SECRET_ID;
    delete process.env.BELVO_SECRET_PASSWORD;
  }
  process.env.BELVO_ENV = env;
  process.env.OPEN_FINANCE_PROVIDER = provider;

  belvo = await import('../../backend/lib/open-finance/belvo.js');
  index = await import('../../backend/lib/open-finance/index.js');
  sandbox = await import('../../backend/lib/open-finance/sandbox.js');
}

/** Substitui fetch por uma resposta controlada. */
function mockFetch(resposta) {
  global.fetch = jest.fn(async () => resposta);
  return global.fetch;
}

const okJson = body => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
const erro = (status, texto) => ({ ok: false, status, json: async () => ({}), text: async () => texto });

afterAll(() => {
  delete process.env.BELVO_SECRET_ID;
  delete process.env.BELVO_SECRET_PASSWORD;
  delete process.env.BELVO_ENV;
  delete process.env.OPEN_FINANCE_PROVIDER;
});

// ─── configuração ────────────────────────────────────────────────────────────
describe('configuração do Belvo', () => {
  test('detecta credenciais presentes', async () => {
    await carregar({ configurado: true });
    expect(belvo.isBelvoConfigured()).toBe(true);
  });

  test('detecta credenciais ausentes', async () => {
    await carregar({ configurado: false });
    expect(belvo.isBelvoConfigured()).toBe(false);
  });

  test('ambiente sandbox aponta para a URL de sandbox', async () => {
    await carregar({ env: 'sandbox' });
    expect(belvo.getBelvoBaseUrl()).toBe('https://sandbox.belvo.com');
  });

  test('ambiente production aponta para a URL de produção', async () => {
    await carregar({ env: 'production' });
    expect(belvo.getBelvoBaseUrl()).toBe('https://api.belvo.com');
  });

  test('ambiente não reconhecido cai em sandbox (fail-safe)', async () => {
    // Errar para sandbox é seguro; errar para produção mexeria com dados reais.
    await carregar({ env: 'homologacao' });
    expect(belvo.getBelvoBaseUrl()).toBe('https://sandbox.belvo.com');
  });
});

// ─── token do widget ─────────────────────────────────────────────────────────
describe('createBelvoWidgetToken', () => {
  test('sem credenciais devolve 503 sem chamar a rede', async () => {
    await carregar({ configurado: false });
    const f = mockFetch(okJson({ access: 'x' }));

    await expect(belvo.createBelvoWidgetToken('user-1')).rejects.toMatchObject({ status: 503 });
    expect(f).not.toHaveBeenCalled();
  });

  test('envia Basic auth derivado das credenciais', async () => {
    await carregar();
    const f = mockFetch(okJson({ access: 'tok-1' }));

    await belvo.createBelvoWidgetToken('user-1');

    const [, init] = f.mock.calls[0];
    const esperado = 'Basic ' + Buffer.from(`${SECRET_ID}:${SECRET_PASS}`).toString('base64');
    expect(init.headers.Authorization).toBe(esperado);
  });

  test('pede apenas os escopos necessários', async () => {
    await carregar();
    const f = mockFetch(okJson({ access: 'tok-1' }));

    await belvo.createBelvoWidgetToken('user-1');
    const body = JSON.parse(f.mock.calls[0][1].body);

    expect(body.scopes).not.toMatch(/delete|admin/);
    expect(body.fetch_resources).toEqual(['ACCOUNTS', 'TRANSACTIONS']);
    expect(body.external_id).toBe('user-1');
  });

  test('erro HTTP do provedor vira 502 com trecho da causa', async () => {
    await carregar();
    mockFetch(erro(400, 'invalid credentials'));

    await expect(belvo.createBelvoWidgetToken('user-1')).rejects.toMatchObject({ status: 502 });
  });

  test('resposta 200 sem access token vira 502', async () => {
    // Falha silenciosa do provedor: 200 mas payload inútil.
    await carregar();
    mockFetch(okJson({ mensagem: 'ok' }));

    await expect(belvo.createBelvoWidgetToken('user-1')).rejects.toMatchObject({ status: 502 });
  });

  test('mensagem de erro é truncada — não vaza corpo inteiro do provedor', async () => {
    await carregar();
    mockFetch(erro(500, 'x'.repeat(5000)));

    const err = await belvo.createBelvoWidgetToken('user-1').catch(e => e);
    expect(err.message.length).toBeLessThan(300);
  });

  test('devolve access e URL do widget', async () => {
    await carregar();
    mockFetch(okJson({ access: 'tok-1' }));

    const out = await belvo.createBelvoWidgetToken('user-1');

    expect(out.access).toBe('tok-1');
    expect(out.widgetUrl).toContain('https://widget.belvo.io/?');
    expect(out.widgetUrl).toContain('access_token=tok-1');
  });
});

describe('buildBelvoWidgetUrl', () => {
  test('escapa parâmetros do usuário', async () => {
    await carregar();
    const url = belvo.buildBelvoWidgetUrl('tok&malicioso=1', 'user 1');

    expect(url).toContain('access_token=tok%26malicioso%3D1');
    expect(url).toContain('external_id=user+1');
  });

  test('força locale pt e país BR', async () => {
    await carregar();
    const url = belvo.buildBelvoWidgetUrl('t', 'u');

    expect(url).toContain('locale=pt');
    expect(url).toContain('country_codes=BR');
  });
});

// ─── remoção de link ─────────────────────────────────────────────────────────
describe('deleteBelvoLink', () => {
  test('sem credenciais não chama a rede', async () => {
    await carregar({ configurado: false });
    const f = mockFetch(okJson({}));

    await belvo.deleteBelvoLink('link-1');
    expect(f).not.toHaveBeenCalled();
  });

  test('sem linkId não chama a rede', async () => {
    await carregar();
    const f = mockFetch(okJson({}));

    await belvo.deleteBelvoLink(null);
    expect(f).not.toHaveBeenCalled();
  });

  test('usa DELETE com o id escapado', async () => {
    await carregar();
    const f = mockFetch(okJson({}));

    await belvo.deleteBelvoLink('link/../../admin');

    const [url, init] = f.mock.calls[0];
    expect(init.method).toBe('DELETE');
    expect(url).toContain(encodeURIComponent('link/../../admin'));
  });

  test('falha de rede não propaga — desconectar é best-effort', async () => {
    // O usuário já pediu para desconectar; falhar aqui só o deixaria preso.
    await carregar();
    global.fetch = jest.fn(async () => { throw new Error('rede fora'); });

    await expect(belvo.deleteBelvoLink('link-1')).resolves.toBeUndefined();
  });
});

// ─── importação de transações ────────────────────────────────────────────────
describe('fetchBelvoTransactions', () => {
  const linha = (over = {}) => ({
    id: 'tx-1', amount: -42.5, category: 'Food and drinks',
    value_date: '2026-08-01', description: 'Mercado', ...over,
  });

  test('sem credenciais devolve 503', async () => {
    await carregar({ configurado: false });
    await expect(belvo.fetchBelvoTransactions('link-1')).rejects.toMatchObject({ status: 503 });
  });

  test('erro HTTP vira 502', async () => {
    await carregar();
    mockFetch(erro(500, 'boom'));
    await expect(belvo.fetchBelvoTransactions('link-1')).rejects.toMatchObject({ status: 502 });
  });

  test('valor negativo vira despesa com valor positivo', async () => {
    await carregar();
    mockFetch(okJson([linha({ amount: -42.5 })]));

    const [tx] = await belvo.fetchBelvoTransactions('link-1');

    expect(tx.type).toBe('despesa');
    expect(tx.amount).toBe(42.5);   // sempre positivo no nosso domínio
  });

  test('valor positivo vira receita', async () => {
    await carregar();
    mockFetch(okJson([linha({ amount: 1200 })]));

    const [tx] = await belvo.fetchBelvoTransactions('link-1');

    expect(tx.type).toBe('receita');
    expect(tx.amount).toBe(1200);
  });

  test('aceita tanto array quanto payload paginado', async () => {
    await carregar();
    mockFetch(okJson({ results: [linha()] }));

    await expect(belvo.fetchBelvoTransactions('link-1')).resolves.toHaveLength(1);
  });

  test('descarta linhas sem data — sem data não há extrato', async () => {
    await carregar();
    mockFetch(okJson([linha({ value_date: null, accounting_date: null })]));

    await expect(belvo.fetchBelvoTransactions('link-1')).resolves.toEqual([]);
  });

  test('descarta valor zero', async () => {
    await carregar();
    mockFetch(okJson([linha({ amount: 0 })]));

    await expect(belvo.fetchBelvoTransactions('link-1')).resolves.toEqual([]);
  });

  test('valor não numérico não vira NaN no extrato', async () => {
    await carregar();
    mockFetch(okJson([linha({ amount: 'quarenta' })]));

    const out = await belvo.fetchBelvoTransactions('link-1');
    expect(out).toEqual([]);   // filtrado por amount > 0
  });

  test('cai para accounting_date quando value_date falta', async () => {
    await carregar();
    mockFetch(okJson([linha({ value_date: null, accounting_date: '2026-07-15T10:00:00Z' })]));

    const [tx] = await belvo.fetchBelvoTransactions('link-1');
    expect(tx.date).toBe('2026-07-15');
  });

  test('normaliza a data para YYYY-MM-DD', async () => {
    await carregar();
    mockFetch(okJson([linha({ value_date: '2026-08-01T23:59:59.999Z' })]));

    const [tx] = await belvo.fetchBelvoTransactions('link-1');
    expect(tx.date).toBe('2026-08-01');
  });

  test('usa o nome do estabelecimento quando não há descrição', async () => {
    await carregar();
    mockFetch(okJson([linha({ description: null, merchant: { name: 'Padaria Central' } })]));

    const [tx] = await belvo.fetchBelvoTransactions('link-1');
    expect(tx.description).toBe('Padaria Central');
  });

  test('sem descrição nem estabelecimento usa rótulo genérico', async () => {
    await carregar();
    mockFetch(okJson([linha({ description: null, merchant: null })]));

    const [tx] = await belvo.fetchBelvoTransactions('link-1');
    expect(tx.description).toBe('Belvo');
  });

  test('externalId vira string — base da deduplicação na importação', async () => {
    await carregar();
    mockFetch(okJson([linha({ id: 12345 })]));

    const [tx] = await belvo.fetchBelvoTransactions('link-1');
    expect(tx.externalId).toBe('12345');
  });

  test('categoria ausente cai em "outro"', async () => {
    await carregar();
    mockFetch(okJson([linha({ category: null })]));

    const [tx] = await belvo.fetchBelvoTransactions('link-1');
    expect(tx.category).toBe('outro');
  });

  test('payload inesperado não lança', async () => {
    await carregar();
    mockFetch(okJson({ mensagem: 'sem resultados' }));

    await expect(belvo.fetchBelvoTransactions('link-1')).resolves.toEqual([]);
  });
});

// ─── registry ────────────────────────────────────────────────────────────────
describe('registry de provedores', () => {
  test('resolve sandbox e belvo', async () => {
    await carregar();
    expect(index.getProvider('sandbox').fetchTransactions).toEqual(expect.any(Function));
    expect(index.getProvider('belvo').fetchTransactions).toEqual(expect.any(Function));
  });

  test('provedor desconhecido lança em vez de devolver undefined', async () => {
    await carregar();
    expect(() => index.getProvider('banco-inventado')).toThrow(/não suportado/);
  });

  test('belvo configurado é o provedor padrão', async () => {
    await carregar({ configurado: true, provider: 'belvo' });
    expect(index.getDefaultProviderName()).toBe('belvo');
  });

  test('belvo sem credenciais cai para sandbox em vez de quebrar', async () => {
    await carregar({ configurado: false, provider: 'belvo' });
    expect(index.getDefaultProviderName()).toBe('sandbox');
  });

  test('pluggy sem credenciais cai para sandbox', async () => {
    await carregar({ configurado: false, provider: 'pluggy' });
    expect(index.getDefaultProviderName()).toBe('sandbox');
  });
});

// ─── sandbox ─────────────────────────────────────────────────────────────────
describe('provedor sandbox', () => {
  test('devolve transações demo no mês corrente', async () => {
    await carregar();
    const out = sandbox.fetchSandboxTransactions({ bankName: 'Banco Teste' });

    const mesAtual = String(new Date().getMonth() + 1).padStart(2, '0');
    expect(out).toHaveLength(3);
    out.forEach(t => expect(t.date).toContain(`-${mesAtual}-`));
  });

  test('respeita a mesma forma do adapter real', async () => {
    await carregar();
    const [t] = sandbox.fetchSandboxTransactions({});

    expect(t).toEqual(expect.objectContaining({
      externalId: expect.any(String),
      type: expect.stringMatching(/^(receita|despesa)$/),
      amount: expect.any(Number),
      category: expect.any(String),
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      description: expect.any(String),
    }));
  });

  test('inclui receita e despesa — exercita os dois caminhos na importação', async () => {
    await carregar();
    const tipos = new Set(sandbox.fetchSandboxTransactions({}).map(t => t.type));
    expect(tipos).toEqual(new Set(['receita', 'despesa']));
  });

  test('sem nome de banco usa rótulo padrão', async () => {
    await carregar();
    const [t] = sandbox.fetchSandboxTransactions(undefined);
    expect(t.description).toContain('Banco Demo');
  });
});
