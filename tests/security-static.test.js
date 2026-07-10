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

  test('dist SW precache inclui CSS bundle Vite', () => {
    const distSw = fs.readFileSync(path.join(root, 'dist', 'sw.js'), 'utf8');
    expect(distSw).toMatch(/\/css\/index-[^"]+\.css/);
    expect(distSw).toContain('/js/app.bundle.js');
  });

  test('dados.js integra storage helpers com local-crypto', () => {
    const dados = fs.readFileSync(path.join(root, 'js/core/dados.js'), 'utf8');
    const crypto = fs.readFileSync(path.join(root, 'js/utilities/local-crypto.js'), 'utf8');
    expect(dados).toContain('_storageGetRaw');
    expect(dados).toContain('_storageSetRaw');
    expect(dados).toContain('LOCAL_CRYPTO');
    expect(crypto).toContain('wrapStorageValue');
  });
});
