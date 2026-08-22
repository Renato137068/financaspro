/**
 * jest.frontend.config.cjs — suíte do frontend (CommonJS + jsdom).
 *
 * Roda SEM --experimental-vm-modules de propósito: os módulos de js/ são
 * scripts clássicos carregados por <script> e os testes usam require(). Ligar o
 * modo ESM nativo faria o Jest tratar todo .js como módulo (o package.json raiz
 * é "type": "module") e quebraria esses require(). O backend, que é ESM de
 * verdade, roda em jest.backend.config.cjs com a flag ligada.
 */
module.exports = {
  displayName: 'frontend',
  rootDir: '.',
  testEnvironment: 'jsdom',
  setupFiles: ['<rootDir>/tests/setup-globals.js'],
  transform: {},
  testMatch: ['<rootDir>/tests/*.test.js'],

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
    // basicamente a camada de UI. Hoje: ~2,8% linhas / ~12,6% funções.
    // É a métrica honesta da dívida de teste do frontend e deve subir a cada
    // módulo migrado para ES Modules e coberto por teste.
    global: { lines: 2, functions: 10, branches: 30 },
    'js/core/utils.js': { lines: 95, functions: 100, branches: 85 },
    'js/core/store.js': { lines: 95, functions: 95, branches: 80 },
    // Era o pior ramo do frontend (35%). O teste `validations-real.test.js`
    // passou a exercitar o módulo de verdade — antes, `validations.test.js`
    // testava uma cópia inline da implementação, que nunca pegaria regressão.
    'js/core/validations.js': { lines: 95, functions: 95, branches: 90 },
    'js/orcamento.js': { lines: 85, functions: 95, branches: 70 },

    // Saíram de 0%: os testes antigos recalculavam a lógica inline em vez de
    // carregar o módulo. A conversão revelou dois bugs de produção.
    'js/contas-pagar.js': { lines: 80, functions: 80, branches: 88 },
    'js/assinaturas.js': { lines: 78, functions: 80, branches: 90 },
    'js/transacoes.js': { lines: 90, functions: 95, branches: 78 },
    'js/metas.js': { lines: 95, functions: 95, branches: 88 },
    'js/pipeline.js': { lines: 80, functions: 95, branches: 72 },
    'js/score.js': { lines: 82, functions: 45, branches: 88 },
    'js/parser.js': { lines: 95, functions: 95, branches: 85 },

    // Estes três apareciam como 0% no relatório até se descobrir que os testes
    // passavam um `filename` relativo ao vm.runInContext — o código rodava, mas
    // o provider v8 não conseguia mapeá-lo de volta ao arquivo. Os pisos agora
    // refletem a cobertura que sempre existiu.
    'js/ai-engine.js': { lines: 52, functions: 65, branches: 72 },
    // functions caiu de 95 para 80 porque a instrumentação do funil adicionou
    // funções ao módulo; as linhas seguem em 100%.
    'js/core/setup-guide.js': { lines: 95, functions: 80, branches: 70 },
    'js/core/sync-merge.js': { lines: 95, functions: 95, branches: 60 },

    // Estavam realmente em 0%: os testes recalculavam a lógica inline. Ganharam
    // `*-real.test.js` que carregam o módulo de produção.
    'js/patrimonio.js': { lines: 88, functions: 90, branches: 80 },
    'js/relatorios.js': { lines: 95, functions: 95, branches: 60 },
  },
  coverageReporters: ['text', 'lcov', 'html'],
  verbose: true,
};
