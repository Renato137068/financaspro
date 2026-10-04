/**
 * init-billing-retornos.test.js — volta do checkout e do convite de equipe.
 * @jest-environment jsdom
 *
 * O Stripe devolve o usuário com ?billing=success|cancel; o e-mail de convite
 * traz ?invite=<token>. O INIT_BILLING trata na chegada e limpa a URL (senão
 * um recarregar repetiria o toast e, no convite, a tentativa de aceite). Sem
 * login na nuvem o convite fica guardado para depois do login.
 */
const { carregarScript } = require('./helpers/carregar-script.cjs');

let toasts;
let billing;
let funil;
const utilsFalso = { mostrarToast: (msg, tipo) => toasts.push({ msg, tipo }), escapeHtml: (s) => String(s) };

const INIT_BILLING = carregarScript('js/modules/init-billing.js', {
  UTILS: utilsFalso,
  BILLING: new Proxy({}, { get: (_a, k) => billing[k], has: (_a, k) => k in billing }),
  FUNIL: new Proxy({}, { get: (_a, k) => funil[k] }),
  mudarAba: undefined, INIT_MODALS: undefined, _abrirAuthOverlay: undefined,
  DADOS: undefined, PLAY_BILLING: undefined,
});

function irPara(busca) {
  window.history.replaceState({}, '', '/' + busca);
}

const esperarMicrotarefas = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  toasts = [];
  funil = { E: { ASSINATURA_ATIVA: 'assinatura_ativa' }, marco: jest.fn(), diasDeUso: () => 3 };
  billing = {
    isCloudUser: () => true,
    sync: jest.fn(() => Promise.resolve()),
    acceptInvite: jest.fn(() => Promise.resolve()),
    canUse: () => true,
  };
  sessionStorage.clear();
  irPara('');
});

describe('volta do checkout (?billing=)', () => {
  test('success: sincroniza, marca o funil, avisa e limpa a URL (session_id junto)', async () => {
    irPara('?billing=success&session_id=cs_1&aba=config');
    INIT_BILLING._handleBillingReturn();
    await esperarMicrotarefas();

    expect(billing.sync).toHaveBeenCalledTimes(1);
    expect(funil.marco).toHaveBeenCalledWith('assinatura_ativa', { dia: 3 });
    expect(toasts).toEqual([{ msg: 'Pronto, você está no Pro.', tipo: 'success' }]);
    expect(window.location.search).toBe('?aba=config');
  });

  test('success com falha no sync: não promete o Pro, mas limpa a URL', async () => {
    billing.sync = jest.fn(() => Promise.reject(new Error('rede')));
    irPara('?billing=success');
    INIT_BILLING._handleBillingReturn();
    await esperarMicrotarefas();

    expect(toasts).toEqual([]);
    expect(window.location.search).toBe('');
  });

  test('cancel: avisa sem sincronizar', () => {
    irPara('?billing=cancel');
    INIT_BILLING._handleBillingReturn();

    expect(billing.sync).not.toHaveBeenCalled();
    expect(toasts).toEqual([{ msg: 'Checkout cancelado.', tipo: 'info' }]);
    expect(window.location.search).toBe('');
  });

  test('sem o parâmetro: não faz nada', () => {
    irPara('?aba=resumo');
    INIT_BILLING._handleBillingReturn();
    expect(toasts).toEqual([]);
    expect(window.location.search).toBe('?aba=resumo');
  });
});

describe('convite de equipe (?invite=)', () => {
  test('sem login na nuvem: guarda o convite para depois e limpa a URL', () => {
    billing.isCloudUser = () => false;
    irPara('?invite=tok-1');
    INIT_BILLING._handleInviteReturn();

    expect(billing.acceptInvite).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('fp-pending-invite')).toBe('tok-1');
    expect(toasts[0].tipo).toBe('info');
    expect(window.location.search).toBe('');
  });

  test('logado: aceita o convite e avisa', async () => {
    irPara('?invite=tok-2');
    INIT_BILLING._handleInviteReturn();
    await esperarMicrotarefas();

    expect(billing.acceptInvite).toHaveBeenCalledWith('tok-2');
    expect(toasts).toEqual([{ msg: 'Você entrou na organização.', tipo: 'success' }]);
    expect(window.location.search).toBe('');
  });

  test('logado, convite recusado pelo servidor: mostra o motivo', async () => {
    billing.acceptInvite = jest.fn(() => Promise.reject(new Error('Convite expirado')));
    irPara('?invite=tok-3');
    INIT_BILLING._handleInviteReturn();
    await esperarMicrotarefas();

    expect(toasts).toEqual([{ msg: 'Convite expirado', tipo: 'error' }]);
    expect(window.location.search).toBe('');
  });

  test('convite guardado é aceito depois do login, uma vez só', async () => {
    sessionStorage.setItem('fp-pending-invite', 'tok-4');
    INIT_BILLING._consumePendingInvite();
    await esperarMicrotarefas();
    INIT_BILLING._consumePendingInvite();

    expect(billing.acceptInvite).toHaveBeenCalledTimes(1);
    expect(billing.acceptInvite).toHaveBeenCalledWith('tok-4');
    expect(sessionStorage.getItem('fp-pending-invite')).toBeNull();
  });

  test('convite guardado continua guardado enquanto não há login', () => {
    billing.isCloudUser = () => false;
    sessionStorage.setItem('fp-pending-invite', 'tok-5');
    INIT_BILLING._consumePendingInvite();
    expect(billing.acceptInvite).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('fp-pending-invite')).toBe('tok-5');
  });
});

describe('botões de exportação', () => {
  beforeEach(() => {
    document.body.innerHTML =
      '<button data-action="exportar-excel" aria-disabled="true" class="perfil-card--disabled"></button>' +
      '<button data-action="exportar-pdf"></button>' +
      '<span id="extrato-meta-subtitle"></span>';
  });

  test('plano grátis: CSV sempre livre, PDF marcado como do Pro', () => {
    billing.canUse = (f) => f !== 'exportPdf';
    INIT_BILLING.refreshExportButtons();
    INIT_BILLING.refreshExtratoSubtitle();

    const csv = document.querySelector('[data-action="exportar-excel"]');
    const pdf = document.querySelector('[data-action="exportar-pdf"]');
    expect(csv.hasAttribute('aria-disabled')).toBe(false);
    expect(csv.classList.contains('perfil-card--disabled')).toBe(false);
    expect(pdf.getAttribute('aria-disabled')).toBe('true');
    expect(pdf.title).toMatch(/Pro/);
    expect(document.getElementById('extrato-meta-subtitle').textContent).toMatch(/PDF no Pro/);
  });

  test('Pro: PDF liberado', () => {
    INIT_BILLING.refreshExportButtons();
    INIT_BILLING.refreshExtratoSubtitle();

    const pdf = document.querySelector('[data-action="exportar-pdf"]');
    expect(pdf.hasAttribute('aria-disabled')).toBe(false);
    expect(pdf.hasAttribute('title')).toBe(false);
    expect(document.getElementById('extrato-meta-subtitle').textContent).toBe('Histórico, filtros e exportação');
  });
});
