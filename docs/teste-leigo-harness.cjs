/*
 * teste-leigo-harness.cjs — Teste de usuário leigo (Dona Cleide, 12 meses).
 * Executa a lógica REAL do app (categorizador + motor de IA) sobre lançamentos
 * realistas e imprime as saídas usadas no relatório docs/teste-usuario-leigo.html.
 *
 * Rode a partir da raiz do repo:  node docs/teste-leigo-harness.cjs
 *
 * Obs.: o projeto é "type":"module", então os módulos são copiados para .cjs
 * temporários (força CommonJS) apenas para este teste.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

function loadCjs(relPath) {
  const src = fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
  const tmp = path.join(os.tmpdir(), 'fp_' + relPath.replace(/[\\/]/g, '_') + '.cjs');
  fs.writeFileSync(tmp, src);
  return require(tmp);
}

const CAT  = loadCjs('js/categorizador.js');    // usado 1º pelo formulário
const AUTO = loadCjs('js/auto-categorizer.js'); // fallback
const AI   = loadCjs('js/ai-engine.js');

function detectarComoApp(desc) {
  let r = CAT && CAT.detectar ? CAT.detectar(desc) : null;
  if (!r) r = AUTO && AUTO.detectar ? AUTO.detectar(desc) : null;
  if (!r || !r.categoria) r = { categoria: 'outro', tipo: 'despesa', confianca: 'baixa' };
  return r;
}

const modeloMes = [
  ['Salário', 3200, 'receita', 'salario'], ['Aluguel', 1200, 'despesa', 'moradia'],
  ['Conta de luz', 180, 'despesa', 'moradia'], ['Água', 75, 'despesa', 'moradia'],
  ['Mercado', 520, 'despesa', 'alimentacao'], ['Pão de Açúcar', 180, 'despesa', 'alimentacao'],
  ['Feira', 60, 'despesa', 'alimentacao'], ['Farmácia', 120, 'despesa', 'saude'],
  ['Netflix', 44, 'despesa', 'assinaturas'], ['Gasolina', 200, 'despesa', 'transporte'],
  ['iFood', 55, 'despesa', 'alimentacao'], ['Conta do celular', 60, 'despesa', 'moradia'],
  ['Botijão de gás', 110, 'despesa', 'moradia'], ['Cabelo', 70, 'despesa', 'beleza'],
];
const extras = {
  2: [['Presente pro neto', 150, 'despesa', 'presentes']],
  5: [['Consulta médica', 250, 'despesa', 'saude'], ['Roupa nova', 160, 'despesa', 'vestuario']],
  11: [['Décimo terceiro', 3200, 'receita', 'salario'], ['Natal - ceia', 400, 'despesa', 'alimentacao']],
};
const esquecidos = new Set([3, 8]);
const meses = ['2025-07','2025-08','2025-09','2025-10','2025-11','2025-12','2026-01','2026-02','2026-03','2026-04','2026-05','2026-06'];

let id = 1; const txs = []; const seen = new Map();
let catErr = 0, tipoErr = 0, outro = 0;
meses.forEach((mk, idx) => {
  let itens = esquecidos.has(idx) ? modeloMes.slice(0, 2) : modeloMes.slice();
  if (extras[idx]) itens = itens.concat(extras[idx]);
  itens.forEach((it, k) => {
    const [desc, valor, tipoReal, catReal] = it;
    const det = detectarComoApp(desc);
    if (!seen.has(desc)) seen.set(desc, { desc, det, catReal, tipoReal });
    if (det.categoria !== catReal) catErr++;
    if (det.tipo !== tipoReal) tipoErr++;
    if (det.categoria === 'outro') outro++;
    txs.push({ id: 'c' + (id++), tipo: tipoReal, valor, categoria: det.categoria, data: `${mk}-${String(3 + k).padStart(2, '0')}`, descricao: desc, _tipoApp: det.tipo });
  });
});

console.log('=== CATEGORIZAÇÃO (fluxo real) — descrições distintas ===');
[...seen.values()].forEach((s) => {
  const okC = s.det.categoria === s.catReal, okT = s.det.tipo === s.tipoReal;
  console.log(` ${(!okC || !okT) ? '✗' : 'ok'} "${s.desc}" → cat=${s.det.categoria}${okC ? '' : ' (esperava ' + s.catReal + ')'} tipo=${s.det.tipo}${okT ? '' : ' ✗ESPERAVA ' + s.tipoReal} [${s.det.confianca}]`);
});
console.log(`\n  Lançamentos: ${txs.length} | categoria errada: ${catErr} | TIPO errado: ${tipoErr} | "outro": ${outro}`);

let saldoReal = 0, saldoApp = 0;
txs.forEach((t) => { saldoReal += t.tipo === 'receita' ? t.valor : -t.valor; saldoApp += t._tipoApp === 'receita' ? t.valor : -t.valor; });
console.log(`\n=== IMPACTO NO SALDO (se confiar no tipo auto) ===`);
console.log(`  Saldo REAL: R$ ${saldoReal.toFixed(2)} | App mostraria: R$ ${saldoApp.toFixed(2)} | erro: R$ ${(saldoApp - saldoReal).toFixed(2)}`);

console.log('\n=== SAÚDE / PREVISÃO / PROJEÇÃO ===');
try { console.log('  saúde:', JSON.stringify(AI.calcularSaude(txs, { renda: 3200 }))); } catch (e) { console.log('  saúde ERRO:', e.message); }
try { const p = AI.prever(txs, 3); console.log('  previsão:', p.tendencia, (p.meses || []).map((m) => `${m.mesKey}:rec≈${m.receitaEstimada}`).join(' ')); } catch (e) { console.log('  previsão ERRO:', e.message); }
try { console.log('  projFimMes:', JSON.stringify(AI.projetarFimMes(txs))); } catch (e) { console.log('  projFimMes ERRO:', e.message); }
