/**
 * jest.backend.config.cjs — suíte do backend (ESM nativo + ambiente node).
 *
 * Exige --experimental-vm-modules (ver script test:backend:unit): os testes usam
 * jest.unstable_mockModule, que só existe no runtime ESM do Jest.
 */
module.exports = {
  displayName: 'backend',
  rootDir: '.',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/tests/backend/setup-backend.js'],
  transform: {},
  testMatch: ['<rootDir>/tests/backend/**/*.test.js'],

  coverageProvider: 'v8',
  coverageDirectory: 'coverage/backend',
  collectCoverageFrom: [
    'backend/**/*.js',
    '!backend/prisma/**',
    '!backend/server.js',
  ],
  coveragePathIgnorePatterns: ['/node_modules/'],

  // Pisos calibrados sobre a medição real. Regra do projeto: nunca baixe um
  // piso para o CI passar — se a cobertura caiu, ou faltou teste no código
  // novo, ou o teste que sumiu era legítimo.
  coverageThreshold: {
    // O grupo "global" exclui os arquivos com piso próprio. Cobre o que sobra:
    // rotas menos exercitadas, entrypoints de worker e libs de infraestrutura
    // (metrics, tracer, redis) que dependem de serviço externo.
    global: { lines: 45, functions: 25, branches: 70 },

    // Dinheiro e identidade — os pisos mais altos do projeto.
    'backend/domain/services/auth.service.js': { lines: 92, functions: 95, branches: 85 },
    'backend/domain/services/billing.service.js': { lines: 95, functions: 95, branches: 85 },

    // Fronteira de entrada e autorização.
    'backend/lib/jwt.js': { lines: 95, functions: 95, branches: 95 },
    'backend/lib/rbac.js': { lines: 95, functions: 95, branches: 90 },
    'backend/middleware/validate.js': { lines: 95, functions: 90, branches: 95 },
    'backend/middleware/csrf.js': { lines: 92, functions: 95, branches: 90 },
    'backend/lib/config-sanitize.js': { lines: 95, functions: 95, branches: 90 },

    // Único ponto por onde dado financeiro externo entra no sistema.
    'backend/lib/open-finance/belvo.js': { lines: 95, functions: 95, branches: 90 },
    'backend/lib/open-finance/sandbox.js': { lines: 95, functions: 95, branches: 90 },

    // Processamento em background: falha aqui é silenciosa por natureza.
    'backend/workers/recurring.worker.js': { lines: 82, functions: 75, branches: 90 },
    'backend/workers/email.worker.js': { lines: 72, functions: 85, branches: 72 },

    // Acesso a dados — o escopo por usuário mora aqui.
    'backend/domain/repositories/session.repository.js': { lines: 95, functions: 95, branches: 90 },
    'backend/domain/repositories/transaction.repository.js': { lines: 90, functions: 60, branches: 70 },

    // Composição da pilha Express, exercitada por supertest.
    'backend/app.js': { lines: 78, functions: 60, branches: 50 },
  },
  coverageReporters: ['text', 'lcov', 'html'],
  verbose: true,
};
