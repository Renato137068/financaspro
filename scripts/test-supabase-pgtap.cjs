#!/usr/bin/env node
/**
 * test-supabase-pgtap.cjs — pgTAP contra Postgres (CI ou local).
 *
 * Ordem: Prisma migrate → stub auth Supabase → migrations SQL → testes pgTAP.
 * Pule com SKIP_PGTAP=1 ou sem INTEGRATION_TEST_DATABASE_URL.
 */
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dbUrl = process.env.INTEGRATION_TEST_DATABASE_URL || process.env.DATABASE_URL;

if (!dbUrl || process.env.SKIP_PGTAP === '1') {
  console.log('[pgtap] pulado — defina INTEGRATION_TEST_DATABASE_URL ou SKIP_PGTAP=1');
  process.exit(0);
}

function sqlScalar(query) {
  var r = spawnSync('psql', ['-tAc', query, dbUrl], { encoding: 'utf8' });
  if (r.status !== 0) return '';
  return (r.stdout || '').trim();
}

function psql(sqlOrFile, opts) {
  opts = opts || {};
  var args = ['-v', 'ON_ERROR_STOP=1', dbUrl];
  if (opts.file) {
    args = ['-v', 'ON_ERROR_STOP=1', '-f', sqlOrFile, dbUrl];
  } else {
    args = ['-v', 'ON_ERROR_STOP=1', '-c', sqlOrFile, dbUrl];
  }
  var r = spawnSync('psql', args, { encoding: 'utf8', stdio: 'inherit' });
  if (r.status !== 0) {
    throw new Error('psql falhou' + (opts.file ? ': ' + opts.file : ''));
  }
}

function hasPsql() {
  var r = spawnSync('psql', ['--version'], { encoding: 'utf8' });
  return r.status === 0;
}

if (!hasPsql()) {
  console.error('[pgtap] psql não encontrado — instale postgresql-client ou use SKIP_PGTAP=1');
  process.exit(1);
}

console.log('[pgtap] preparando schema Prisma…');
execSync('npx prisma migrate deploy', {
  cwd: root,
  stdio: 'inherit',
  env: Object.assign({}, process.env, { DATABASE_URL: dbUrl }),
});

console.log('[pgtap] seed de planos (quota tests)…');
try {
  execSync('node backend/prisma/seed-plans.js', {
    cwd: root,
    stdio: 'inherit',
    env: Object.assign({}, process.env, { DATABASE_URL: dbUrl }),
  });
} catch (e) {
  console.warn('[pgtap] seed-plans opcional falhou:', e.message);
}

var bootstrap = path.join(root, 'supabase/tests/_ci_auth_stub.sql');
console.log('[pgtap] bootstrap auth + pgtap…');
psql(bootstrap, { file: bootstrap });

if (sqlScalar("SELECT count(*) FROM pg_proc WHERE proname = 'is_org_member'") === '0') {
  var migDir = path.join(root, 'supabase/migrations');
  var migrations = fs.readdirSync(migDir).filter(function(f) { return f.endsWith('.sql'); }).sort();
  for (var i = 0; i < migrations.length; i++) {
    var f = path.join(migDir, migrations[i]);
    console.log('[pgtap] migration', migrations[i]);
    psql(f, { file: f });
  }
} else {
  console.log('[pgtap] migrations Supabase já aplicadas — pulando SQL');
}

var testDir = path.join(root, 'supabase/tests');
var tests = fs.readdirSync(testDir)
  .filter(function(f) { return f.endsWith('.test.sql'); })
  .sort();

console.log('[pgtap] rodando', tests.length, 'arquivos…');
for (var j = 0; j < tests.length; j++) {
  var t = path.join(testDir, tests[j]);
  console.log('[pgtap] →', tests[j]);
  psql(t, { file: t });
}

console.log('[pgtap] todos os testes passaram');
