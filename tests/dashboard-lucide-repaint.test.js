/**
 * dashboard-lucide-repaint.test.js — P2.2: um único repaint de ícones no ciclo render()
 * @jest-environment node
 */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'render-dashboard.js'), 'utf8');

describe('P2.2 — sem repaints Lucide redundantes no dashboard', function() {
  test('sub-renderers não chamam renderLucideIcons; só renderLucideIconsNow no fim', function() {
    expect(src).toMatch(/renderLucideIconsNow\s*\(/);
    expect(src).not.toMatch(/renderLucideIcons\s*\(/);
    // renderLucideIconsNow contém o prefixo — garantir que não sobrou a forma debounced
    const semNow = src.replace(/renderLucideIconsNow/g, 'ICON_NOW');
    expect(semNow).not.toMatch(/renderLucideIcons/);
  });
});
