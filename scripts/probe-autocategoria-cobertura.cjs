#!/usr/bin/env node
/**
 * probe-autocategoria-cobertura.cjs
 * Corpus realista BR → CATEGORIZADOR + AUTO_CATEGORIZER.
 * Mede hit/miss/conflito vs categoria esperada.
 *
 *   node scripts/probe-autocategoria-cobertura.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');

function loadBrowserScript(rel) {
  const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const sandbox = { console, module: { exports: {} }, exports: {} };
  sandbox.global = sandbox;
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  vm.runInNewContext(code, sandbox, { filename: rel });
  return sandbox;
}

const catSandbox = loadBrowserScript('js/categorizador.js');
const autoSandbox = loadBrowserScript('js/auto-categorizer.js');
const CATEGORIZADOR = catSandbox.CATEGORIZADOR || catSandbox.module.exports;
const AUTO = autoSandbox.AUTO_CATEGORIZER || autoSandbox.CATEGORIAS || autoSandbox.module.exports;

if (!CATEGORIZADOR || typeof CATEGORIZADOR.detectar !== 'function') {
  console.error('CATEGORIZADOR não carregou');
  process.exit(1);
}
if (!AUTO || typeof AUTO.detectar !== 'function') {
  console.error('AUTO_CATEGORIZER não carregou');
  process.exit(1);
}

/** [descricao, catEsperada, tipoEsperado] */
const CORPUS = [
  // Alimentação
  ['iFood Pedido #4821', 'alimentacao', 'despesa'],
  ['Rappi McDonalds', 'alimentacao', 'despesa'],
  ['Mercado Extra Av Paulista', 'alimentacao', 'despesa'],
  ['Padaria Bella Vista', 'alimentacao', 'despesa'],
  ['Starbucks Coffee', 'alimentacao', 'despesa'],
  ['Outback Steakhouse', 'alimentacao', 'despesa'],
  ['Açaí da Praça', 'alimentacao', 'despesa'],
  ['Feira livre domingo', 'alimentacao', 'despesa'],
  ['Carrefour hipermercado', 'alimentacao', 'despesa'],
  ['Assaí Atacadista', 'alimentacao', 'despesa'],
  ['Burger King delivery', 'alimentacao', 'despesa'],
  ['Pão de Açúcar padaria', 'alimentacao', 'despesa'],
  // Transporte
  ['UBER *TRIP HELP.UBER.COM', 'transporte', 'despesa'],
  ['99POP Sao Paulo', 'transporte', 'despesa'],
  ['Posto Shell gasolina', 'transporte', 'despesa'],
  ['Estacionamento Shopping', 'transporte', 'despesa'],
  ['Pedágio CCR AutoBAn', 'transporte', 'despesa'],
  ['Metrô SP bilhete', 'transporte', 'despesa'],
  ['Recarga Bilhete Único', 'transporte', 'despesa'],
  ['IPVA 2026 Fiat', 'impostos', 'despesa'],
  ['Oficina troca de óleo', 'transporte', 'despesa'],
  ['Seguro auto Porto', 'seguros', 'despesa'],
  // Moradia
  ['Aluguel apto 302', 'moradia', 'despesa'],
  ['Condomínio Ed. Aurora', 'moradia', 'despesa'],
  ['Enel energia elétrica', 'moradia', 'despesa'],
  ['Sabesp água', 'moradia', 'despesa'],
  ['Vivo fibra internet', 'moradia', 'despesa'],
  ['Claro celular fatura', 'moradia', 'despesa'],
  ['IPTU parcela 3', 'moradia', 'despesa'],
  ['Botijão de gás', 'moradia', 'despesa'],
  ['Faxina mensal', 'moradia', 'despesa'],
  // Saúde
  ['Drogasil remédios', 'saude', 'despesa'],
  ['Consulta Dr Silva', 'saude', 'despesa'],
  ['Laboratório Fleury', 'saude', 'despesa'],
  ['Plano de saúde Unimed', 'saude', 'despesa'],
  ['Dentista ortodontia', 'saude', 'despesa'],
  ['Academia Smart Fit', 'saude', 'despesa'],
  ['Psicólogo sessão', 'saude', 'despesa'],
  ['Farmácia Drogaraia', 'saude', 'despesa'],
  // Educação
  ['Mensalidade escola', 'educacao', 'despesa'],
  ['Alura assinatura', 'educacao', 'despesa'],
  ['Udemy curso Python', 'educacao', 'despesa'],
  ['Livraria Cultura', 'educacao', 'despesa'],
  ['Material escolar', 'educacao', 'despesa'],
  // Lazer / assinaturas / viagem
  ['Netflix.com', 'assinaturas', 'despesa'],
  ['Spotify Premium', 'assinaturas', 'despesa'],
  ['Disney Plus', 'assinaturas', 'despesa'],
  ['Amazon Prime', 'assinaturas', 'despesa'],
  ['Cinema Cinemark', 'lazer', 'despesa'],
  ['Ingresso Rock in Rio', 'lazer', 'despesa'],
  ['Steam compra jogo', 'lazer', 'despesa'],
  ['Airbnb Rio de Janeiro', 'viagem', 'despesa'],
  ['Hotel Ibis Centro', 'viagem', 'despesa'],
  ['Passagem aérea GOL', 'viagem', 'despesa'],
  // Compras / vestuário / beleza / pet
  ['Amazon Marketplace', 'compras', 'despesa'],
  ['Mercado Livre ML', 'compras', 'despesa'],
  ['Magazine Luiza', 'compras', 'despesa'],
  ['Shopee pedido', 'compras', 'despesa'],
  ['Zara roupa', 'vestuario', 'despesa'],
  ['Renner calça jeans', 'vestuario', 'despesa'],
  ['Nike tênis', 'vestuario', 'despesa'],
  ['Barbearia do Zé', 'beleza', 'despesa'],
  ['Manicure unhas', 'beleza', 'despesa'],
  ['Petz ração cachorro', 'pet', 'despesa'],
  ['Veterinário consulta pet', 'pet', 'despesa'],
  ['Banho e tosa', 'pet', 'despesa'],
  // Financeiro / impostos / seguros
  ['Anuidade cartão Nubank', 'servicos_financeiros', 'despesa'],
  ['Juros cheque especial', 'servicos_financeiros', 'despesa'],
  ['Tarifa TED', 'servicos_financeiros', 'despesa'],
  ['DARF IRPF', 'impostos', 'despesa'],
  ['IOF compra internacional', 'impostos', 'despesa'],
  ['Seguro vida', 'seguros', 'despesa'],
  // Família / doações
  ['Mesada filho', 'familia', 'despesa'],
  ['Creche mensalidade', 'familia', 'despesa'],
  ['Doação ONG', 'doacoes', 'despesa'],
  ['Dízimo igreja', 'doacoes', 'despesa'],
  // Receitas
  ['Salário empresa XYZ', 'salario', 'receita'],
  ['Pagamento holerite', 'salario', 'receita'],
  ['13º salário', 'salario', 'receita'],
  ['Freelance design logo', 'freelance', 'receita'],
  ['Consultoria cliente ACME', 'freelance', 'receita'],
  ['Rendimento CDB Nubank', 'investimentos', 'receita'],
  ['Dividendos ações PETR4', 'investimentos', 'receita'],
  ['Estorno compra Amazon', 'reembolsos', 'receita'],
  ['Cashback Magalu', 'reembolsos', 'receita'],
  ['Vale refeição VR', 'beneficios', 'receita'],
  ['VA alimentação', 'beneficios', 'receita'],
  ['Aluguel recebido apto', 'aluguel_recebido', 'receita'],
  ['Prêmio sorteio', 'premios', 'receita'],
  ['PIX recebido João', 'presentes', 'receita'],
  // Extrato bancário genérico / ambíguo (o que mais falha)
  ['PIX ENVIADO 12.345.678/0001-90', 'outro', 'despesa'],
  ['PAG*JOAO DA SILVA', 'outro', 'despesa'],
  ['COMPRA CARTAO FINAL 1234', 'outro', 'despesa'],
  ['DEB AUTOMATICO', 'outro', 'despesa'],
  ['TED 341', 'outro', 'despesa'],
  ['PG *MP *MERCADOPAGO', 'compras', 'despesa'],
  ['EBN *GOOGLE PLAY', 'assinaturas', 'despesa'],
  ['APPLE.COM/BILL', 'assinaturas', 'despesa'],
  ['MICROSOFT*XBOX', 'assinaturas', 'despesa'],
  ['IFOOD *IFOOD', 'alimentacao', 'despesa'],
  ['RAPPI*BRASIL', 'alimentacao', 'despesa'],
  ['UBER EATS HELP.UBER', 'alimentacao', 'despesa'],
  ['POSTO IPIRANGA', 'transporte', 'despesa'],
  ['RAIZEN COMBUSTIVEIS', 'transporte', 'despesa'],
  ['CPFL ENERGIA', 'moradia', 'despesa'],
  ['COMPANHIA DE SANEAMENTO', 'moradia', 'despesa'],
  ['TIM BRASIL S/A', 'moradia', 'despesa'],
  ['DROGARIA SAO PAULO', 'saude', 'despesa'],
  ['HAPVIDA ASSISTENCIA', 'saude', 'despesa'],
  ['NUBANK NU PAGAMENTOS', 'outro', 'despesa'],
  ['RECARGA CELULAR', 'moradia', 'despesa'],
  ['PARCELA FINANCIAMENTO IMOVEL', 'moradia', 'despesa'],
  ['CONSORCIO HONDA', 'outro', 'despesa'],
  ['EMPRESTIMO PESSOAL', 'servicos_financeiros', 'despesa'],
  ['FGTS SAQUE', 'outro', 'receita'],
  ['RESTITUICAO IR', 'reembolsos', 'receita'],
  ['VENDA OLX bicicleta', 'vendas', 'receita'],
  ['Transferência própria', 'outro', 'despesa'],
  // Typos / linguagem natural
  ['supermercto dia', 'alimentacao', 'despesa'],
  ['uberr até casa', 'transporte', 'despesa'],
  ['neflix mes', 'assinaturas', 'despesa'],
  ['alugel novembro', 'moradia', 'despesa'],
  ['farmacea perto', 'saude', 'despesa'],
];

function pick(engine, desc) {
  const r = engine.detectar(desc);
  if (!r) return { categoria: null, tipo: null, confianca: null };
  return r;
}

function judge(got, expectedCat, expectedTipo) {
  if (!got.categoria) return 'miss';
  if (got.categoria === expectedCat && (!expectedTipo || got.tipo === expectedTipo)) return 'hit';
  if (expectedCat === 'outro') {
    // esperado outro: miss semântico se sugeriu algo específico
    return got.categoria === 'outro' || got.categoria === 'outros' ? 'hit' : 'overfit';
  }
  if (got.categoria === 'outro' || got.categoria === 'outros') return 'fallback_outro';
  return 'wrong';
}

function runEngine(name, engine) {
  const rows = [];
  const tally = { hit: 0, wrong: 0, fallback_outro: 0, miss: 0, overfit: 0 };
  for (const [desc, cat, tipo] of CORPUS) {
    const got = pick(engine, desc);
    const verdict = judge(got, cat, tipo);
    tally[verdict]++;
    rows.push({ desc, expected: cat + '/' + tipo, got: (got.categoria || 'null') + '/' + (got.tipo || '-') + '/' + (got.confianca || '-'), verdict });
  }
  const n = CORPUS.length;
  return { name, n, tally, hitRate: tally.hit / n, rows };
}

function combineFormPath(desc) {
  // Espelha init-form: CATEGORIZADOR primeiro, senão AUTO
  let base = CATEGORIZADOR.detectar(desc);
  if (!base) base = AUTO.detectar(desc);
  return base || { categoria: 'outro', tipo: 'despesa', confianca: 'baixa' };
}

const formEngine = { detectar: combineFormPath };
const results = [
  runEngine('CATEGORIZADOR', CATEGORIZADOR),
  runEngine('AUTO_CATEGORIZER', AUTO),
  runEngine('FORM_PATH (fuzzy→auto)', formEngine),
];

const OUT_DIR = path.join(ROOT, 'docs', 'audit-runs');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
const stamp = '20260912';
const outJson = path.join(OUT_DIR, `autocategoria-cobertura-${stamp}.json`);
const outMd = path.join(OUT_DIR, `autocategoria-cobertura-${stamp}.md`);

const form = results[2];
const gaps = form.rows.filter(r => r.verdict === 'wrong' || r.verdict === 'fallback_outro' || r.verdict === 'miss' || r.verdict === 'overfit');

const md = [
  '# Cobertura da autocategorização — lançamentos',
  '',
  'Corpus: **' + CORPUS.length + '** descrições realistas (extrato + linguagem natural BR).',
  '',
  '## Taxa de acerto',
  '',
  '| Motor | Hit | Errado | Caiu em outro | Miss | Overfit | Hit % |',
  '|-------|-----|--------|---------------|------|---------|-------|',
];
results.forEach(r => {
  md.push('| ' + r.name + ' | ' + r.tally.hit + ' | ' + r.tally.wrong + ' | ' + r.tally.fallback_outro + ' | ' + r.tally.miss + ' | ' + r.tally.overfit + ' | ' + (r.hitRate * 100).toFixed(1) + '% |');
});
md.push('', '## Falhas no caminho do formulário (o que o usuário sente)', '');
if (!gaps.length) md.push('_Nenhuma._');
else {
  md.push('| Descrição | Esperado | Obtido | Veredito |', '|-----------|----------|--------|----------|');
  gaps.forEach(g => {
    md.push('| ' + g.desc + ' | ' + g.expected + ' | ' + g.got + ' | ' + g.verdict + ' |');
  });
}
md.push('', '## Lacunas estruturais remanescentes', '');
md.push('- Textos **totalmente genéricos** de banco (só “PIX ENVIADO”, nome de pessoa) continuam em `outro` de propósito.');
md.push('- O fuzzy ainda erra/omite alguns casos isolados que o regex do AUTO cobre — o formulário combina os dois.');
md.push('- Aprendizado do usuário (correções) e histórico de lançamentos não entram neste probe.');
md.push('');

fs.writeFileSync(outJson, JSON.stringify({ corpusSize: CORPUS.length, results, gaps }, null, 2));
fs.writeFileSync(outMd, md.join('\n'));

console.log(md.join('\n'));
console.log('\n[probe] JSON', outJson);
console.log('[probe] MD  ', outMd);
