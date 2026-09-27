/**
 * eslint.config.cjs — configuração flat (ESLint 10).
 *
 * Substitui o .eslintrc.cjs (formato removido no ESLint 10). As regras são as
 * mesmas; o que muda é a forma:
 *   - os globais do frontend vêm de config/frontend-globals.json, gerado a
 *     partir das declarações de topo de js/ (npm run globals:update);
 *   - backend e scripts não enxergam os globais do frontend.
 */
const globals = require('globals');
const globaisFrontend = require('./config/frontend-globals.json').globals;

const regras = {
  'no-undef': 'error',
  'no-unused-vars': ['error', {
    argsIgnorePattern: '^_',
    varsIgnorePattern: '^_',
    caughtErrorsIgnorePattern: '^_',
    // Padrão do ESLint 8, mantido: `catch (e) {}` sem usar `e` não é erro.
    caughtErrors: 'none',
  }],
  'no-redeclare': 'error',
  'no-self-assign': 'error',
  'no-unreachable': 'error',
  'no-unsafe-finally': 'error',
  'no-constant-condition': ['error', { checkLoops: false }],

  // console.log de diagnóstico não deve chegar ao usuário. warn/error são
  // permitidos: o minificador os preserva de propósito (ver bundle-app.cjs).
  'no-console': ['error', { allow: ['warn', 'error'] }],

  'no-dupe-keys': 'error',
  'no-dupe-args': 'error',
  'no-duplicate-case': 'error',
  'no-func-assign': 'error',
  'no-import-assign': 'error',
  'no-cond-assign': ['error', 'except-parens'],
  'no-fallthrough': 'error',
  'valid-typeof': 'error',
  'use-isnan': 'error',
  'require-atomic-updates': 'off',
};

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      'android/**',
      // Bundle de terceiros minificado — não é código nosso.
      'js/vendor/**',
    ],
  },
  {
    files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    linterOptions: {
      // O ESLint 8 não acusava diretivas `eslint-disable` sobrando.
      reportUnusedDisableDirectives: 'off',
    },
    rules: regras,
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs' },
  },
  {
    files: ['scripts/**/*.cjs', 'scripts/**/*.mjs', 'backend/prisma/seed*.js'],
    rules: { 'no-console': 'off' },
  },
  {
    // App vanilla multi-script: cada `var FOO = …` no topo de um arquivo é
    // global e usado pelos outros sem import. no-unused-vars segue desligado:
    // um global declarado aqui é usado em outro arquivo, e a regra não
    // enxerga entre scripts.
    files: ['js/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: globaisFrontend,
    },
    rules: {
      'no-undef': ['error', { typeof: false }],
      'no-unused-vars': 'off',
      // O próprio arquivo que declara `var DADOS` redeclara o global da lista.
      'no-redeclare': ['error', { builtinGlobals: false }],
    },
  },
  {
    // Testes do frontend (CommonJS + Jest) usam os globais do app.
    files: ['tests/**/*.js', 'tests/**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.jest, ...globaisFrontend },
    },
  },
  {
    // Testes do backend são ESM.
    files: ['tests/backend/**/*.js'],
    languageOptions: { sourceType: 'module' },
  },
];
