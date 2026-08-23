const fs = require('fs');
const path = require('path');

describe('security guardrails', () => {
  const root = path.join(__dirname, '..');

  test('refresh tokens are hashed before session lookup/storage', () => {
    const jwtLib = fs.readFileSync(path.join(root, 'backend/lib/jwt.js'), 'utf8');
    const sessionRepo = fs.readFileSync(
      path.join(root, 'backend/domain/repositories/session.repository.js'),
      'utf8',
    );

    expect(jwtLib).toContain('createHash');
    expect(jwtLib).toContain("digest('hex')");
    expect(sessionRepo).toContain('hashToken(refreshToken)');
  });

  test('service worker does not cache API responses', () => {
    const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

    expect(sw).toContain("url.pathname.startsWith('/api/')");
    expect(sw).toContain('event.respondWith(fetch(event.request))');
  });

  test('environment secrets are ignored by git', () => {
    const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');

    expect(gitignore).toMatch(/^\.env$/m);
    expect(gitignore).toContain('*.env.local');
  });

  test('auth sets HttpOnly cookies instead of exposing tokens to JS', () => {
    const authRoutes = fs.readFileSync(path.join(root, 'backend/routes/auth.js'), 'utf8');
    const authCookies = fs.readFileSync(path.join(root, 'backend/lib/authCookies.js'), 'utf8');
    const dados = fs.readFileSync(path.join(root, 'js/core/dados.js'), 'utf8');

    expect(authRoutes).toContain('setAuthCookies');
    expect(authCookies).toContain('HttpOnly');
    expect(dados).toContain('credentials: \'include\'');
    expect(dados).toContain('_limparTokensLegados');
  });

  test('stripe webhook is registered before JSON body parser', () => {
    const appJs = fs.readFileSync(path.join(root, 'backend/app.js'), 'utf8');
    const webhookIdx = appJs.indexOf('/api/v1/billing/webhook');
    const jsonIdx = appJs.indexOf('app.use(express.json');

    expect(webhookIdx).toBeGreaterThan(-1);
    expect(jsonIdx).toBeGreaterThan(webhookIdx);
  });

  test('billing exposes Stripe Checkout route', () => {
    const billingRoutes = fs.readFileSync(path.join(root, 'backend/routes/billing.js'), 'utf8');
    const billingService = fs.readFileSync(
      path.join(root, 'backend/domain/services/billing.service.js'),
      'utf8',
    );

    expect(billingRoutes).toContain('/:orgId/checkout');
    expect(billingService).toContain('createCheckoutSession');
    expect(billingService).toContain('checkout.session.completed');
  });

  test('auth exposes TOTP 2FA routes', () => {
    const authRoutes = fs.readFileSync(path.join(root, 'backend/routes/auth.js'), 'utf8');
    const schema = fs.readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8');

    expect(authRoutes).toContain('/totp/verify');
    expect(authRoutes).toContain('/totp/setup');
    expect(authRoutes).toContain('/totp/enable');
    expect(schema).toContain('totpEnabled');
  });

  test('open finance API routes and dedupe field exist', () => {
    const routes = fs.readFileSync(path.join(root, 'backend/routes/open-finance.js'), 'utf8');
    const service = fs.readFileSync(
      path.join(root, 'backend/domain/services/open-finance.service.js'),
      'utf8',
    );
    const schema = fs.readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8');

    expect(routes).toContain('/connections');
    expect(routes).toContain('/connections/:id/sync');
    expect(routes).toContain('/providers');
    expect(routes).toContain('/belvo/widget-token');
    expect(routes).toContain('/belvo/complete');
    expect(service).toContain('await Promise.resolve(provider.fetchTransactions');
    expect(schema).toContain('OpenFinanceConnection');
    expect(schema).toContain('openFinanceId');
  });

  test('metrics protegidos e billing fail-closed', () => {
    const health = fs.readFileSync(path.join(root, 'backend/routes/health.js'), 'utf8');
    const billing = fs.readFileSync(path.join(root, 'backend/domain/services/billing.service.js'), 'utf8');
    const transactions = fs.readFileSync(path.join(root, 'backend/routes/transactions.js'), 'utf8');

    expect(health).toContain('requireMetricsAuth');
    expect(billing).toContain('Configure Stripe em produção');
    expect(transactions).toContain('checkTransactionLimit');
  });

  test('config sanitize remove PIN fields', () => {
    const sanitize = fs.readFileSync(path.join(root, 'backend/lib/config-sanitize.js'), 'utf8');
    const userService = fs.readFileSync(path.join(root, 'backend/domain/services/user.service.js'), 'utf8');
    expect(sanitize).toContain('pinHash');
    expect(userService).toContain('sanitizeUserConfig');
  });

  // Estes só existem depois de `npm run build`. Num clone recém-feito não há
  // dist/ e o `readFileSync` estourava um ENOENT cru, que se lê como "a
  // segurança quebrou" quando na verdade é "não há build para inspecionar".
  // `describe` condicional em vez de try/catch dentro do teste: assim ele
  // aparece como PULADO na saída, em vez de passar em silêncio.
  const temDist = fs.existsSync(path.join(root, 'dist', 'sw.js'));
  const seTemBuild = temDist ? describe : describe.skip;

  seTemBuild('build de produção', () => {
    const distSw = () => fs.readFileSync(path.join(root, 'dist', 'sw.js'), 'utf8');

    test('SW precache aponta para os bundles, não para as fontes', () => {
      expect(distSw()).toMatch(/\/css\/index-[^"]+\.css/);
      expect(distSw()).toContain('/js/app.bundle.js');
    });

    test('SW não precacheia fonte crua — ela nem existe mais no build', () => {
      // O purge do bundle-app apaga o que foi inlineado. Se o SW voltasse a
      // listar esses caminhos, `cache.addAll` rejeitaria TUDO no install por
      // causa de um 404 — e o app perderia o modo offline inteiro, calado.
      const sw = distSw();
      ['/js/core/utils.js', '/js/transacoes.js', '/css/style.css'].forEach((caminho) => {
        expect(sw).not.toContain('"' + caminho + '"');
      });
    });

    test('toda URL do precache existe de fato em dist', () => {
      const bloco = distSw().match(/urlsParaCache = \[([\s\S]*?)\];/);
      expect(bloco).toBeTruthy();
      const urls = [...bloco[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]).filter((u) => u !== '/');
      const ausentes = urls.filter(
        (u) => !fs.existsSync(path.join(root, 'dist', u.replace(/^\//, ''))),
      );
      expect(ausentes).toEqual([]);
    });
  });

  test('dados.js integra storage helpers com local-crypto', () => {
    const dados = fs.readFileSync(path.join(root, 'js/core/dados.js'), 'utf8');
    const crypto = fs.readFileSync(path.join(root, 'js/utilities/local-crypto.js'), 'utf8');
    expect(dados).toContain('_storageGetRaw');
    expect(dados).toContain('_storageSetRaw');
    expect(dados).toContain('LOCAL_CRYPTO');
    expect(crypto).toContain('wrapStorageValue');
  });

  test('produção exige Redis e rejeita defaults inseguros no boot', () => {
    const guard = fs.readFileSync(path.join(root, 'backend/lib/production-guard.js'), 'utf8');
    const server = fs.readFileSync(path.join(root, 'backend/server.js'), 'utf8');
    const config = fs.readFileSync(path.join(root, 'backend/config.js'), 'utf8');

    expect(guard).toContain('assertProductionReady');
    expect(guard).toContain('dev-access-secret');
    expect(server).toContain('assertProductionReady');
    expect(config).toContain('requireRedis');
  });

  test('mutações de transação registram auditoria financeira', () => {
    const txService = fs.readFileSync(path.join(root, 'backend/domain/services/transaction.service.js'), 'utf8');
    const txRoutes = fs.readFileSync(path.join(root, 'backend/routes/transactions.js'), 'utf8');
    const audit = fs.readFileSync(path.join(root, 'backend/lib/finance-audit.js'), 'utf8');

    expect(txService).toContain('logFinancialMutation');
    expect(txRoutes).toContain('clientMetaFromRequest');
    expect(audit).toContain('snapshotTransaction');
  });

  test('o canal de LGPD da política é um endereço que existe', () => {
    // A política promete resposta neste endereço: é o canal oficial de
    // exercício de direitos da LGPD. Prometer um canal que não recebe e-mail é
    // descumprir a própria política. O domínio financaspro.com.br não está
    // registrado, então aqui vale o endereço real do responsável — e este
    // teste garante que ele bate com o que o backend usa como padrão.
    const privacidade = fs.readFileSync(path.join(root, 'privacidade.html'), 'utf8');
    const config = fs.readFileSync(path.join(root, 'backend/config.js'), 'utf8');

    expect(privacidade).not.toContain('[coloque aqui');
    const emails = [...privacidade.matchAll(/[\w.+-]+@[\w-]+\.[\w.-]+/g)].map((m) => m[0]);
    expect(emails.length).toBeGreaterThan(0);

    for (const email of new Set(emails)) {
      // nenhum endereço em domínio não registrado
      expect(email).not.toMatch(/@financaspro\.com/);
      // e o backend precisa oferecer o mesmo canal
      expect(config).toContain(email);
    }
  });

  test('snapshot delega transações ao sync pull (sem take 1000)', () => {
    const state = fs.readFileSync(path.join(root, 'backend/domain/services/state.service.js'), 'utf8');
    expect(state).toContain("strategy: 'sync-pull'");
    expect(state).not.toMatch(/take:\s*1000/);
  });

  test('sync e listagem suportam paginação por cursor', () => {
    const repo = fs.readFileSync(path.join(root, 'backend/domain/repositories/transaction.repository.js'), 'utf8');
    const syncRoutes = fs.readFileSync(path.join(root, 'backend/routes/sync.js'), 'utf8');
    const txRoutes = fs.readFileSync(path.join(root, 'backend/routes/transactions.js'), 'utf8');
    expect(repo).toContain('findManyCursor');
    expect(syncRoutes).toContain('cursor');
    expect(txRoutes).toContain('cursor');
  });

  test('bundle budget script mede precache e app.bundle', () => {
    const budget = fs.readFileSync(path.join(root, 'scripts/check-bundle-budget.cjs'), 'utf8');
    expect(budget).toContain('precacheTotal');
    expect(budget).toContain('appBundle');
  });
});
