#!/usr/bin/env node
/**
 * apply-param-validation.cjs — insere validateParams() nas rotas com path params.
 *
 * Script de migração pontual (idempotente): percorre backend/routes/, encontra
 * rotas cujo caminho contém :id / :orgId / :userId / :token e injeta o
 * middleware de validação logo após o caminho, além de ajustar o import.
 *
 * Rodar de novo é seguro — rotas já validadas são ignoradas.
 */
const fs = require('fs');
const path = require('path');

const ROUTES_DIR = path.join(__dirname, '..', 'backend', 'routes');

// Mapeia o conjunto de params presentes no caminho → schema a aplicar.
const SCHEMA_FOR = [
  { test: p => p.includes(':orgId') && p.includes(':userId'), schema: 'orgMemberParamSchema' },
  { test: p => p.includes(':orgId'), schema: 'orgIdParamSchema' },
  { test: p => p.includes(':token'), schema: 'tokenParamSchema' },
  { test: p => p.includes(':id'), schema: 'idParamSchema' },
];

function schemaFor(routePath) {
  const hit = SCHEMA_FOR.find(s => s.test(routePath));
  return hit ? hit.schema : null;
}

/** Garante que os nomes usados estejam importados de ../middleware/validate.js. */
function ensureImports(src, needed) {
  const importRe = /import\s*\{([^}]*)\}\s*from\s*'\.\.\/middleware\/validate\.js';/;
  const match = src.match(importRe);

  if (match) {
    const current = match[1].split(',').map(s => s.trim()).filter(Boolean);
    const merged = [...new Set([...current, ...needed])];
    if (merged.length === current.length) return src;
    return src.replace(importRe, `import { ${merged.join(', ')} } from '../middleware/validate.js';`);
  }

  // Sem import ainda: insere após o último import do arquivo.
  const lines = src.split('\n');
  let last = -1;
  lines.forEach((l, i) => { if (/^import\s/.test(l)) last = i; });
  lines.splice(last + 1, 0, `import { ${needed.join(', ')} } from '../middleware/validate.js';`);
  return lines.join('\n');
}

let totalRoutes = 0;
let totalFiles = 0;

for (const file of fs.readdirSync(ROUTES_DIR).filter(f => f.endsWith('.js'))) {
  const full = path.join(ROUTES_DIR, file);
  let src = fs.readFileSync(full, 'utf8');
  const needed = new Set();
  let changed = 0;

  // router.get('/:id', ...) → router.get('/:id', validateParams(idParamSchema), ...)
  src = src.replace(
    /(router\.(?:get|post|put|patch|delete)\(\s*)('[^']*')(\s*,)/g,
    (whole, head, routePath, tail) => {
      if (!routePath.includes(':')) return whole;
      const schema = schemaFor(routePath);
      if (!schema) return whole;
      // Idempotência: se já há validateParams logo em seguida, não duplica.
      const after = src.slice(src.indexOf(whole) + whole.length, src.indexOf(whole) + whole.length + 60);
      if (after.includes('validateParams')) return whole;
      needed.add('validateParams');
      needed.add(schema);
      changed++;
      return `${head}${routePath}${tail} validateParams(${schema}),`;
    },
  );

  if (changed > 0) {
    src = ensureImports(src, [...needed]);
    fs.writeFileSync(full, src, 'utf8');
    console.log(`[params] ${file}: ${changed} rota(s) protegida(s)`);
    totalRoutes += changed;
    totalFiles++;
  }
}

console.log(`[params] ${totalRoutes} rotas em ${totalFiles} arquivos`);
