/**
 * release-smoke.test.js — o smoke em aparelho faz parte da release.
 *
 * O CI roda num Chromium de desktop; recorte da tela, teclado, compra pela
 * Play e modo avião só aparecem no aparelho. O roteiro
 * (docs/release/smoke-aparelho.md) só vale se o runbook de release mandar
 * rodá-lo e se o modelo de issue da release tiver os mesmos blocos: um bloco
 * novo no roteiro que não chega ao checklist é pulado na primeira release.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ler = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const roteiro = ler('docs/release/smoke-aparelho.md');
const blocos = [...roteiro.matchAll(/^### (\d+\. .+?)(?: \([^)]*\))?$/gm)].map((m) => m[1].trim());

test('o roteiro tem os blocos do roadmap (recorte, teclado, paywall, modo avião)', () => {
  expect(blocos.length).toBeGreaterThanOrEqual(4);
  ['recorte', 'Teclado', 'Paywall', 'Modo avião'].forEach((tema) => {
    expect(blocos.some((b) => b.includes(tema))).toBe(true);
  });
});

test('o modelo de issue da release lista cada bloco do roteiro e aponta para ele', () => {
  const modelo = ler('.github/ISSUE_TEMPLATE/release.md');
  expect(modelo).toContain('docs/release/smoke-aparelho.md');
  blocos.forEach((b) => expect(modelo).toContain('| ' + b + ' |'));
});

test('o runbook de release manda rodar o smoke antes de promover', () => {
  expect(ler('docs/build-aab-runbook.md')).toContain('(release/smoke-aparelho.md)');
});

test('o que o roteiro cita no app existe (textos e arquivos)', () => {
  expect(ler('js/utilities/sync-indicator.js')).toContain("'Offline — alterações pendentes'");
  expect(ler('js/utilities/sync-indicator.js')).toContain("'Salvo no servidor'");
  expect(ler('js/modules/init-billing.js')).toContain('Restaurar compras');
  expect(ler('js/capacitor-init.js')).toContain('#12694E');
  expect(ler('android/app/src/main/AndroidManifest.xml')).toContain('adjustResize');
});
