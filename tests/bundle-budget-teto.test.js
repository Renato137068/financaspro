/**
 * bundle-budget-teto.test.js — o orçamento do bundle só desce.
 *
 * O check de orçamento (scripts/check-bundle-budget.cjs) existia, mas o teto
 * subia junto com cada feature: sete aumentos só em setembro de 2026, sempre
 * "intencionais". Um limite que acompanha o tamanho não limita nada.
 *
 * Estes valores são o teto máximo aceito. Subir um deles exige editar este
 * arquivo — o que aparece no diff do PR e força a conversa. Descer é livre:
 * quando o bundle encolher, baixe o orçamento e este teto juntos.
 */
const fs = require('fs');
const path = require('path');

const TETO_KB = {
  // 1300→1305 e 260→262 (27/09): supabase-js 2.117; ver check-bundle-budget.cjs.
  // 1305→1280→1240 e 112→85→48 (27/09): telas lazy fora do index.html (telas/).
  precacheTotal: 1232,
  // 514→512 (27/09): a soma passou a incluir a entrada ESM (ADR 0005).
  // 512→507→503 (27–28/09): quarta e quinta fatias ESM.
  appBundle: 503,
  vendorBundle: 262,
  cssBundle: 300,
  indexHtml: 48,
};

const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'check-bundle-budget.cjs'), 'utf8');
const bloco = src.slice(src.indexOf('const BUDGETS = {'), src.indexOf('\n};', src.indexOf('const BUDGETS = {')));

function orcamentoKb(chave) {
  const m = bloco.match(new RegExp('\\n\\s*' + chave + ':\\s*\\{\\s*max:\\s*(\\d+)\\s*\\*\\s*KB'));
  return m ? Number(m[1]) : null;
}

describe('orçamento do bundle', () => {
  test.each(Object.keys(TETO_KB))('%s não passa do teto', (chave) => {
    const atual = orcamentoKb(chave);
    expect(atual).not.toBeNull();
    expect(atual).toBeLessThanOrEqual(TETO_KB[chave]);
  });

  test('nenhum orçamento novo sem teto aqui', () => {
    const chaves = [...bloco.matchAll(/\n\s{2}(\w+):\s*\{\s*max:/g)].map((m) => m[1]);
    expect(chaves.sort()).toEqual(Object.keys(TETO_KB).sort());
  });
});
