/**
 * auth-hardening.test.js — guardas da auditoria de login (2FA, enumeração,
 * política de senha e invalidação de sessão na troca de senha).
 *
 * São testes estáticos: garantem que a correção não seja desfeita sem que
 * alguém veja. Falha aqui = regressão de segurança, não de estilo.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('Login — enumeração de usuários', () => {
  const supa = read('js/core/supabase.js');

  test('cadastro não confirma que um e-mail já existe', () => {
    expect(supa).not.toContain('Este e-mail já está cadastrado');
    expect(supa).not.toMatch(/já está cadastrado/);
  });

  test('identities vazio segue o mesmo caminho do cadastro novo', () => {
    // O throw revelador foi removido; sobra só a leitura da sessão.
    expect(supa).not.toMatch(/identities\s*&&\s*[^)]*length\s*===\s*0[\s\S]{0,120}throw/);
  });

  test('login continua com mensagem genérica', () => {
    expect(supa).toContain('E-mail ou senha inválidos.');
  });
});

describe('Login — troca de senha encerra outras sessões', () => {
  const supa = read('js/core/supabase.js');

  test('updatePassword chama signOut com escopo others', () => {
    expect(supa).toContain("signOut({ scope: 'others' })");
  });

  test('falha ao encerrar sessões não desfaz a troca de senha', () => {
    const trecho = supa.slice(supa.indexOf('updatePassword:'), supa.indexOf('reauthWithPassword:'));
    expect(trecho).toContain('.catch(');
    expect(trecho).toContain('return true');
  });
});

describe('Login — política de senha', () => {
  const policy = read('js/core/password-policy.js');
  const auth = read('js/authController.js');

  test('mínimo 8, máximo 128 e exige número ou caractere especial', () => {
    expect(policy).toContain('MIN: 8');
    expect(policy).toContain('MAX: 128');
    expect(policy).toMatch(/REQUIRES:\s*\/\[0-9/);
  });

  test('aplicada no cadastro E na redefinição', () => {
    const ocorrencias = auth.match(/VALIDATIONS\.validarSenha\(/g) || [];
    expect(ocorrencias.length).toBeGreaterThanOrEqual(2);
  });
});

describe('2FA — exigência de AAL2 no banco', () => {
  const dir = path.join(root, 'supabase/migrations');
  const arquivo = fs.readdirSync(dir).find((f) => /require_aal2\.sql$/.test(f));

  test('existe migration de AAL2', () => {
    expect(arquivo).toBeTruthy();
  });

  test('a policy é RESTRICTIVE — só nega, nunca amplia acesso', () => {
    const sql = fs.readFileSync(path.join(dir, arquivo), 'utf8');
    expect(sql).toMatch(/as\s+restrictive/i);
    expect(sql).toContain('fp_mfa_ok');
    expect(sql).toContain("'aal2'");
  });

  test('cobre as tabelas com dado financeiro do usuário', () => {
    const sql = fs.readFileSync(path.join(dir, arquivo), 'utf8');
    ['Transaction', 'Account', 'Budget', 'RecurringTransaction', 'UserConfig'].forEach((t) => {
      expect(sql).toContain(`'${t}'`);
    });
  });

  test('quem não tem fator verificado não é afetado', () => {
    const sql = fs.readFileSync(path.join(dir, arquivo), 'utf8');
    expect(sql).toMatch(/else true/);
  });

  test('a função é security definer com search_path fixo', () => {
    const sql = fs.readFileSync(path.join(dir, arquivo), 'utf8');
    expect(sql).toMatch(/security\s+definer/i);
    expect(sql).toMatch(/set\s+search_path\s*=/i);
    expect(sql).toMatch(/grant\s+execute[\s\S]{0,80}to\s+authenticated/i);
  });
});
