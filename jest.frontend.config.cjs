/**
 * jest.frontend.config.cjs — suíte do frontend (CommonJS + jsdom).
 *
 * Roda SEM --experimental-vm-modules de propósito: os testes são CommonJS e
 * carregam os arquivos de js/ via vm (tests/helpers/carregar-script.cjs). Ligar
 * o modo ESM nativo faria o Jest tratar todo .js como módulo (o package.json
 * raiz é "type": "module") e quebraria os require(). Os arquivos de js/ já
 * migrados para ES Modules (ADR 0005) passam pelo conversor de mesmo tamanho
 * de tests/helpers/esm-como-script.cjs. O backend, que é ESM de verdade, roda
 * em jest.backend.config.cjs com a flag ligada.
 */
module.exports = {
  displayName: 'frontend',
  rootDir: '.',
  testEnvironment: 'jsdom',
  setupFiles: ['<rootDir>/tests/setup-globals.js'],
  transform: {},
  testMatch: ['<rootDir>/tests/*.test.js'],
  modulePathIgnorePatterns: ['<rootDir>/.aud/'],
  watchPathIgnorePatterns: ['<rootDir>/.aud/'],

  coverageProvider: 'v8',
  coverageDirectory: 'coverage/frontend',
  collectCoverageFrom: [
    'js/**/*.js',
    '!js/vendor/**',
    '!js/**/*.min.js',
  ],
  coveragePathIgnorePatterns: ['/node_modules/', '/js/vendor/'],

  // Pisos calibrados sobre a medição REAL de todo o js/ (não sobre uma lista
  // curada de 9 arquivos, como antes). O número global é baixo porque a maior
  // parte de js/ é código de UI carregado via <script> e nunca exercitado por
  // teste unitário — mascarar isso com um escopo estreito só adiava o problema.
  // Cada módulo de lógica de negócio tem piso próprio e apertado: é onde uma
  // regressão custa dinheiro do usuário.
  coverageThreshold: {
    // Atenção: o Jest remove do grupo "global" todo arquivo que tem piso
    // próprio abaixo. Logo, este número descreve APENAS o restante de js/ —
    // basicamente a camada de UI. Era 2% (valor defasado: a medição real já
    // passava de 38%). Em 27/09, com o app inteiro rodando nos testes
    // (tests/helpers/app-jsdom.cjs) e todo js/ carregado de um jeito só
    // (tests/helpers/carregar-script.cjs), o grupo mede ~65/57/64. Só sobe.
    global: { lines: 63, functions: 55, branches: 62 },

    // Telas críticas, exercitadas com o app inteiro em app-novo-lancamento,
    // app-login e app-paywall. Antes: 19% / 6% / 18% de linhas.
    // 27/09: as sugestões saíram para form-sugestoes.js e a entrada rápida,
    // o lançamento rápido e a troca manual de categoria ganharam teste
    // (app-novo-atalhos). 68/84/50 → 73/90/54.
    'js/modules/init-form.js': { lines: 73, functions: 90, branches: 54 },
    'js/modules/form-sugestoes.js': { lines: 83, functions: 91, branches: 50 },
    'js/authController.js': { lines: 54, functions: 62, branches: 60 },
    'js/modules/init-billing.js': { lines: 45, functions: 47, branches: 38 },
    'js/core/utils.js': { lines: 96, functions: 100, branches: 85 },
    'js/core/store.js': { lines: 99, functions: 100, branches: 84 },
    // Era o pior ramo do frontend (35%). O teste `validations-real.test.js`
    // passou a exercitar o módulo de verdade — antes, `validations.test.js`
    // testava uma cópia inline da implementação, que nunca pegaria regressão.
    'js/core/validations.js': { lines: 98, functions: 100, branches: 94 },
    // 27/09: ES Module; o BUDGET_SERVICE importado tirou os ramos de reserva mortos. 90/100/74 → 92/100/80.
    'js/orcamento.js': { lines: 92, functions: 100, branches: 80 },

    // Saíram de 0%: os testes antigos recalculavam a lógica inline em vez de
    // carregar o módulo. A conversão revelou dois bugs de produção.
    'js/contas-pagar.js': { lines: 88, functions: 90, branches: 90 },
    'js/assinaturas.js': { lines: 98, functions: 100, branches: 93 },
    'js/transacoes.js': { lines: 94, functions: 100, branches: 82 },
    'js/metas.js': { lines: 99, functions: 100, branches: 94 },
    'js/pipeline.js': { lines: 84, functions: 100, branches: 74 },
    'js/score.js': { lines: 95, functions: 100, branches: 95 },
    'js/parser.js': { lines: 98, functions: 100, branches: 88 },

    // Estes três apareciam como 0% no relatório até se descobrir que os testes
    // passavam um `filename` relativo ao vm.runInContext — o código rodava, mas
    // o provider v8 não conseguia mapeá-lo de volta ao arquivo. Os pisos agora
    // refletem a cobertura que sempre existiu.
    'js/ai-engine.js': { lines: 90, functions: 100, branches: 74 },
    // functions caiu de 95 para 80 porque a instrumentação do funil adicionou
    // funções ao módulo; as linhas seguem em 100%.
    'js/core/setup-guide.js': { lines: 99, functions: 83, branches: 75 },
    'js/core/sync-merge.js': { lines: 99, functions: 100, branches: 83 },
    // 30/09: os caminhos de erro (rede, resposta parcial, rejeição, sessão
    // expirada, fetch que lança) ganharam sync-engine-erros.test.js, que achou
    // o flush preso em "busy" para sempre. Ramos 46% → 88%.
    'js/core/sync-engine.js': { lines: 98, functions: 100, branches: 86 },

    // 30/09: telas que chegam sob demanda (chunks) e só tinham teste das regras.
    // Agora sobem pelo app inteiro (tests/app-<tela>.test.js). Antes → agora,
    // em linhas: 2FA 33 → 90, gastos fixos 0 → 98, relatórios 16 → 87,
    // bancos/categorias 27 → 99, metas 32 → 99, anexos 32 → 98.
    'js/modules/init-2fa.js': { lines: 88, functions: 100, branches: 68 },
    'js/modules/init-assinaturas.js': { lines: 95, functions: 100, branches: 78 },
    'js/modules/init-relatorios.js': { lines: 84, functions: 100, branches: 72 },
    'js/modules/config-bancos.js': { lines: 96, functions: 100, branches: 78 },
    'js/modules/init-metas.js': { lines: 96, functions: 100, branches: 71 },
    'js/anexos.js': { lines: 95, functions: 72, branches: 75 },
    'js/modules/init-anexos.js': { lines: 87, functions: 83, branches: 77 },

    // Estavam realmente em 0%: os testes recalculavam a lógica inline. Ganharam
    // `*-real.test.js` que carregam o módulo de produção.
    'js/patrimonio.js': { lines: 99, functions: 100, branches: 84 },
    'js/relatorios.js': { lines: 95, functions: 95, branches: 60 },

    // Regras de orçamento (dinheiro). O budget.test.js roda uma cópia inline
    // (0% do módulo real); budgetService-real.test.js carrega o de produção.
    'js/services/budgetService.js': { lines: 88, functions: 83, branches: 82 },

    // Resolução de categorias (rótulo/ícone/cor/tipo/custom/busca), consumida
    // por init-form, auto-categorizer e lifecycle. Estava em 0%; agora coberta
    // por categories-real.test.js sobre o módulo de produção.
    'js/categories.js': { lines: 95, functions: 90, branches: 78 },

    // Saldo por conta (dinheiro) + propagarRename (integridade: renomear conta
    // em todos os lançamentos/config). Boa parte do resto é DOM; o piso guarda
    // a lógica pura coberta por contas-saldos/-real/-rename.
    'js/contas.js': { lines: 55, functions: 56, branches: 70 },

    // Saíram de 0%: as suítes carregavam o módulo com `new Function`, sem
    // filename, e a cobertura V8 não contava. Agora rodam com vm e o caminho real.
    'js/core/persist-queue.js': { lines: 68, functions: 74, branches: 68 },
    'js/utilities/finance-reconciler.js': { lines: 78, functions: 68, branches: 53 },
    'js/auth-biometric.js': { lines: 57, functions: 55, branches: 56 },
  },
  coverageReporters: ['text', 'lcov', 'html'],
  verbose: true,
};
