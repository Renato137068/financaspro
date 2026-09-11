const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.cjs',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 45000,
  use: {
    baseURL: 'http://127.0.0.1:4321',
    viewport: { width: 360, height: 640 },
    locale: 'pt-BR',

    /* Modo local (piloto, sem Supabase) por padrão em toda a suíte.
     *
     * O build servido aqui é o de PRODUÇÃO, em modo cloud — é o artefato que
     * vira o AAB. Sem isto, o Supabase sobe a tela de login em cima do app e o
     * critical-inline.css some com header, main e nav enquanto ela estiver
     * aberta: a suíte inteira reprovava por um motivo que não é do produto. A
     * saída anterior era buildar em modo local antes de rodar, o que fazia o
     * end-to-end validar um artefato diferente do publicado.
     *
     * `fp-force-local` é lido por _fpWantLocal() quando config.js é avaliado.
     * Quem precisa do comportamento cloud desliga isto com
     * `test.use({ storageState: { cookies: [], origins: [] } })` —
     * é o que auth-offline-entrada.spec.cjs faz. Specs que chamam
     * localStorage.clear() no addInitScript precisam re-aplicar a flag com
     * forcarModoLocal() de helpers.cjs. */
    storageState: {
      cookies: [],
      origins: [
        {
          origin: 'http://127.0.0.1:4321',
          localStorage: [{ name: 'fp-force-local', value: '1' }],
        },
        {
          origin: 'http://127.0.0.1:4322',
          localStorage: [{ name: 'fp-force-local', value: '1' }],
        },
      ],
    },
    actionTimeout: 15000,
    // Permite apontar para um Chromium ja instalado na maquina, quando a
    // versao que o Playwright baixaria nao esta disponivel (CI restrito,
    // ambiente sem rede). Sem a variavel, nada muda.
    launchOptions: process.env.PW_CHROMIUM
      ? { executablePath: process.env.PW_CHROMIUM }
      : {},
  },
  webServer: [
    {
      command: 'node scripts/e2e-serve.cjs',
      port: 4321,
      timeout: 120000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'node scripts/e2e-serve-source.cjs',
      port: 4322,
      timeout: 120000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
