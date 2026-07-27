/**
 * build-lucide-subset.cjs — gera um lucide.min.js enxuto contendo APENAS os
 * ícones referenciados no código, reduzindo ~390 KB para poucos KB.
 *
 * Opera sobre dist/ (build de produção). O dev continua usando a lib completa.
 *
 * COMO: varre o fonte por literais de string kebab-case; para cada um resolve o
 * nome PascalCase via o mapa oficial `iconsAndAliases.mjs` do lucide (que cobre
 * nomes canônicos E aliases legados, ex.: `alert-triangle` → arquivo
 * `triangle-alert.mjs`). Importa só esses ícones e monta um `window.lucide`
 * compatível com `createIcons`. esbuild faz o tree-shaking.
 *
 * SEGURANÇA: como a varredura pode não capturar nomes 100% dinâmicos, mantemos
 * `lucide-full.min.js` no dist e o `lucide-init.js` faz fallback lazy — se algum
 * <i data-lucide> não for convertido, carrega a lib completa e re-renderiza.
 * Nunca há regressão de ícone sumido.
 *
 * Falha fechada: sem esbuild ou sem ícones detectados, mantém a lib completa.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const distVendor = path.join(dist, 'js', 'vendor');
const esmDir = path.join(root, 'node_modules', 'lucide', 'dist', 'esm');
const aliasesFile = path.join(esmDir, 'iconsAndAliases.mjs');
const fullUmd = path.join(root, 'node_modules', 'lucide', 'dist', 'umd', 'lucide.min.js');

// Nomes (kebab) que devem SEMPRE entrar — fallbacks do lucide-init e comuns via
// variável. A varredura costuma pegá-los; seed é cinto de segurança extra.
const SEED = [
  'pin', 'target', 'wallet', 'calendar', 'landmark', 'tv', 'circle-alert',
  'alert-triangle', 'alert-circle', 'info', 'check', 'x', 'chevron-right',
  'chevron-left', 'chevron-down', 'chevron-up', 'plus', 'minus', 'trash-2',
  'pencil', 'search', 'settings', 'home', 'bell', 'arrow-up', 'arrow-down',
  'arrow-left', 'arrow-right', 'trending-up', 'trending-down',
];

function toCamelCase(s) {
  return s.replace(/^([A-Z])|[\s-_]+(\w)/g, (m, p1, p2) => (p2 ? p2.toUpperCase() : p1.toLowerCase()));
}
function toPascalCase(s) {
  const c = toCamelCase(s);
  return c.charAt(0).toUpperCase() + c.slice(1);
}

// Mapa PascalName → especificador de import (canônicos + aliases legados).
function buildPascalMap() {
  const map = new Map();
  const src = fs.readFileSync(aliasesFile, 'utf8');
  const re = /export\s*\{([^}]*)\}\s*from\s*["']\.\/(icons\/[a-z0-9-]+\.mjs)["']/g;
  let m;
  while ((m = re.exec(src))) {
    const spec = 'lucide/dist/esm/' + m[2];
    const names = m[1].match(/default as ([A-Za-z0-9]+)/g) || [];
    for (const n of names) map.set(n.replace('default as ', ''), spec);
  }
  return map;
}

function walkFiles(dir, acc) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'vendor') continue;
      walkFiles(full, acc);
    } else if (/\.(js|html)$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

// Extrai todo literal de string kebab-case e mantém os que resolvem para um
// ícone/alias real. Viés seguro para incluir: um ícone extra custa ~200 bytes.
function collectIcons(pascalMap) {
  const wanted = new Map(); // PascalName → spec
  const consider = (kebab) => {
    const pascal = toPascalCase(kebab);
    if (pascalMap.has(pascal)) wanted.set(pascal, pascalMap.get(pascal));
  };
  SEED.forEach(consider);

  const literalRe = /["']([a-z][a-z0-9-]{2,})["']/g;
  const sources = walkFiles(path.join(dist, 'js'), []);
  const indexHtml = path.join(dist, 'index.html');
  if (fs.existsSync(indexHtml)) sources.push(indexHtml);

  for (const file of sources) {
    if (/app\.bundle\.js$|vendor\.bundle\.js$/.test(file)) continue;
    const code = fs.readFileSync(file, 'utf8');
    literalRe.lastIndex = 0;
    let m;
    while ((m = literalRe.exec(code))) consider(m[1]);
  }
  return wanted;
}

function main() {
  if (!fs.existsSync(distVendor)) {
    console.log('[lucide-subset] dist/js/vendor ausente — pulando');
    return;
  }
  if (fs.existsSync(fullUmd)) {
    fs.copyFileSync(fullUmd, path.join(distVendor, 'lucide-full.min.js'));
  }

  let esbuild;
  try { esbuild = require('esbuild'); }
  catch { console.warn('[lucide-subset] esbuild indisponível — mantém lib completa'); return; }

  const pascalMap = buildPascalMap();
  const wanted = collectIcons(pascalMap);
  if (!wanted.size) {
    console.warn('[lucide-subset] nenhum ícone detectado — mantém lib completa');
    return;
  }

  const entries = Array.from(wanted.entries()); // [ [Pascal, spec], ... ]
  const imports = entries.map(([, spec], i) => `import i${i} from '${spec}';`).join('\n');
  const obj = entries.map(([pascal], i) => `  ${JSON.stringify(pascal)}: i${i}`).join(',\n');
  const entry = `
import { createIcons } from 'lucide';
${imports}
var icons = {
${obj}
};
window.lucide = {
  icons: icons,
  createIcons: function (opts) { return createIcons(Object.assign({ icons: icons }, opts || {})); }
};
`;

  const entryFile = path.join(distVendor, '__lucide-entry.mjs');
  fs.writeFileSync(entryFile, entry);
  try {
    const out = esbuild.buildSync({
      entryPoints: [entryFile],
      bundle: true,
      format: 'iife',
      minify: true,
      target: 'es2015',
      absWorkingDir: root,
      write: false,
      legalComments: 'none',
    });
    fs.writeFileSync(path.join(distVendor, 'lucide.min.js'), out.outputFiles[0].text);
    const kb = Math.round(out.outputFiles[0].text.length / 1024);
    console.log('[lucide-subset]', wanted.size, 'ícones →', kb, 'KB (era ~390 KB) · fallback: lucide-full.min.js');
  } catch (e) {
    console.warn('[lucide-subset] falha no bundle — mantém lib completa:', e.message);
  } finally {
    fs.unlinkSync(entryFile);
  }
}

main();
