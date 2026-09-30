#!/usr/bin/env node
/**
 * test-edge.cjs — testes de comportamento das Edge Functions (Deno).
 *
 * As Edge Functions são a fonte de verdade da cobrança (ADR 0004), mas até
 * 30/09 só tinham testes que liam o código como texto; os de comportamento
 * cobriam a cópia congelada no Express. Os testes em
 * supabase/functions/_testes/ executam os módulos de verdade: banco em
 * memória, Stripe falso e Google por fetch falso, trocados pelo import map de
 * _testes/deno.json. Nenhum teste sai para a rede.
 *
 *   npm run test:edge
 *
 * Precisa do Deno 2 (o mesmo runtime das Edge Functions). Procura, nesta
 * ordem: $DENO, `deno` no PATH, node_modules/.bin/deno.
 *
 * --no-check: os dublês cobrem só o pedaço das APIs que o código usa, então
 * a checagem de tipos contra eles não diria nada sobre produção.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIR = path.join('supabase', 'functions', '_testes');

function acharDeno() {
  const candidatos = [process.env.DENO, 'deno', path.join(ROOT, 'node_modules', '.bin', 'deno')].filter(Boolean);
  for (const c of candidatos) {
    const r = spawnSync(c, ['--version'], { encoding: 'utf8' });
    if (r.status === 0) return c;
  }
  return null;
}

function comando(deno, extras) {
  return [deno, ['test', '--no-check', '--allow-env', '--config', path.join(DIR, 'deno.json'), ...extras, DIR]];
}

if (require.main === module) {
  const deno = acharDeno();
  if (!deno) {
    console.error('[test-edge] Deno não encontrado. Instale o Deno 2 (https://deno.com, ou `npm i -g deno`)');
    console.error('            ou aponte a variável DENO para o executável.');
    process.exit(1);
  }
  if (!fs.existsSync(path.join(ROOT, DIR))) {
    console.error('[test-edge] ' + DIR + ' não existe');
    process.exit(1);
  }
  const [bin, args] = comando(deno, process.argv.slice(2));
  const r = spawnSync(bin, args, { cwd: ROOT, stdio: 'inherit' });
  process.exit(r.status === null ? 1 : r.status);
}

module.exports = { comando, DIR };
