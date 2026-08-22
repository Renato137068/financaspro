#!/usr/bin/env node
/**
 * lint-changed.cjs — ESLint com tolerância zero, mas só no código que mudou.
 *
 * Por que existe: o frontend ainda é um app multi-script com estado em globais,
 * o que gera centenas de avisos `no-undef` legítimos para o padrão atual.
 * Elevar a regra a erro hoje quebraria o build; deixá-la em warning para sempre
 * significa que a dívida nunca para de crescer.
 *
 * Este script resolve o impasse: congela a dívida existente e exige limpeza
 * apenas do que o PR toca. Arquivo novo ou alterado precisa sair com zero
 * avisos; o resto do repositório fica como está até a migração para ES Modules.
 *
 * Uso:
 *   node scripts/lint-changed.cjs                 # diff contra origin/main
 *   node scripts/lint-changed.cjs --base HEAD~1   # diff contra outra ref
 *   node scripts/lint-changed.cjs --all           # repositório inteiro (informativo)
 */
const { execSync, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
const baseIdx = args.indexOf('--base');
const explicitBase = baseIdx !== -1 ? args[baseIdx + 1] : null;
const lintAll = args.includes('--all');

const root = path.join(__dirname, '..');

function sh(cmd) {
  try {
    return execSync(cmd, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

/** Descobre a referência de comparação mais sensata disponível. */
function resolveBase() {
  if (explicitBase) return explicitBase;
  for (const ref of ['origin/main', 'origin/master', 'main', 'master']) {
    if (sh(`git rev-parse --verify --quiet ${ref}`)) {
      const mergeBase = sh(`git merge-base HEAD ${ref}`);
      if (mergeBase) return mergeBase;
    }
  }
  return 'HEAD~1';
}

function changedFiles(base) {
  const committed = sh(`git diff --name-only --diff-filter=ACMR ${base}...HEAD`);
  const working = sh('git diff --name-only --diff-filter=ACMR HEAD');
  const staged = sh('git diff --name-only --diff-filter=ACMR --cached');
  const untracked = sh('git ls-files --others --exclude-standard');

  return [...new Set([committed, working, staged, untracked].join('\n').split('\n'))]
    .map(f => f.trim())
    .filter(Boolean);
}

const LINTABLE = /^(js|backend|scripts|tests)\/.*\.(js|cjs|mjs)$/;
const IGNORED = /\/vendor\/|\.min\.js$/;

let targets;

if (lintAll) {
  targets = ['js/', 'backend/'];
  console.log('[lint-changed] modo --all: repositório inteiro');
} else {
  const base = resolveBase();
  const files = changedFiles(base)
    .filter(f => LINTABLE.test(f) && !IGNORED.test(f))
    .filter(f => fs.existsSync(path.join(root, f)));

  if (!files.length) {
    console.log('[lint-changed] nenhum arquivo JS alterado — nada a verificar');
    process.exit(0);
  }

  console.log(`[lint-changed] base: ${base}`);
  console.log(`[lint-changed] ${files.length} arquivo(s) alterado(s):`);
  files.forEach(f => console.log(`  · ${f}`));
  targets = files;
}

const eslintBin = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'eslint.cmd' : 'eslint');
const result = spawnSync(eslintBin, [...targets, '--max-warnings', '0'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.status !== 0) {
  console.error('\n[lint-changed] ✗ código alterado precisa sair com ZERO avisos.');
  console.error('  Dívida antiga é tolerada; código novo, não.');
  console.error('  Se o aviso for no-undef por global do app, declare-o em .eslintrc.cjs.');
  process.exit(1);
}

console.log('[lint-changed] ✓ código alterado está limpo');
