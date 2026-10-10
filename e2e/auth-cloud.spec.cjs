/**
 * e2e/auth-cloud.spec.cjs — login e cadastro no build cloud, com o Supabase
 * simulado por page.route.
 *
 * Os testes de login real (auth-supabase-ui.spec.cjs) dependem de segredos e
 * são pulados sem eles. Este roda em todo PR, sem segredo nenhum: o build é o
 * de produção (cloud), o supabase-js é o real, e só a rede é trocada por um
 * servidor de mentira que responde o que o GoTrue e o PostgREST responderiam.
 * Nada sai da máquina — toda requisição a *.supabase.co é atendida aqui.
 */
const { test, expect } = require('@playwright/test');

/* Build cloud: sem o modo local que playwright.config.cjs aplica por padrão. */
test.use({ storageState: { cookies: [], origins: [] } });

const EMAIL = 'ana@exemplo.com';
const SENHA = 'Cofre#forte-2026';

function base64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64')
    .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/** JWT no formato que o supabase-js decodifica (a assinatura não é conferida no cliente). */
function tokenFalso(usuario) {
  const agora = Math.floor(Date.now() / 1000);
  return base64url({ alg: 'HS256', typ: 'JWT' }) + '.' + base64url({
    sub: usuario.id,
    email: usuario.email,
    role: 'authenticated',
    aud: 'authenticated',
    aal: 'aal1',
    amr: [{ method: 'password', timestamp: agora }],
    session_id: 'sessao-e2e',
    iat: agora,
    exp: agora + 3600,
  }) + '.assinatura-e2e';
}

/**
 * Sobe o Supabase de mentira. `contas` = { email: senha }.
 * Devolve o registro das chamadas de autenticação, para o teste conferir.
 */
async function supabaseSimulado(page, contas) {
  const chamadas = [];
  await page.route('**://*.supabase.co/**', async function(rota) {
    const req = rota.request();
    const url = new URL(req.url());
    const caminho = url.pathname;
    const json = function(status, corpo) {
      return rota.fulfill({ status: status, contentType: 'application/json', body: JSON.stringify(corpo) });
    };
    let corpo = null;
    try { corpo = req.postDataJSON(); } catch (e) { corpo = null; }

    if (caminho === '/auth/v1/health') return json(200, { name: 'GoTrue', version: 'e2e' });

    if (caminho === '/auth/v1/token') {
      const tipo = url.searchParams.get('grant_type');
      chamadas.push({ rota: 'token', tipo: tipo, email: corpo && corpo.email });
      if (tipo === 'password') {
        if (!corpo || contas[corpo.email] !== corpo.password) {
          return json(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
        }
        const usuario = {
          id: '00000000-0000-4000-8000-0000000000e2',
          aud: 'authenticated',
          role: 'authenticated',
          email: corpo.email,
          email_confirmed_at: new Date().toISOString(),
          app_metadata: { provider: 'email', providers: ['email'] },
          user_metadata: { name: 'Ana' },
          factors: [],
          identities: [],
          created_at: new Date().toISOString(),
        };
        return json(200, {
          access_token: tokenFalso(usuario),
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          refresh_token: 'refresh-e2e',
          user: usuario,
        });
      }
      return json(400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' });
    }

    if (caminho === '/auth/v1/signup') {
      chamadas.push({ rota: 'signup', email: corpo && corpo.email, nome: corpo && corpo.data && corpo.data.name });
      // Projeto com confirmação de e-mail: devolve o usuário, sem sessão.
      return json(200, {
        id: '00000000-0000-4000-8000-0000000000e3',
        aud: 'authenticated',
        role: '',
        email: corpo && corpo.email,
        confirmation_sent_at: new Date().toISOString(),
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: (corpo && corpo.data) || {},
        identities: [{ id: 'i1', provider: 'email' }],
        created_at: new Date().toISOString(),
      });
    }

    if (caminho === '/auth/v1/logout') return rota.fulfill({ status: 204, body: '' });
    if (caminho.indexOf('/rest/v1/rpc/') === 0) return json(200, null);
    if (caminho.indexOf('/rest/v1/') === 0) {
      return req.method() === 'GET' || req.method() === 'HEAD' ? json(200, []) : json(201, []);
    }
    return json(200, {});
  });
  return chamadas;
}

/** Quem abre o app pela primeira vez já passou do tour (é o login que importa aqui). */
async function semTour(page) {
  await page.addInitScript(function() {
    if (localStorage.getItem('fp-config')) return;
    localStorage.setItem('fp-config', JSON.stringify({
      nome: 'Ana', moeda: 'BRL', tema: 'light', plano: 'free', pinAtivo: false,
      onboardingConcluido: true, renda: 5000, _schemaVer: 2,
    }));
  });
}

function coletarErros(page) {
  const erros = [];
  page.on('pageerror', function(e) { erros.push(e.message || String(e)); });
  return erros;
}

test.describe('login e cadastro com o Supabase simulado', function() {
  test('login com senha fecha o overlay e mostra o dashboard', async function({ page }) {
    const erros = coletarErros(page);
    const chamadas = await supabaseSimulado(page, { [EMAIL]: SENHA });
    await semTour(page);
    await page.goto('/');

    await expect(page.locator('#auth-overlay')).toBeVisible({ timeout: 20000 });
    await page.locator('#auth-login-email').fill(EMAIL);
    await page.locator('#auth-login-step-email button[type="submit"]').click();
    await expect(page.locator('#auth-login-form')).toBeVisible();
    await page.locator('#auth-login-password').fill(SENHA);
    await page.locator('#auth-login-form button[type="submit"]').click();

    await expect(page.locator('#auth-overlay')).toBeHidden({ timeout: 20000 });
    await expect(page.locator('body')).not.toHaveClass(/auth-overlay-open/);
    await expect(page.locator('#aba-resumo')).toBeVisible();
    await expect(page.locator('#aba-resumo')).toHaveAttribute('data-dashboard-ready', '1', { timeout: 20000 });
    await expect(page.locator('#card-saldo-principal')).toContainText(/R\$/);

    expect(chamadas.filter(function(c) { return c.rota === 'token' && c.tipo === 'password'; }))
      .toEqual([{ rota: 'token', tipo: 'password', email: EMAIL }]);
    expect(erros).toEqual([]);
  });

  test('senha errada mantém o login aberto com mensagem clara', async function({ page }) {
    await supabaseSimulado(page, { [EMAIL]: SENHA });
    await semTour(page);
    await page.goto('/');

    await page.locator('#auth-login-email').fill(EMAIL);
    await page.locator('#auth-login-step-email button[type="submit"]').click();
    await page.locator('#auth-login-password').fill('senha-errada-1');
    await page.locator('#auth-login-form button[type="submit"]').click();

    await expect(page.locator('#auth-message')).toHaveText('E-mail ou senha inválidos.');
    await expect(page.locator('#auth-overlay')).toBeVisible();
  });

  test('cadastro chama /auth/v1/signup e pede a confirmação do e-mail', async function({ page }) {
    const erros = coletarErros(page);
    const chamadas = await supabaseSimulado(page, {});
    await semTour(page);
    await page.goto('/');

    await expect(page.locator('#auth-overlay')).toBeVisible({ timeout: 20000 });
    await page.locator('#auth-tab-register').click();
    await expect(page.locator('#auth-register-form')).toBeVisible();
    await expect(page.locator('#auth-dialog-title')).toHaveText('Criar conta');

    await page.locator('#auth-register-name').fill('Bia Souza');
    await page.locator('#auth-register-email').fill('bia@exemplo.com');
    await page.locator('#auth-register-password').fill(SENHA);
    await page.locator('#auth-register-form button[type="submit"]').click();

    await expect(page.locator('#auth-message')).toContainText(/e-mail de confirmação/i);
    expect(chamadas.filter(function(c) { return c.rota === 'signup'; }))
      .toEqual([{ rota: 'signup', email: 'bia@exemplo.com', nome: 'Bia Souza' }]);
    // Volta ao passo da senha do login, com o e-mail preenchido.
    await expect(page.locator('#auth-login-form')).toBeVisible();
    await expect(page.locator('#auth-login-email')).toHaveValue('bia@exemplo.com');
    await expect(page.locator('#auth-resend-email-btn')).toBeVisible();
    await expect(page.locator('#auth-overlay')).toBeVisible();
    expect(erros).toEqual([]);
  });
});
