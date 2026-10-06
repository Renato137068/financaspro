/**
 * init-billing-acoes.test.js — o que os botões do paywall e da equipe fazem.
 * @jest-environment jsdom
 *
 * Assinar, reativar, restaurar compras, cancelar e o portal decidem entre
 * Google Play e Stripe, e cada caminho tem um toast e um estado de botão que o
 * usuário vê. A equipe lista membros e convites e chama a cobrança para
 * convidar, revogar e remover. Aqui cada ação roda com a cobrança falsa, sem
 * subir o app inteiro (o paywall completo está em app-paywall.test.js).
 */
const { carregarScript } = require('./helpers/carregar-script.cjs');

let toasts;
let billing;
let play;
let modais;
let dados;
let funil;
const utilsFalso = {
  mostrarToast: (msg, tipo) => toasts.push({ msg, tipo }),
  escapeHtml: (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
};
const via = (get) => new Proxy({}, { get: (_a, k) => (get() || {})[k], has: (_a, k) => k in (get() || {}) });

const INIT_BILLING = carregarScript('js/modules/init-billing.js', {
  UTILS: utilsFalso,
  BILLING: via(() => billing),
  FUNIL: via(() => funil),
  PLAY_BILLING: via(() => play),
  INIT_MODALS: via(() => modais),
  DADOS: via(() => dados),
  mudarAba: undefined,
  _abrirAuthOverlay: undefined,
});

const esperar = () => new Promise((r) => setTimeout(r, 0));

/** Overlay mínimo com os botões que as ações procuram. */
function overlay(html) {
  const ov = document.createElement('div');
  ov.innerHTML = html || '';
  document.body.appendChild(ov);
  return ov;
}

beforeEach(() => {
  document.body.innerHTML = '';
  toasts = [];
  funil = { E: { CHECKOUT_INICIADO: 'checkout_iniciado' }, evento: jest.fn(), diasDeUso: () => 4 };
  billing = {
    isCloudUser: () => true,
    getTier: () => 'FREE',
    getBillingInterval: () => null,
    isPlayManaged: () => false,
    canUse: () => true,
    _cache: { subscription: null },
  };
  play = { isAvailable: () => false };
  modais = {};
  dados = {};
  INIT_BILLING._interval = 'monthly';
  jest.spyOn(INIT_BILLING, '_renderPlans').mockImplementation(() => {});
  jest.spyOn(INIT_BILLING, 'refreshPlanoCard').mockImplementation(() => {});
  delete global.INIT_CONFIG;
});

afterEach(() => {
  jest.restoreAllMocks();
  INIT_BILLING._fecharEquipe();
});

describe('_assinar', () => {
  test('sem login na nuvem: abre o login em vez de cobrar', () => {
    billing.isCloudUser = () => false;
    billing.checkoutOrSubscribe = jest.fn();
    const overlayAuth = overlay('<div id="auth-overlay" style="display:none"></div>');
    INIT_BILLING._assinar('PRO', overlayAuth);
    expect(billing.checkoutOrSubscribe).not.toHaveBeenCalled();
    expect(document.getElementById('auth-overlay').style.display).toBe('flex');
  });

  test('FREE ou sem plano: não faz nada', () => {
    billing.checkoutOrSubscribe = jest.fn();
    INIT_BILLING._assinar('FREE', overlay());
    INIT_BILLING._assinar('', overlay());
    expect(billing.checkoutOrSubscribe).not.toHaveBeenCalled();
    expect(funil.evento).not.toHaveBeenCalled();
  });

  test('Play: compra o produto do intervalo escolhido e marca o funil', async () => {
    play = {
      isAvailable: () => true,
      productIdForTier: (tier, int) => `${tier.toLowerCase()}_${int}`,
      purchase: jest.fn(() => Promise.resolve()),
    };
    INIT_BILLING._interval = 'yearly';
    const ov = overlay('<button data-tier="PRO">Assinar</button><div id="billing-footer"></div>');
    INIT_BILLING._assinar('PRO', ov);
    expect(ov.querySelector('[data-tier="PRO"]').disabled).toBe(true);
    expect(funil.evento).toHaveBeenCalledWith('checkout_iniciado', { tierAlvo: 'PRO', intervalo: 'yearly', dia: 4 });
    await esperar();
    expect(play.purchase).toHaveBeenCalledWith('pro_yearly', null);
    expect(toasts).toEqual([{ msg: 'Assinatura atualizada', tipo: 'success' }]);
    expect(INIT_BILLING.refreshPlanoCard).toHaveBeenCalled();
  });

  test('Play, troca de mensal para anual no mesmo plano: passa o produto antigo', async () => {
    play = {
      isAvailable: () => true,
      productIdForTier: (tier, int) => `${tier.toLowerCase()}_${int}`,
      purchase: jest.fn(() => Promise.resolve()),
    };
    billing.getTier = () => 'PRO';
    billing.getBillingInterval = () => 'monthly';
    INIT_BILLING._interval = 'yearly';
    INIT_BILLING._assinar('PRO', overlay('<div id="billing-footer"></div>'));
    await esperar();
    expect(play.purchase).toHaveBeenCalledWith('pro_yearly', { oldProductId: 'pro_monthly' });
  });

  test('Play sem produto para o plano: avisa e devolve o botão', () => {
    play = { isAvailable: () => true, productIdForTier: () => null, purchase: jest.fn() };
    const ov = overlay('<button data-tier="PRO">Assinar</button>');
    INIT_BILLING._assinar('PRO', ov);
    expect(play.purchase).not.toHaveBeenCalled();
    expect(toasts).toEqual([{ msg: 'Plano indisponível no Google Play', tipo: 'error' }]);
    const btn = ov.querySelector('[data-tier="PRO"]');
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toBe('Assinar');
  });

  test('Stripe com redirecionamento: não mostra sucesso antes da volta', async () => {
    billing.checkoutOrSubscribe = jest.fn(() => Promise.resolve({ redirected: true }));
    INIT_BILLING._assinar('PRO', overlay());
    await esperar();
    expect(billing.checkoutOrSubscribe).toHaveBeenCalledWith('PRO', 'monthly');
    expect(toasts).toEqual([]);
  });

  test('Stripe sem redirecionamento: atualiza a tela', async () => {
    billing.checkoutOrSubscribe = jest.fn(() => Promise.resolve({}));
    global.INIT_CONFIG = { refreshPerfil: jest.fn() };
    INIT_BILLING._assinar('PRO', overlay('<div id="billing-footer"></div>'));
    await esperar();
    expect(toasts).toEqual([{ msg: 'Assinatura atualizada', tipo: 'success' }]);
    expect(global.INIT_CONFIG.refreshPerfil).toHaveBeenCalled();
  });

  test('Stripe com erro: mostra a mensagem e libera o botão', async () => {
    billing.checkoutOrSubscribe = jest.fn(() => Promise.reject(new Error('cartão recusado')));
    const ov = overlay('<button data-tier="PRO">Assinar</button>');
    INIT_BILLING._assinar('PRO', ov);
    await esperar();
    expect(toasts).toEqual([{ msg: 'cartão recusado', tipo: 'error' }]);
    expect(ov.querySelector('[data-tier="PRO"]').disabled).toBe(false);
  });
});

describe('_reativar', () => {
  test('assinatura da Play: manda para a Play e não chama o servidor', () => {
    billing.isPlayManaged = () => true;
    billing._openPlaySubscriptions = jest.fn();
    billing.resumeSubscription = jest.fn();
    const ov = overlay('<button data-action="billing-reativar">Reativar assinatura</button>');
    INIT_BILLING._reativar(ov);
    expect(billing._openPlaySubscriptions).toHaveBeenCalled();
    expect(billing.resumeSubscription).not.toHaveBeenCalled();
    expect(toasts).toEqual([{ msg: 'Na Play Store, toque em Reativar na assinatura Pro.', tipo: 'info' }]);
    expect(ov.querySelector('button').disabled).toBe(false);
  });

  test('Play sem atalho próprio: abre a página de assinaturas da Play', () => {
    billing.isPlayManaged = () => true;
    const abrir = jest.spyOn(window, 'open').mockImplementation(() => null);
    INIT_BILLING._reativar(null);
    expect(abrir).toHaveBeenCalledWith(
      'https://play.google.com/store/account/subscriptions?package=com.financaspro.mobile', '_blank');
  });

  test('Stripe com retomada: reativa e redesenha', async () => {
    billing.resumeSubscription = jest.fn(() => Promise.resolve());
    INIT_BILLING._reativar(overlay('<div id="billing-footer"></div>'));
    await esperar();
    expect(toasts).toEqual([{ msg: 'Assinatura reativada — a renovação continua.', tipo: 'success' }]);
    expect(INIT_BILLING._renderPlans).toHaveBeenCalled();
  });

  test('Stripe sem retomada: cai no portal', async () => {
    billing.openPortal = jest.fn(() => Promise.resolve());
    INIT_BILLING._reativar(null);
    await esperar();
    expect(billing.openPortal).toHaveBeenCalled();
    expect(toasts).toEqual([{ msg: 'Abra o portal e confirme a renovação.', tipo: 'success' }]);
  });

  test('falha: avisa e devolve o botão', async () => {
    billing.resumeSubscription = jest.fn(() => Promise.reject(new Error('sem rede')));
    const ov = overlay('<button data-action="billing-reativar">Reativar assinatura</button>');
    INIT_BILLING._reativar(ov);
    expect(ov.querySelector('button').textContent).toBe('Abrindo…');
    await esperar();
    expect(toasts).toEqual([{ msg: 'sem rede', tipo: 'error' }]);
    expect(ov.querySelector('button').textContent).toBe('Reativar assinatura');
  });

  test('sem login: abre o login', () => {
    billing.isCloudUser = () => false;
    billing.resumeSubscription = jest.fn();
    INIT_BILLING._reativar(null);
    expect(billing.resumeSubscription).not.toHaveBeenCalled();
  });
});

describe('_restaurarPlay', () => {
  beforeEach(() => {
    play = { isAvailable: () => true, restore: jest.fn() };
  });

  test('nenhuma compra: diz que não achou', async () => {
    play.restore.mockResolvedValue([]);
    INIT_BILLING._restaurarPlay(overlay());
    await esperar();
    expect(toasts).toEqual([{ msg: 'Nenhuma compra encontrada nesta conta Google.', tipo: 'info' }]);
  });

  test('uma ou várias compras: conta no singular e no plural', async () => {
    play.restore.mockResolvedValueOnce([{}]).mockResolvedValueOnce([{}, {}]);
    INIT_BILLING._restaurarPlay(overlay());
    await esperar();
    INIT_BILLING._restaurarPlay(overlay());
    await esperar();
    expect(toasts.map((t) => t.msg)).toEqual(['Compra restaurada', '2 compras restauradas']);
    expect(INIT_BILLING.refreshPlanoCard).toHaveBeenCalledTimes(2);
  });

  test('erro da Play: mostra a mensagem', async () => {
    play.restore.mockRejectedValue(new Error('Play fora do ar'));
    INIT_BILLING._restaurarPlay(overlay());
    await esperar();
    expect(toasts).toEqual([{ msg: 'Play fora do ar', tipo: 'info' }]);
  });

  test('fora do Android: não faz nada', () => {
    play = { isAvailable: () => false, restore: jest.fn() };
    INIT_BILLING._restaurarPlay(overlay());
    expect(play.restore).not.toHaveBeenCalled();
  });
});

describe('portal e cancelamento', () => {
  test('portal indisponível: avisa', async () => {
    billing.openPortal = jest.fn(() => Promise.reject(new Error('')));
    INIT_BILLING._portal();
    await esperar();
    expect(toasts).toEqual([{ msg: 'Portal indisponível', tipo: 'error' }]);
  });

  test('cancelar pede confirmação no modal do app antes de cancelar', async () => {
    let confirmar;
    modais = { confirm: jest.fn((_msg, cb) => { confirmar = cb; }) };
    billing.cancelSubscription = jest.fn(() => Promise.resolve());
    INIT_BILLING._cancelar(overlay('<div id="billing-footer"></div>'));
    expect(billing.cancelSubscription).not.toHaveBeenCalled();
    confirmar();
    await esperar();
    expect(toasts).toEqual([{
      msg: 'Cancelado. Você continua no Pro até o fim do período, e seus dados ficam aqui depois disso.',
      tipo: 'info',
    }]);
  });

  test('cancelar sem modal do app: usa o confirm do navegador', () => {
    jest.spyOn(window, 'confirm').mockReturnValue(false);
    billing.cancelSubscription = jest.fn(() => Promise.resolve());
    INIT_BILLING._cancelar(overlay());
    expect(window.confirm).toHaveBeenCalled();
    expect(billing.cancelSubscription).not.toHaveBeenCalled();
  });

  test('cancelar na Play: orienta a gerenciar pela Play', async () => {
    play = { isAvailable: () => true };
    billing.cancelSubscription = jest.fn(() => Promise.resolve());
    INIT_BILLING._doCancel(overlay('<div id="billing-footer"></div>'));
    await esperar();
    expect(toasts).toEqual([{ msg: 'Abra o Google Play para gerenciar ou cancelar a assinatura.', tipo: 'info' }]);
  });

  test('falha ao cancelar: avisa', async () => {
    billing.cancelSubscription = jest.fn(() => Promise.reject(new Error('')));
    INIT_BILLING._doCancel(overlay());
    await esperar();
    expect(toasts).toEqual([{ msg: 'Falha ao cancelar', tipo: 'error' }]);
  });
});

describe('_renderFooter', () => {
  const rodape = () => overlay('<div id="billing-footer"></div>');

  test('sem conta: pede para entrar, sem botão de cancelar', () => {
    billing.isCloudUser = () => false;
    const ov = rodape();
    INIT_BILLING._renderFooter(ov);
    expect(ov.querySelector('[data-action="billing-login"]')).not.toBeNull();
    expect(ov.querySelector('[data-action="billing-cancelar"]')).toBeNull();
  });

  test('Play com Pro ativo: restaurar e cancelar', () => {
    play = { isAvailable: () => true };
    billing.TRIAL_DAYS = 7;
    billing._cache.subscription = { plan: { tier: 'PRO' }, cancelAtPeriodEnd: false };
    const ov = rodape();
    INIT_BILLING._renderFooter(ov);
    expect(ov.textContent).toContain('Pagamento via Google Play. Trial de 7 dias no Pro.');
    expect(ov.querySelector('[data-action="billing-restaurar"]')).not.toBeNull();
    expect(ov.querySelector('[data-action="billing-cancelar"]')).not.toBeNull();
  });

  test('Stripe na web: portal para quem já tem cliente Stripe', () => {
    dados = { _supabaseAtivo: () => true };
    global.SUPA_BILLING = { isActive: () => true };
    billing._cache.subscription = { stripeCustomerId: 'cus_1', plan: { tier: 'PRO' } };
    const ov = rodape();
    INIT_BILLING._renderFooter(ov);
    delete global.SUPA_BILLING;
    expect(ov.textContent).toContain('Stripe Checkout');
    expect(ov.querySelector('[data-action="billing-portal"]')).not.toBeNull();
  });

  test('cancelamento agendado: mostra até quando vale o Pro', () => {
    billing._cache.subscription = {
      plan: { tier: 'PRO' }, cancelAtPeriodEnd: true, currentPeriodEnd: '2026-11-05T12:00:00Z',
    };
    const ov = rodape();
    INIT_BILLING._renderFooter(ov);
    expect(ov.querySelector('.billing-cancel-pending').textContent)
      .toBe('Cancelamento agendado — Pro até 05/11/2026. Reative acima para continuar renovando.');
  });

  test('navegador sem cobrança na web: explica que o Pro é pela Play', () => {
    const ov = rodape();
    INIT_BILLING._renderFooter(ov);
    expect(ov.textContent).toContain('Assinatura Pro no app Android via Google Play');
  });
});

describe('equipe', () => {
  function equipeFalsa(extra) {
    Object.assign(billing, {
      getLimits: () => ({ maxUsers: 2 }),
      getTier: () => 'PRO',
      inviteShareUrl: (t) => 'https://app.financaspro.com/?invite=' + t,
      listTeam: jest.fn(() => Promise.resolve({
        members: [
          { userId: 'u-eu', role: 'OWNER' },
          { userId: 'u-outro-123456789', role: 'MEMBER' },
        ],
        invitations: [{ id: 'inv-1', email: 'ana@exemplo.com', token: 'tok1' }],
      })),
    }, extra);
    global.SUPA_AUTH = { getSessionSync: () => ({ user: { id: 'u-eu' } }) };
  }
  afterEach(() => { delete global.SUPA_AUTH; });

  test('nuvem desligada: não abre', () => {
    dados = { _nuvemAtiva: () => false };
    INIT_BILLING.abrirEquipe();
    expect(document.querySelector('.equipe-modal')).toBeNull();
  });

  test('sem login: avisa e abre o login', () => {
    billing.isCloudUser = () => false;
    INIT_BILLING.abrirEquipe();
    expect(toasts).toEqual([{ msg: 'Faça login na nuvem para gerenciar a equipe.', tipo: 'info' }]);
    expect(document.querySelector('.equipe-modal')).toBeNull();
  });

  test('plano sem equipe: abre o paywall com o motivo', () => {
    billing.canUse = (f) => f !== 'teamFeatures';
    const paywall = jest.spyOn(INIT_BILLING, 'abrirPaywall').mockImplementation(() => {});
    INIT_BILLING.abrirEquipe();
    expect(paywall).toHaveBeenCalledWith('Convide alguém da família ou do time a partir do plano Pro.');
  });

  test('lista você, o outro membro (com Remover) e o convite pendente', async () => {
    equipeFalsa();
    INIT_BILLING.abrirEquipe();
    await esperar();
    const ov = document.querySelector('.billing-overlay');
    expect(ov.querySelector('#equipe-lead').textContent).toBe('Plano atual: PRO · até 2 membros.');
    const nomes = [...ov.querySelectorAll('.equipe-item-name')].map((n) => n.textContent);
    expect(nomes).toEqual(['Você', 'Membro u-outro-', 'ana@exemplo.com pendente']);
    expect(ov.querySelectorAll('[data-action="equipe-remover"]')).toHaveLength(1);
    expect(ov.querySelector('[data-action="equipe-copiar"]').getAttribute('data-url'))
      .toBe('https://app.financaspro.com/?invite=tok1');
  });

  test('sem ninguém: diz que só há você', async () => {
    equipeFalsa({ listTeam: () => Promise.resolve({}) });
    INIT_BILLING.abrirEquipe();
    await esperar();
    expect(document.querySelector('.billing-empty').textContent).toBe('Nenhum membro além de você ainda.');
  });

  test('erro ao carregar: mostra a mensagem no lugar da lista', async () => {
    equipeFalsa({ listTeam: () => Promise.reject(new Error('<b>falhou</b>')) });
    INIT_BILLING.abrirEquipe();
    await esperar();
    const vazio = document.querySelector('.billing-empty');
    expect(vazio.textContent).toBe('<b>falhou</b>');
    expect(vazio.querySelector('b')).toBeNull();
  });

  test('revogar e remover chamam a cobrança e redesenham', async () => {
    equipeFalsa({
      revokeInvite: jest.fn(() => Promise.resolve()),
      removeTeamMember: jest.fn(() => Promise.resolve()),
    });
    modais = { confirm: (_m, cb) => cb() };
    INIT_BILLING.abrirEquipe();
    await esperar();
    const ov = document.querySelector('.billing-overlay');
    ov.querySelector('[data-action="equipe-revogar"]').click();
    await esperar();
    ov.querySelector('[data-action="equipe-remover"]').click();
    await esperar();
    expect(billing.revokeInvite).toHaveBeenCalledWith('inv-1');
    expect(billing.removeTeamMember).toHaveBeenCalledWith('u-outro-123456789');
    expect(toasts.map((t) => t.msg)).toEqual(['Convite revogado', 'Membro removido']);
    expect(billing.listTeam).toHaveBeenCalledTimes(3);
  });

  test('falhas de revogar e remover viram aviso', async () => {
    equipeFalsa({
      revokeInvite: () => Promise.reject(new Error('')),
      removeTeamMember: () => Promise.reject(new Error('sem permissão')),
    });
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    INIT_BILLING.abrirEquipe();
    await esperar();
    const ov = document.querySelector('.billing-overlay');
    ov.querySelector('[data-action="equipe-revogar"]').click();
    ov.querySelector('[data-action="equipe-remover"]').click();
    await esperar();
    expect(toasts.map((t) => t.msg)).toEqual(['Falha ao revogar', 'sem permissão']);
  });

  test('convidar: cria o convite, copia o link e limpa o campo', async () => {
    const escrever = jest.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: escrever }, configurable: true });
    equipeFalsa({ inviteTeamMember: jest.fn(() => Promise.resolve({ token: 'tok2' })) });
    INIT_BILLING.abrirEquipe();
    await esperar();
    const ov = document.querySelector('.billing-overlay');
    ov.querySelector('#equipe-invite-email').value = 'bia@exemplo.com';
    ov.querySelector('#equipe-invite-form').dispatchEvent(new Event('submit', { cancelable: true }));
    expect(ov.querySelector('[data-action="equipe-convidar"]').disabled).toBe(true);
    await esperar();
    await esperar();
    expect(billing.inviteTeamMember).toHaveBeenCalledWith('bia@exemplo.com');
    expect(escrever).toHaveBeenCalledWith('https://app.financaspro.com/?invite=tok2');
    expect(toasts).toEqual([{ msg: 'Convite criado. Link copiado — envie para a pessoa.', tipo: 'success' }]);
    expect(ov.querySelector('#equipe-invite-email').value).toBe('');
    expect(ov.querySelector('[data-action="equipe-convidar"]').disabled).toBe(false);
  });

  test('convidar acima do limite: o paywall já avisou, sem toast de erro', async () => {
    equipeFalsa({ inviteTeamMember: () => Promise.reject(new Error('upgrade-necessario')) });
    INIT_BILLING.abrirEquipe();
    await esperar();
    INIT_BILLING._convidarEquipe(document.querySelector('.billing-overlay'));
    await esperar();
    expect(toasts).toEqual([]);
  });

  test('copiar o link do convite e fechar com Esc', async () => {
    const escrever = jest.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: escrever }, configurable: true });
    equipeFalsa();
    INIT_BILLING.abrirEquipe();
    await esperar();
    const ov = document.querySelector('.billing-overlay');
    ov.querySelector('[data-action="equipe-copiar"]').click();
    await esperar();
    expect(toasts).toEqual([{ msg: 'Link copiado', tipo: 'success' }]);
    ov.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('.billing-overlay')).toBeNull();
  });
});
