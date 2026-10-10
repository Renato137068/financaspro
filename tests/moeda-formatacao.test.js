/**
 * moeda-formatacao.test.js — valor em reais na tela sai pelo UTILS.formatarMoeda.
 *
 * Origem: auditoria de textos (2026-10-09). Os insights, o assistente e a
 * entrada rápida montavam "R$ " + valor.toFixed(2): sem separador de milhar
 * ("R$ 1234,56") e, num caso, com ponto decimal ("R$ 500.00").
 */
const fs = require('fs');
const path = require('path');

const ARQUIVOS = [
  'js/insights.js',
  'js/ai-engine.js',
  'js/previsao.js',
  'js/modules/init-form.js',
  'js/modules/insight-acoes.js',
];

describe('moeda nos textos', () => {
  test.each(ARQUIVOS)('%s não monta "R$ " + toFixed', (rel) => {
    const src = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8')
      // o plano B do PREVISAO._formatarMoeda (catch do toLocaleString) é aceito
      .replace(/catch \(e\) \{\s*return 'R\$ ' \+ valor\.toFixed\(2\)\.replace\('\.', ','\);\s*\}/, '');
    expect(src).not.toMatch(/R\$ ' \+ [^;\n]*toFixed\(2\)/);
    expect(src).not.toMatch(/toFixed\(2\)\.replace\('\.', ?','\)/);
  });

  test('formatarMoeda põe separador de milhar', () => {
    const txt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(1234.5);
    expect(txt.replace(/\s/g, ' ')).toBe('R$ 1.234,50');
  });
});
