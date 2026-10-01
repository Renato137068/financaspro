#!/usr/bin/env node
/**
 * test-edge.cjs — testes de comportamento das Edge Functions (Deno).
 *
 * As Edge Functions são a fonte de verdade da cobrança (ADR 0004), mas até
 * 30/09 só tinham testes que liam o código como texto; os de comportamento
 * cobriam a cópia congelada no Express. Os testes em
 * supabase/functions/_testes/ executam os módulos de verdade: banco em
 * memória, Stripe falso e Google por fetch falso, trocados pelo import map de
 * _testes/deno.json. Nenhum teste sai para a rede (o Deno só baixa o pacote
 * npm:stripe, que stripe-sdk.test.ts usa de verdade, antes de rodar).
 *
 *   npm run test:edge
 *   npm run check:edge-types   # deno check de cada função, com as dependências reais
 *
 * Precisa do Deno 2 (o mesmo runtime das Edge Functions). Procura, nesta
 * ordem: $DENO, `deno` no PATH, node_modules/.bin/deno.
 *
 * --no-check: os dublês cobrem só o pedaço das APIs que o código usa, então
 * a checagem de tipos contra eles não diria nada sobre produção. A checagem
 * de verdade é o modo --tipos: `deno check` do index.ts de cada função contra
 * as dependências reais (npm:stripe, npm:@supabase/supabase-js), sem o import
 * map dos dublês. Achado B1 da reauditoria de 1º/out: na primeira rodada ela
 * achou o org-invite lendo plan.maxUsers de uma consulta sem a coluna.
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

/** Os index.ts publicados (uma pasta por função; as que começam com _ não são publicadas). */
function funcoes() {
  const base = path.join(ROOT, 'supabase', 'functions');
  return fs.readdirSync(base, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('_') && fs.existsSync(path.join(base, e.name, 'index.ts')))
    .map((e) => path.join('supabase', 'functions', e.name, 'index.ts'))
    .sort();
}

// tipos.json não tem import map: a checagem vê as dependências de produção.
// Passar um --config também impede o Deno de adotar o package.json da raiz.
function comandoTipos(deno) {
  return [deno, ['check', '--config', path.join(DIR, 'tipos.json'), ...funcoes()]];
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
  const tipos = process.argv.includes('--tipos');
  const [bin, args] = tipos ? comandoTipos(deno) : comando(deno, process.argv.slice(2));
  const r = spawnSync(bin, args, { cwd: ROOT, stdio: 'inherit' });
  process.exit(r.status === null ? 1 : r.status);
}

module.exports = { comando, comandoTipos, funcoes, DIR };
