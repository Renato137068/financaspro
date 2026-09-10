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

/** Localiza o pgtap--<versão>.sql do cliente (pacote postgresql-<major>-pgtap). */
function findPgtapSql() {
  const shares = [];
  const pc = spawnSync('pg_config', ['--sharedir'], { encoding: 'utf8' });
  if (pc.status === 0 && pc.stdout.trim()) shares.push(pc.stdout.trim());
  // Fallbacks por major (o servidor do CI é 16; cobre variações locais).
  for (const maj of ['16', '17', '15', '14']) shares.push('/usr/share/postgresql/' + maj);
  for (const s of shares) {
    const extdir = path.join(s, 'extension');
    try {
      const control = fs.readFileSync(path.join(extdir, 'pgtap.control'), 'utf8');
      const m = control.match(/default_version\s*=\s*'([^']+)'/);
      if (m) {
        const f = path.join(extdir, 'pgtap--' + m[1] + '.sql');
        if (fs.existsSync(f)) return f;
      }
    } catch (e) { /* próximo caminho */ }
  }
  return null;
}

/**
 * Garante o pgTAP no banco. A imagem postgres:alpine do CI não traz a extensão
 * instalada no servidor (CREATE EXTENSION falha: sem pgtap.control), então
 * carregamos o SQL do pgTAP direto pelo cliente — funciona em qualquer banco.
 * Fallback para CREATE EXTENSION em ambientes onde a extensão existe no servidor.
 */
function ensurePgtap() {
  if (sqlScalar("SELECT 1 FROM pg_proc WHERE proname = 'finish' AND pronamespace = 'public'::regnamespace LIMIT 1") === '1') {
    console.log('[pgtap] pgTAP já presente');
    return;
  }
  const file = findPgtapSql();
  if (file) {
    console.log('[pgtap] carregando pgTAP de', file);
    psql(file, { file });
    return;
  }
  const ext = spawnSync('psql', ['-v', 'ON_ERROR_STOP=1', '-c', 'CREATE EXTENSION IF NOT EXISTS pgtap', dbUrl], { encoding: 'utf8', stdio: 'inherit' });
  if (ext.status === 0) {
    console.log('[pgtap] pgTAP via CREATE EXTENSION (extensão do servidor)');
    return;
  }
  throw new Error('[pgtap] pgTAP indisponível — instale postgresql-<major>-pgtap no runner ou a extensão no servidor');
}

console.log('[pgtap] preparando schema Prisma…');
execSync('npx prisma migrate deploy', {
  cwd: root,
  stdio: 'inherit',
  env: Object.assign({}, process.env, { DATABASE_URL: dbUrl }),
});

// Sem seed global de planos: cada teste pgTAP que precisa (quota, rls) cria os
// próprios planos com ids fixos (p_free/p_pro) na sua transação. O seed da app
// usa ids UUID e colidia com esses fixtures na UNIQUE(tier) — o insert do teste
// caía em `on conflict do nothing` e o planId fixo depois furava a FK.

console.log('[pgtap] garantindo pgTAP no banco…');
ensurePgtap();

var bootstrap = path.join(root, 'supabase/tests/_ci_auth_stub.sql');
console.log('[pgtap] bootstrap auth (schema/roles/auth.*)…');
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
