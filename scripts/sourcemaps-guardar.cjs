#!/usr/bin/env node
/**
 * sourcemaps-guardar.cjs — tira do dist/ os mapas de código do release.
 *
 * Com FP_SOURCEMAPS=1, o Vite (sourcemap 'hidden') e o bundle-app.cjs gravam os
 * mapas ao lado dos bundles. Eles servem só para traduzir a pilha de um erro
 * relatado (npm run erro:pilha) e não podem ir para o APK nem para o site:
 * publicá-los entregaria o fonte a qualquer visitante. Este passo, no fim do
 * build, move tudo para sourcemaps/ (fora do dist/ e do git); o release guarda
 * a pasta como artefato do GitHub Actions.
 *
 * Sem mapas no dist/ (build normal), não faz nada.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const destino = path.join(root, 'sourcemaps');

const EH_MAPA = /\.js\.map$|\.js\.partes\.json$/;

function listar(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listar(full));
    else if (EH_MAPA.test(ent.name)) out.push(full);
  }
  return out;
}

const mapas = listar(dist);
if (mapas.length === 0) process.exit(0);

fs.rmSync(destino, { recursive: true, force: true });
fs.mkdirSync(destino, { recursive: true });
for (const file of mapas) {
  // Nomes dos bundles são únicos (hash no nome); uma pasta só basta.
  fs.renameSync(file, path.join(destino, path.basename(file)));
}

const sobrou = listar(dist);
if (sobrou.length) {
  console.error('[sourcemaps] mapas ainda no dist/:', sobrou.map((f) => path.relative(root, f)).join(', '));
  process.exit(1);
}
console.log('[sourcemaps]', mapas.length, 'arquivos guardados em sourcemaps/ (fora do dist/)');
