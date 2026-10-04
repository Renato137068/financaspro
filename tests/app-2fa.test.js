/**
 * app-2fa.test.js — Perfil › Segurança › Verificação em duas etapas, com o app inteiro.
 * @jest-environment node
 *
 * Achado M2 da reauditoria de 30/09: a tela chega no chunk 'conta' e estava
 * em 33% — justo a que protege a conta. Aqui o app sobe na nuvem com um
 * Supabase falso que tem MFA de verdade em memória (tests/helpers/app-jsdom
 * com nuvem.mfa): cadastrar, verificar com código certo e errado, gerar os
 * códigos de recuperação e desativar.
 */
const { subirApp } = require('./helpers/app-jsdom.cjs');
const { gestos, tique } = require('./helpers/ui-app.cjs');

const CODIGO = '123456';
const SESSAO = {
  access_token: 'tok', refresh_token: 'ref',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: 'u-ana', email: 'ana@exemplo.com', user_metadata: {} },
};

let app;
afterEach(() => { if (app) app.fechar(); app = null; });

async function abrirSeguranca(nuvem) {
  app = await subirApp({ nuvem: { sessao: SESSAO, mfa: { codigo: CODIGO }, ...(nuvem || {}) } });
  const g = gestos(app);
  g.w.mudarAba('config-seguranca');
  await app.esperar(() => g.d.getElementById('chk-2fa'));
  await app.carregarChunkConta();
  await app.esperar(() => /Desativado|Ativo|Requer|Indisponível/.test(status(g)), 3000);
  return g;
}

const status = (g) => (g.d.getElementById('perfil-2fa-status') || {}).textContent || '';

function alternar(g, ligado) {
  const chk = g.d.getElementById('chk-2fa');
  chk.checked = ligado;
  chk.dispatchEvent(new g.w.Event('change', { bubbles: true }));
}

async function ativar(g, codigo) {
  alternar(g, true);
  await app.esperar(() => g.d.getElementById('totp-enable-code'));
  g.preencher('totp-enable-code', codigo);
  g.okModal();
  await tique(30);
}

test('logado na nuvem: o card aparece habilitado e começa desativado', async () => {
  const g = await abrirSeguranca();
  const card = g.d.getElementById('perfil-2fa-card');
  expect(card.hidden).toBe(false);
  expect(g.d.getElementById('chk-2fa').disabled).toBe(false);
  expect(status(g)).toBe('Desativado');
  expect(g.d.getElementById('perfil-recovery-card').hidden).toBe(true);
  expect(app.erros).toEqual([]);
});

test('ativar: mostra QR e segredo; código errado avisa e não ativa', async () => {
  const g = await abrirSeguranca();
  alternar(g, true);
  expect(g.d.getElementById('chk-2fa').checked).toBe(false); // só marca depois de confirmar
  await app.esperar(() => g.d.getElementById('totp-enable-code'));
  expect(g.d.querySelector('.totp-qr').getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
  expect(g.d.querySelector('.totp-secret').textContent).toBe('JBSWY3DPEHPK3PXP');
  expect(g.d.querySelector('.modal-overlay .modal-btn').textContent).toBe('Ativar');

  g.preencher('totp-enable-code', '000000');
  g.okModal();
  await tique(30);
  expect(g.toast()).toMatch(/Invalid TOTP|inválido/i);
  expect(g.modal()).not.toBeNull();
  expect(status(g)).toBe('Desativado');
});

test('ativar com o código certo: status muda, e os códigos de recuperação são entregues na hora', async () => {
  const g = await abrirSeguranca();
  await ativar(g, CODIGO);
  expect(g.toast()).toMatch(/Verificação em duas etapas ativada/);
  await app.esperar(() => status(g) === 'Ativo — app autenticador');
  expect(g.d.getElementById('chk-2fa').checked).toBe(true);

  // 400 ms depois de ativar, o modal com os códigos (mostrados uma vez só).
  await app.esperar(() => g.d.querySelector('.recovery-codes-list'), 2000);
  const codigos = [...g.d.querySelectorAll('.recovery-codes-list code')].map((c) => c.textContent);
  expect(codigos).toEqual(['aaaa-1111', 'bbbb-2222', 'cccc-3333', 'dddd-4444']);

  const copiados = [];
  Object.defineProperty(g.w.navigator, 'clipboard', { value: { writeText: (t) => { copiados.push(t); return Promise.resolve(); } }, configurable: true });
  g.clicar('#btn-recovery-copiar');
  await tique();
  expect(copiados[0]).toMatch(/códigos de recuperação[\s\S]*aaaa-1111[\s\S]*dddd-4444/);

  await app.esperar(() => /4 códigos restantes/.test(g.d.getElementById('perfil-recovery-status').textContent));
  expect(g.d.getElementById('perfil-recovery-card').hidden).toBe(false);
  expect(app.supabase.chamadas.map((c) => c.metodo)).toEqual(expect.arrayContaining(['mfa.enroll', 'mfa.challengeAndVerify', 'rpc']));
});

test('gerar novos códigos pede confirmação (invalida os antigos)', async () => {
  const g = await abrirSeguranca();
  await ativar(g, CODIGO);
  await app.esperar(() => g.d.querySelector('.recovery-codes-list'), 2000);
  g.okModal();
  await tique();
  const antes = app.supabase.chamadas.filter((c) => c.nome === 'fp_mfa_recovery_generate').length;
  g.clicar('#btn-recovery-gerar');
  await app.esperar(() => g.modal());
  expect(g.modal().textContent).toMatch(/invalida os anteriores/);
  g.cancelar();
  await tique();
  expect(app.supabase.chamadas.filter((c) => c.nome === 'fp_mfa_recovery_generate').length).toBe(antes);
  g.clicar('#btn-recovery-gerar');
  await app.esperar(() => g.modal());
  g.confirmar();
  await app.esperar(() => g.d.querySelector('.recovery-codes-list'));
  expect(app.supabase.chamadas.filter((c) => c.nome === 'fp_mfa_recovery_generate').length).toBe(antes + 1);
});

test('desativar exige o código atual; errado mantém ativo, certo desativa', async () => {
  const g = await abrirSeguranca();
  await ativar(g, CODIGO);
  await app.esperar(() => status(g) === 'Ativo — app autenticador');
  await app.esperar(() => g.d.querySelector('.recovery-codes-list'), 2000);
  g.okModal();
  await tique();

  alternar(g, false);
  expect(g.d.getElementById('chk-2fa').checked).toBe(true); // continua até confirmar
  await app.esperar(() => g.d.getElementById('totp-disable-code'));
  expect(g.d.getElementById('totp-disable-pass')).toBeNull(); // na nuvem não pede senha
  g.preencher('totp-disable-code', '999999');
  g.okModal();
  await tique(30);
  expect(status(g)).toBe('Ativo — app autenticador');

  g.preencher('totp-disable-code', CODIGO);
  g.okModal();
  await app.esperar(() => status(g) === 'Desativado');
  expect(g.toast()).toMatch(/2FA desativado/);
  expect(g.d.getElementById('perfil-recovery-card').hidden).toBe(true);
});

test('build local (sem nuvem): o card de 2FA some', async () => {
  app = await subirApp();
  const g = gestos(app);
  g.w.mudarAba('config-seguranca');
  await app.esperar(() => g.d.getElementById('chk-2fa'));
  await app.carregarChunkConta();
  await tique(30);
  const card = g.d.getElementById('perfil-2fa-card');
  expect(card.hidden).toBe(true);
  expect(g.d.getElementById('chk-2fa').disabled).toBe(true);
});
