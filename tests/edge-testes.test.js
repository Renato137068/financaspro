/**
 * edge-testes.test.js — os testes de comportamento das Edge Functions
 * continuam existindo e rodando (achado A1 da reauditoria de 30/09).
 *
 * Eles rodam no Deno (npm run test:edge), fora do Jest. O risco é o de
 * sempre: um job que some do CI ou um módulo de cobrança novo sem teste
 * passam em silêncio. Isto confere a amarração, não os casos.
 */
const fs = require('fs');
const path = require('path');
const { comando, comandoTipos, funcoes, DIR } = require('../scripts/test-edge.cjs');

const ROOT = path.join(__dirname, '..');
const ler = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const testes = fs.readdirSync(path.join(ROOT, DIR)).filter((f) => f.endsWith('.test.ts'));
const fonteTestes = testes.map((f) => ler(path.join(DIR, f))).join('\n');

describe('testes das Edge Functions (Deno)', () => {
  test('cada módulo de cobrança e cada webhook é importado por algum teste', () => {
    ['_shared/play-billing.ts', '_shared/stripe-billing.ts', '_shared/db.ts',
      'stripe-webhook/index.ts', 'play-rtdn/index.ts'].forEach((m) => {
      expect(fonteTestes).toContain('../' + m);
    });
  });

  test('o import map troca as dependências remotas por dublês locais (nenhum teste sai para a rede)', () => {
    const imports = JSON.parse(ler(path.join(DIR, 'deno.json'))).imports;
    const remotos = new Set();
    fs.readdirSync(path.join(ROOT, 'supabase/functions'), { recursive: true })
      .filter((f) => /\.ts$/.test(f) && !String(f).startsWith('_testes'))
      .forEach((f) => {
        const src = ler(path.join('supabase/functions', String(f)));
        for (const m of src.matchAll(/from\s+"((?:https:\/\/esm\.sh\/|npm:)[^"]+)"/g)) remotos.add(m[1]);
      });
    expect(remotos.size).toBeGreaterThan(0);
    remotos.forEach((url) => {
      expect(imports[url]).toMatch(/^\.\/dubles\//);
      expect(fs.existsSync(path.join(ROOT, DIR, imports[url]))).toBe(true);
    });
  });

  // Achado M4 da reauditoria de 30/09: stripe@16 (API 2024-06-20) → stripe@22.
  // Os testes de comportamento usam o dublê; stripe-sdk.test.ts usa a
  // biblioteca de verdade pelo apelido "stripe-real" — na mesma versão que
  // produção importa, senão testaria uma biblioteca e publicaria outra.
  test('o Stripe de produção é um só (npm:, versão exata) e o apelido "stripe-real" aponta para ele', () => {
    const imports = JSON.parse(ler(path.join(DIR, 'deno.json'))).imports;
    const usados = new Set();
    fs.readdirSync(path.join(ROOT, 'supabase/functions'), { recursive: true })
      .filter((f) => /\.ts$/.test(f) && !String(f).startsWith('_testes'))
      .forEach((f) => {
        const src = ler(path.join('supabase/functions', String(f)));
        for (const m of src.matchAll(/from\s+"([^"]*stripe@[^"]+)"/g)) usados.add(m[1]);
      });
    expect([...usados]).toEqual([expect.stringMatching(/^npm:stripe@\d+\.\d+\.\d+$/)]);
    const [spec] = usados;
    expect(imports['stripe-real']).toBe(spec);
    expect(fonteTestes).toContain('from "stripe-real"');
    expect(ler('supabase/functions/_shared/stripe.ts')).toMatch(/apiVersion: STRIPE_API_VERSION/);
  });

  // Achado B1 da reauditoria de 1º/out: os testes rodam com --no-check (os
  // dublês não têm os tipos de produção). A checagem de tipos de verdade é um
  // passo à parte, contra as dependências reais, no CI e no release.
  test('deno check de toda função publicada, sem o import map dos dublês, no CI e no release', () => {
    const publicadas = fs.readdirSync(path.join(ROOT, 'supabase/functions'), { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('_')).map((e) => e.name).sort();
    expect(funcoes()).toEqual(publicadas.map((n) => 'supabase/functions/' + n + '/index.ts'));
    const [, args] = comandoTipos('deno');
    expect(args.slice(0, 3)).toEqual(['check', '--config', path.join(DIR, 'tipos.json')]);
    expect(args.join(' ')).not.toMatch(/--no-check|deno\.json/);
    expect(JSON.parse(ler(path.join(DIR, 'tipos.json'))).imports).toBeUndefined();
    expect(ler('.github/workflows/ci.yml')).toMatch(/\n {2}edge:\n[\s\S]*?node scripts\/test-edge\.cjs --tipos/);
    const release = ler('.github/workflows/release.yml');
    expect(release.slice(release.indexOf('\n  verificar:'), release.indexOf('\n  supabase:'))).toContain('npm run check:edge-types');
  });

  test('dependências das Edge Functions pelo npm com versão exata; nada do esm.sh', () => {
    const imports = new Set();
    fs.readdirSync(path.join(ROOT, 'supabase/functions'), { recursive: true })
      .filter((f) => /\.ts$/.test(f) && !String(f).startsWith('_testes'))
      .forEach((f) => {
        const src = ler(path.join('supabase/functions', String(f)));
        for (const m of src.matchAll(/from\s+"((?:https?:|npm:|jsr:)[^"]+)"/g)) imports.add(m[1]);
      });
    expect(imports.size).toBeGreaterThan(0);
    imports.forEach((i) => expect(i).toMatch(/^npm:(@[\w-]+\/)?[\w.-]+@\d+\.\d+\.\d+$/));
  });

  test('_testes não é publicado como função (sem index.ts, pasta com _)', () => {
    expect(path.basename(DIR).startsWith('_')).toBe(true);
    expect(fs.existsSync(path.join(ROOT, DIR, 'index.ts'))).toBe(false);
  });

  test('o comando roda sem rede e só com leitura de env', () => {
    const [, args] = comando('deno', []);
    expect(args).toEqual(expect.arrayContaining(['test', '--allow-env', '--config']));
    expect(args.join(' ')).not.toMatch(/--allow-(net|all|read|write|run)|\s-A\b/);
  });

  test('o CI tem o job do Deno e o Quality Gate depende dele; o release roda antes de publicar', () => {
    const ci = ler('.github/workflows/ci.yml');
    expect(ci).toMatch(/\n {2}edge:\n[\s\S]*?denoland\/setup-deno@[0-9a-f]{40}[\s\S]*?node scripts\/test-edge\.cjs/);
    expect(ci).toMatch(/needs: \[test, edge(, android)?\]/);
    expect(ci).toMatch(/needs\.edge\.result/);
    const release = ler('.github/workflows/release.yml');
    const verificar = release.slice(release.indexOf('\n  verificar:'), release.indexOf('\n  supabase:'));
    expect(verificar).toContain('npm run test:edge');
  });
});
