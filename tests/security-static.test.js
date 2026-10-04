/**
 * security-static.test.js — proteções que dá para conferir lendo os arquivos.
 *
 * As da API Express (cookies HttpOnly, webhook antes do parser, Redis e SMTP
 * obrigatórios em produção…) saíram com ela (ADR 0007). As regras de servidor
 * que sobraram são do Supabase e têm teste próprio: pgTAP em supabase/tests/
 * e Deno em supabase/functions/_testes/.
 */
const fs = require('fs');
const path = require('path');

describe('security guardrails', () => {
  const root = path.join(__dirname, '..');

  test('service worker does not cache API responses', () => {
    const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

    expect(sw).toContain("url.pathname.startsWith('/api/')");
    expect(sw).toContain('event.respondWith(fetch(event.request))');
  });

  test('environment secrets are ignored by git', () => {
    const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');

    expect(gitignore).toMatch(/^\.env$/m);
    expect(gitignore).toContain('*.env.local');
  });

  // Estes só existem depois de `npm run build`. Num clone recém-feito não há
  // dist/ e o `readFileSync` estourava um ENOENT cru, que se lê como "a
  // segurança quebrou" quando na verdade é "não há build para inspecionar".
  // `describe` condicional em vez de try/catch dentro do teste: assim ele
  // aparece como PULADO na saída, em vez de passar em silêncio.
  const temDist = fs.existsSync(path.join(root, 'dist', 'sw.js'));
  const seTemBuild = temDist ? describe : describe.skip;

  seTemBuild('build de produção', () => {
    const distSw = () => fs.readFileSync(path.join(root, 'dist', 'sw.js'), 'utf8');

    test('SW precache aponta para os bundles, não para as fontes', () => {
      expect(distSw()).toMatch(/\/css\/index-[^"]+\.css/);
      expect(distSw()).toContain('/js/app.bundle.js');
    });

    test('SW não precacheia fonte crua — ela nem existe mais no build', () => {
      // O purge do bundle-app apaga o que foi inlineado. Se o SW voltasse a
      // listar esses caminhos, `cache.addAll` rejeitaria TUDO no install por
      // causa de um 404 — e o app perderia o modo offline inteiro, calado.
      const sw = distSw();
      ['/js/core/utils.js', '/js/transacoes.js', '/css/style.css'].forEach((caminho) => {
        expect(sw).not.toContain('"' + caminho + '"');
      });
    });

    test('toda URL do precache existe de fato em dist', () => {
      const bloco = distSw().match(/urlsParaCache = \[([\s\S]*?)\];/);
      expect(bloco).toBeTruthy();
      const urls = [...bloco[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]).filter((u) => u !== '/');
      const ausentes = urls.filter(
        (u) => !fs.existsSync(path.join(root, 'dist', u.replace(/^\//, ''))),
      );
      expect(ausentes).toEqual([]);
    });
  });

  test('dados.js integra storage helpers com local-crypto', () => {
    const dados = fs.readFileSync(path.join(root, 'js/core/dados.js'), 'utf8');
    const crypto = fs.readFileSync(path.join(root, 'js/utilities/local-crypto.js'), 'utf8');
    expect(dados).toContain('_storageGetRaw');
    expect(dados).toContain('_storageSetRaw');
    expect(dados).toContain('LOCAL_CRYPTO');
    expect(crypto).toContain('wrapStorageValue');
  });

  test('política de privacidade não promete domínio não registrado', () => {
    const privacidade = fs.readFileSync(path.join(root, 'privacidade.html'), 'utf8');
    expect(privacidade).not.toContain('[coloque aqui');
    const emails = [...privacidade.matchAll(/[\w.+-]+@[\w-]+\.[\w.-]+/g)].map((m) => m[0]);
    expect(emails.length).toBeGreaterThan(0);
    for (const email of new Set(emails)) {
      expect(email).not.toMatch(/@financaspro\.com/);
    }
  });

  test('bundle budget script mede precache e app.bundle', () => {
    const budget = fs.readFileSync(path.join(root, 'scripts/check-bundle-budget.cjs'), 'utf8');
    expect(budget).toContain('precacheTotal');
    expect(budget).toContain('appBundle');
  });
});
