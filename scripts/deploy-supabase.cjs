#!/usr/bin/env node
/**
 * deploy-supabase.cjs — migrações e Edge Functions no projeto Supabase.
 *
 * O workflow de release (.github/workflows/release.yml) roda isto a cada tag;
 * à mão, é o mesmo comando. Antes, o deploy era uma lista de comandos copiada
 * em três documentos (docs/deploy-billing-edge.md, supabase/EXECUCAO.md,
 * supabase/functions/README.md) — e a função nova de relatórios de erro só
 * aparecia num deles.
 *
 * As funções saem das pastas de supabase/functions/ (as que têm index.ts; as
 * que começam com "_" são código compartilhado). As que recebem chamada sem
 * JWT de usuário sobem com --no-verify-jwt e validam a origem por conta
 * própria; cada uma diz isso no cabeçalho do index.ts, e o teste
 * (tests/deploy-supabase.test.js) confere que a lista abaixo bate.
 *
 * Ambiente: SUPABASE_ACCESS_TOKEN (token da conta), SUPABASE_PROJECT_REF (id
 * do projeto) e SUPABASE_DB_PASSWORD (senha do Postgres, para o db push).
 *
 *   node scripts/deploy-supabase.cjs              # db push + todas as funções
 *   node scripts/deploy-supabase.cjs --dry-run    # só mostra os comandos
 *   node scripts/deploy-supabase.cjs --so-migracoes | --so-funcoes
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PASTA_FUNCOES = path.join(ROOT, 'supabase', 'functions');

/** Sem JWT de usuário, e por quê (a defesa fica no código da função). */
const SEM_JWT = {
  'stripe-webhook': 'server-to-server, assinatura do Stripe',
  'play-rtdn': 'server-to-server, segredo do Pub/Sub da Play',
  'obs-ingest': 'relatório de erro pode chegar antes do login (sendBeacon)',
};

const AMBIENTE = ['SUPABASE_ACCESS_TOKEN', 'SUPABASE_PROJECT_REF', 'SUPABASE_DB_PASSWORD'];

function funcoes() {
  return fs.readdirSync(PASTA_FUNCOES, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
    .filter((d) => fs.existsSync(path.join(PASTA_FUNCOES, d.name, 'index.ts')))
    .map((d) => d.name)
    .sort();
}

/** Comandos do CLI, em ordem: vincular, migrar, publicar cada função. */
function comandos(opcoes) {
  const ref = opcoes.ref;
  const lista = [['link', '--project-ref', ref]];
  // Sem --include-all: migração fora de ordem faz o push falhar, em vez de
  // ser aplicada em silêncio sobre um banco que já seguiu adiante.
  if (!opcoes.soFuncoes) lista.push(['db', 'push']);
  if (!opcoes.soMigracoes) {
    funcoes().forEach((f) => {
      const args = ['functions', 'deploy', f, '--project-ref', ref];
      if (SEM_JWT[f]) args.push('--no-verify-jwt');
      lista.push(args);
    });
  }
  return lista;
}

function main() {
  const argv = process.argv.slice(2);
  const opcoes = {
    dryRun: argv.includes('--dry-run'),
    soFuncoes: argv.includes('--so-funcoes'),
    soMigracoes: argv.includes('--so-migracoes'),
    ref: process.env.SUPABASE_PROJECT_REF || '<SUPABASE_PROJECT_REF>',
  };
  const faltando = AMBIENTE.filter((v) => !process.env[v]);
  if (faltando.length && !opcoes.dryRun) {
    console.error('[deploy-supabase] faltam variáveis de ambiente: ' + faltando.join(', '));
    console.error('  No GitHub: Settings → Secrets and variables → Actions (ambiente "production").');
    process.exit(1);
  }

  const cli = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'supabase.cmd' : 'supabase');
  for (const args of comandos(opcoes)) {
    console.log('[deploy-supabase] supabase ' + args.join(' '));
    if (opcoes.dryRun) continue;
    const r = spawnSync(cli, args, { cwd: ROOT, stdio: 'inherit', env: process.env });
    if (r.status !== 0) {
      console.error('[deploy-supabase] falhou: supabase ' + args.join(' '));
      process.exit(r.status || 1);
    }
  }
  console.log('[deploy-supabase] ' + (opcoes.dryRun ? 'dry-run: nada executado' : '✓ concluído'));
}

if (require.main === module) main();

module.exports = { funcoes, comandos, SEM_JWT };
