/**
 * auth-recuperacao.test.js — pendências da auditoria de login:
 *   • códigos de recuperação do 2FA (perder o autenticador ≠ perder a conta);
 *   • encerrar sessões nos outros aparelhos.
 *
 * Guardas estáticos: o comportamento real do banco está em
 * supabase/tests/mfa_recovery.test.sql (pgTAP).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const migracao = (padrao) => {
  const dir = path.join(root, 'supabase/migrations');
  const arq = fs.readdirSync(dir).find((f) => padrao.test(f));
  return arq ? fs.readFileSync(path.join(dir, arq), 'utf8') : '';
};

describe('Códigos de recuperação — banco', () => {
  const sql = migracao(/mfa_recovery_codes\.sql$/);

  test('a migration existe com as três funções', () => {
    expect(sql).toContain('fp_mfa_recovery_generate');
    expect(sql).toContain('fp_mfa_recovery_count');
    expect(sql).toContain('fp_mfa_recovery_consume');
  });

  test('gerar exige AAL2 — um atacante em AAL1 não emite códigos novos', () => {
    const gen = sql.slice(sql.indexOf('fp_mfa_recovery_generate()'), sql.indexOf('fp_mfa_recovery_count()'));
    expect(gen).toContain('fp_mfa_ok()');
    expect(gen).toContain('MFA_REQUIRED');
  });

  test('o código só existe como hash, com o userId dentro', () => {
    expect(sql).toContain('fp_mfa_recovery_hash');
    expect(sql).toMatch(/sha256/);
    expect(sql).toMatch(/p_user::text \|\| ':' \|\| upper/);
    // Nenhuma coluna guarda o código em claro.
    expect(sql).not.toMatch(/"code"\s+text/);
  });

  test('consumir é uso único e devolve a conta', () => {
    const con = sql.slice(sql.indexOf('fp_mfa_recovery_consume(p_code text)'));
    expect(con).toMatch(/"usedAt" is null/);
    expect(con).toMatch(/update public\."MfaRecoveryCode" set "usedAt"/);
    expect(con).toMatch(/delete from auth\.mfa_factors/);
  });

  test('sobras são apagadas: com 2FA desligado elas só seriam risco', () => {
    const con = sql.slice(sql.indexOf('fp_mfa_recovery_consume(p_code text)'));
    expect(con).toMatch(/delete from public\."MfaRecoveryCode" where "userId" = uid/);
  });

  test('a tabela é fechada ao cliente — só as funções entram', () => {
    expect(sql).toMatch(/alter table public\."MfaRecoveryCode" enable row level security/);
    expect(sql).toMatch(/revoke all on table public\."MfaRecoveryCode" from anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.fp_mfa_recovery_consume\(text\) to authenticated/);
  });
});

describe('Códigos de recuperação — app', () => {
  const supa = read('js/core/supabase.js');
  const dois = read('js/modules/init-2fa.js');
  const auth = read('js/authController.js');
  const html = read('index.html');

  test('o cliente expõe gerar, contar e consumir', () => {
    expect(supa).toContain('mfaRecoveryGenerate');
    expect(supa).toContain('mfaRecoveryCount');
    expect(supa).toContain('mfaRecoveryConsume');
  });

  test('consumir recusa resposta que não seja sucesso explícito', () => {
    const trecho = supa.slice(supa.indexOf('mfaRecoveryConsume:'), supa.indexOf('logout:'));
    expect(trecho).toContain('r.data !== true');
  });

  test('ativar o 2FA já entrega os códigos', () => {
    expect(dois).toContain('_gerarRecovery');
    // A geração fica dentro do mesmo callback de sucesso do enroll.
    const enable = dois.slice(
      dois.indexOf('Verificação em duas etapas ativada'),
      dois.indexOf('}).catch(function(err) {', dois.indexOf('Verificação em duas etapas ativada')),
    );
    expect(enable).toContain('_gerarRecovery');
  });

  test('os códigos aparecem uma vez, com aviso de guardar', () => {
    expect(dois).toContain('não serão mostrados de novo');
    expect(dois).toContain('_modalCodigos');
  });

  test('gerar novos avisa que invalida os antigos', () => {
    expect(dois).toMatch(/invalida os anteriores/i);
  });

  test('a tela do código oferece saída para quem perdeu o autenticador', () => {
    expect(html).toContain('id="auth-totp-recovery"');
    expect(auth).toContain('mfaRecoveryConsume');
    expect(auth).toMatch(/reative nas configurações/i);
  });
});

describe('Sessões em outros aparelhos', () => {
  const supa = read('js/core/supabase.js');
  const cfg = read('js/modules/init-config.js');
  const html = read('index.html');

  test('existe signOutOthers com escopo others', () => {
    const trecho = supa.slice(supa.indexOf('signOutOthers:'), supa.indexOf('logout:'));
    expect(trecho).toContain("scope: 'others'");
  });

  test('o perfil tem o botão e ele confirma antes de agir', () => {
    expect(html).toContain('id="btn-sair-outros"');
    expect(cfg).toContain('_bindSairOutrosAparelhos');
    expect(cfg).toContain('fpConfirm');
  });

  test('sem login na nuvem o botão fica desabilitado', () => {
    const trecho = cfg.slice(cfg.indexOf('_bindSairOutrosAparelhos'));
    expect(trecho).toContain('Requer login na nuvem');
    expect(trecho).toMatch(/btn\.disabled = !naNuvem/);
  });
});
