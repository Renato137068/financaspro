/**
 * plan-limits-parity.test.js (backend) — PLAN_LIMITS do Express vs config/plan-limits.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLAN_LIMITS } from '../../backend/middleware/plan.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../..');
const CANONICAL = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'config/plan-limits.json'), 'utf8'),
);

/**
 * A lista de campos vem do proprio JSON, nao de uma copia aqui.
 *
 * Uma lista fixa envelhece em silencio: quando `reportExport` virou
 * `exportCsv`/`exportPdf`, o teste continuou verde comparando `undefined` com
 * `undefined` dos dois lados. Derivar do canonico faz um campo novo ser
 * cobrado automaticamente, que e o unico jeito de a paridade nao mentir.
 */
function camposDe(tier) {
  return Object.keys(CANONICAL[tier]);
}

function normNumeric(value) {
  if (value === null || value === undefined || value === Infinity) return null;
  return value;
}

describe('backend/middleware/plan.js — paridade com config/plan-limits.json', function() {
  ['FREE', 'PRO', 'BUSINESS'].forEach(function(tier) {
    test(tier, function() {
      const src = PLAN_LIMITS[tier];
      const expected = CANONICAL[tier];
      const campos = camposDe(tier);

      // Guarda contra teste vazio: se o JSON perder o tier, o forEach abaixo
      // passaria sem checar nada.
      expect(campos.length).toBeGreaterThan(15);

      campos.forEach(function(field) {
        const atual = typeof src[field] === 'number'
          ? normNumeric(src[field])
          : src[field];
        expect(atual).toBe(expected[field]);
      });
    });

    test(tier + ' — o backend não inventa campo fora do canônico', function() {
      const extras = Object.keys(PLAN_LIMITS[tier]).filter(function(k) {
        return !(k in CANONICAL[tier]);
      });
      expect(extras).toEqual([]);
    });
  });
});
