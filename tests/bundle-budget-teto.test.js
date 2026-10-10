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
  // 1232→1205 (29/09): DADOS vira ES Module; primeiros chunks ES Module.
  // 1205→1180 e 300→253 (30/09): CSS das telas sob demanda chega com o chunk.
  // 1180→1110 e 253→184 (1º/out): CSS de Extrato, Orçamento e Perfil no chunk.
  // 1110→1082 (02/10): saem o cliente da API Express e o sync v2 (ADR 0007).
  // 1082→1087 (08/10): segurança (PR 108) e acessibilidade (PR 109) juntas.
  // 1082→1086 e 450→453 (09/10): correções de perda de dado na sincronização
  // e no IndexedDB (auditoria de integridade); ver check-bundle-budget.cjs.
  // 1086→1088 e 453→455 (09/10): botão voltar do Android e aviso sem internet.
  // 1088→1090 (10/10): primeiro uso e cadastro (auditorias de 09/10).
  precacheTotal: 1090,
  // 514→512 (27/09): a soma passou a incluir a entrada ESM (ADR 0005).
  // 512→507→503 (27–28/09): quarta e quinta fatias ESM.
  // 503→478 (29/09): idem.
  // 478→450 (02/10): saem o cliente da API Express e o sync v2 (ADR 0007).
  // 450→454 (08/10): idem (452 KB medidos).
  // 455→456 (10/10): atalho do ícone no Android e marcos do funil.
  appBundle: 456,
  vendorBundle: 262,
  cssBundle: 184,
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
