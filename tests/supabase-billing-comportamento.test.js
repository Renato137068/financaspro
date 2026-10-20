/**
 * supabase-billing-comportamento.test.js — o cliente de cobrança no Supabase.
 *
 * O supabase-billing.test.js confere o formato. Aqui o que vale é o que a
 * pessoa sente: sem login a cobrança não anda, erro do servidor vira mensagem
 * que faz sentido, a organização certa é a do dono, convite expira em 7 dias e
 * o e-mail é gravado em minúsculas. Banco e funções são dublês que registram
 * o que foi pedido.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ARQUIVO = path.join(__dirname, '..', 'js', 'core', 'supabase-billing.js');

/** Construtor de consulta falsa: encadeia e resolve com o resultado dado. */
function consulta(resultado, registro, tabela) {
  const q = {};
  ['select', 'eq', 'is', 'gt', 'order', 'insert', 'delete', 'maybeSingle', 'single'].forEach(function(m) {
    q[m] = function() { registro.push({ tabela: tabela, metodo: m, args: Array.from(arguments) }); return q; };
  });
  q.then = function(ok, falha) { return Promise.resolve(resultado).then(ok, falha); };
  return q;
}

function carregar(opts) {
  opts = opts || {};
  const registro = [];
  const fetchChamadas = [];
  const SB = {
    from: function(tabela) {
      const r = (opts.tabelas && opts.tabelas[tabela]) || { data: [], error: null };
      return consulta(r, registro, tabela);
    },
    rpc: function(nome, args) {
      registro.push({ rpc: nome, args: args });
      return Promise.resolve(opts.rpc || { data: null, error: null });
    },
  };
  const ctx = vm.createContext({
    window: {},
    CONFIG: { SUPABASE_URL: 'https://test.supabase.co/', SUPABASE_ANON_KEY: 'anon' },
    DADOS: {
      _supabaseAtivo: function() { return true; },
      getConfig: function() { return opts.config || { nome: 'Usuário' }; },
    },
    SUPA_AUTH: {
      getSessionSync: function() { return opts.sessao === undefined ? { user: { id: 'u1' } } : opts.sessao; },
      getAccessToken: function() { return Promise.resolve(opts.token === undefined ? 'jwt' : opts.token); },
    },
    UTILS: { gerarUuid: function() { return opts.uuid || 'abcdef12-0000-4000-8000-000000000000'; } },
    fetch: function(url, init) {
      fetchChamadas.push({ url: url, init: init });
      return Promise.resolve(opts.resposta || { ok: true, status: 200, json: function() { return Promise.resolve({}); } });
    },
    Date: Date,
    Promise: Promise,
    JSON: JSON,
    Error: Error,
    String: String,
    Number: Number,
    Array: Array,
    Object: Object,
    Math: Math,
    console: console,
  });
  ctx.window.SB = SB;
  ctx.window.SUPA_AUTH = ctx.SUPA_AUTH;
  vm.runInContext(fs.readFileSync(ARQUIVO, 'utf8'), ctx, { filename: ARQUIVO });
  return { B: ctx.window.SUPA_BILLING, registro: registro, fetch: fetchChamadas };
}

describe('SUPA_BILLING.invoke — a chamada às Edge Functions', function() {
  test('sem sessão, não chama o servidor e responde 401', async function() {
    const { B, fetch } = carregar({ token: null });
    await expect(B.invoke('stripe-portal')).rejects.toMatchObject({ message: 'nao-autenticado', status: 401 });
    expect(fetch).toHaveLength(0);
  });

  test('manda o token, a chave anon e a URL sem barra duplicada', async function() {
    const { B, fetch } = carregar();
    await B.invoke('stripe-cancel', { orgId: 'o1' });
    expect(fetch[0].url).toBe('https://test.supabase.co/functions/v1/stripe-cancel');
    expect(fetch[0].init.headers.Authorization).toBe('Bearer jwt');
    expect(fetch[0].init.headers.apikey).toBe('anon');
    expect(JSON.parse(fetch[0].init.body)).toEqual({ orgId: 'o1' });
  });

  test('erro do servidor vira mensagem e status', async function() {
    const { B } = carregar({
      resposta: { ok: false, status: 402, json: function() { return Promise.resolve({ error: 'limite-membros' }); } },
    });
    await expect(B.invoke('org-invite')).rejects.toMatchObject({ message: 'limite-membros', status: 402 });
  });

  test('erro sem corpo legível cai na mensagem genérica', async function() {
    const { B } = carregar({
      resposta: { ok: false, status: 500, json: function() { return Promise.reject(new Error('html')); } },
    });
    await expect(B.invoke('stripe-webhook')).rejects.toMatchObject({ message: 'erro-nuvem', status: 500 });
  });

  test('sucesso devolve o campo data, ou o corpo inteiro se não houver', async function() {
    const comData = carregar({
      resposta: { ok: true, status: 200, json: function() { return Promise.resolve({ data: { url: 'https://pagamento' } }); } },
    });
    expect(await comData.B.invoke('stripe-portal')).toEqual({ url: 'https://pagamento' });
    const semData = carregar({
      resposta: { ok: true, status: 200, json: function() { return Promise.resolve({ ok: 1 }); } },
    });
    expect(await semData.B.invoke('stripe-portal')).toEqual({ ok: 1 });
  });
});

describe('SUPA_BILLING — leitura de planos e assinatura', function() {
  test('features chegam como texto JSON e viram lista; texto inválido vira lista vazia', async function() {
    const { B } = carregar({
      tabelas: {
        Plan: {
          data: [
            { id: 'p1', tier: 'PRO', name: 'Pro', priceMonthly: '16.99', priceYearly: '129.99', features: '["a","b"]' },
            { id: 'p2', tier: 'BUSINESS', name: 'Business', priceMonthly: '79.9', priceYearly: '799', features: '{quebrado' },
          ],
          error: null,
        },
      },
    });
    const planos = await B.listPlans();
    expect(planos[0]).toMatchObject({ tier: 'PRO', priceMonthly: 16.99, features: ['a', 'b'] });
    expect(planos[1].features).toEqual([]);
  });

  test('erro ao listar planos aparece para quem chamou', async function() {
    const { B } = carregar({ tabelas: { Plan: { data: null, error: { message: 'sem rede' } } } });
    await expect(B.listPlans()).rejects.toMatchObject({ message: 'sem rede' });
  });

  test('assinatura ausente vira null; cancelAtPeriodEnd é booleano', async function() {
    const vazio = carregar({ tabelas: { Subscription: { data: null, error: null } } });
    expect(await vazio.B.fetchSubscription('o1')).toBeNull();
    const cheia = carregar({
      tabelas: {
        Subscription: {
          data: { id: 's1', orgId: 'o1', status: 'ACTIVE', cancelAtPeriodEnd: 1, plan: { tier: 'PRO', priceMonthly: '16.99' } },
          error: null,
        },
      },
    });
    const s = await cheia.B.fetchSubscription('o1');
    expect(s.cancelAtPeriodEnd).toBe(true);
    expect(s.plan).toMatchObject({ tier: 'PRO', priceMonthly: 16.99 });
  });
});

describe('SUPA_BILLING.ensureOrg — a organização do usuário', function() {
  test('sem login, recusa sem consultar o banco', async function() {
    const { B, registro } = carregar({ sessao: null });
    await expect(B.ensureOrg()).rejects.toThrow('nao-autenticado');
    expect(registro).toHaveLength(0);
  });

  test('com várias organizações, escolhe a em que a pessoa é dona', async function() {
    const { B } = carregar({
      tabelas: {
        OrganizationMember: {
          data: [{ orgId: 'org-membro', role: 'MEMBER' }, { orgId: 'org-dona', role: 'OWNER' }],
          error: null,
        },
      },
    });
    expect(await B.ensureOrg()).toBe('org-dona');
  });

  test('sem organização, cria uma com o nome do app e slug sem acento', async function() {
    const { B, registro } = carregar({
      config: { nome: 'Renato Ângelo' },
      tabelas: { OrganizationMember: { data: [], error: null }, Organization: { data: null, error: null } },
    });
    const id = await B.ensureOrg();
    expect(id).toBe('abcdef12-0000-4000-8000-000000000000');
    const insert = registro.find(function(r) { return r.tabela === 'Organization' && r.metodo === 'insert'; });
    expect(insert.args[0]).toMatchObject({ name: 'Renato Ângelo', ownerId: 'u1', slug: 'renato-angelo-abcdef12' });
  });

  test('nome genérico do cadastro cai no padrão "Minha Finanças"', async function() {
    const { B, registro } = carregar({
      config: { nome: 'Usuário' },
      tabelas: { OrganizationMember: { data: [], error: null }, Organization: { data: null, error: null } },
    });
    await B.ensureOrg();
    const insert = registro.find(function(r) { return r.tabela === 'Organization' && r.metodo === 'insert'; });
    expect(insert.args[0].name).toBe('Minha Finanças');
  });

  test('falha ao criar a organização não devolve id', async function() {
    const { B } = carregar({
      tabelas: { OrganizationMember: { data: [], error: null }, Organization: { data: null, error: { message: 'negado' } } },
    });
    await expect(B.ensureOrg()).rejects.toMatchObject({ message: 'negado' });
  });
});

describe('SUPA_BILLING — convites e membros', function() {
  test('convite: e-mail em minúsculas, papel padrão MEMBER, validade de 7 dias', async function() {
    const { B, registro } = carregar({ tabelas: { Invitation: { data: { id: 'i1', email: 'ana@x.com' }, error: null } } });
    const antes = Date.now();
    await B.inviteMember('o1', '  Ana@X.COM ', '');
    const insert = registro.find(function(r) { return r.tabela === 'Invitation' && r.metodo === 'insert'; });
    expect(insert.args[0]).toMatchObject({ orgId: 'o1', email: 'ana@x.com', role: 'MEMBER' });
    const dias = (Date.parse(insert.args[0].expiresAt) - antes) / 86400000;
    expect(dias).toBeGreaterThan(6.9);
    expect(dias).toBeLessThan(7.1);
  });

  test.each([
    ['convite-email-diferente', 'Este convite não é para a conta logada.'],
    ['convite-expirado', 'Convite expirado.'],
    ['convite-ja-usado', 'Convite já utilizado.'],
    ['limite-membros', 'A organização atingiu o limite de membros do plano.'],
    ['nao-autenticado', 'Faça login para aceitar o convite.'],
    ['convite-invalido', 'Convite inválido ou indisponível.'],
  ])('aceitar convite: "%s" vira mensagem para a pessoa', async function(erro, esperado) {
    const { B } = carregar({ rpc: { data: null, error: { message: erro } } });
    await expect(B.acceptInvitation('tok')).rejects.toMatchObject({ message: esperado, status: 400 });
  });

  test('aceitar convite com sucesso devolve o resultado do servidor', async function() {
    const { B, registro } = carregar({ rpc: { data: { orgId: 'o1' }, error: null } });
    expect(await B.acceptInvitation('  tok  ')).toEqual({ orgId: 'o1' });
    expect(registro).toContainEqual({ rpc: 'fp_accept_org_invitation', args: { p_token: 'tok' } });
  });

  test('revogar e remover membro: erro do banco é repassado; sucesso devolve true', async function() {
    const erro = carregar({ tabelas: { Invitation: { data: null, error: { message: 'x' } }, OrganizationMember: { data: null, error: { message: 'y' } } } });
    await expect(erro.B.revokeInvitation('o1', 'i1')).rejects.toMatchObject({ message: 'x' });
    await expect(erro.B.removeMember('o1', 'u2')).rejects.toMatchObject({ message: 'y' });
    const ok = carregar();
    expect(await ok.B.revokeInvitation('o1', 'i1')).toBe(true);
    expect(await ok.B.removeMember('o1', 'u2')).toBe(true);
  });

  test('listar convites só traz os não aceitos e ainda válidos', async function() {
    const { B, registro } = carregar();
    await B.listInvitations('o1');
    const metodos = registro.filter(function(r) { return r.tabela === 'Invitation'; }).map(function(r) { return r.metodo; });
    expect(metodos).toEqual(['select', 'eq', 'is', 'gt', 'order']);
    expect(registro.find(function(r) { return r.metodo === 'is'; }).args).toEqual(['acceptedAt', null]);
  });
});
