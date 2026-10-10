#!/usr/bin/env node
/**
 * check-bundle-budget.cjs — orçamento de peso do build de produção.
 *
 * Regressão de performance é invisível: ninguém abre um PR dizendo "isto
 * adiciona 300 KB ao primeiro acesso". Este script torna o custo explícito e
 * falha o CI quando um limite é ultrapassado.
 *
 * O número que mais importa é o PRECACHE TOTAL: é exatamente quantos bytes o
 * service worker baixa no primeiro acesso, antes de o usuário conseguir usar
 * qualquer coisa — tipicamente em 4G, num celular modesto.
 *
 * Uso:
 *   node scripts/check-bundle-budget.cjs            # falha se estourar
 *   node scripts/check-bundle-budget.cjs --report   # só relata, sai 0
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const reportOnly = process.argv.includes('--report');

const KB = 1024;

// Limites com pouca folga sobre o valor atual. Desde 27/09 o teto só DESCE:
// tests/bundle-budget-teto.test.js trava os valores. Feature nova que não cabe
// vai para um chunk sob demanda (CHUNKS_ESM em js/core/lazy-load.js) ou paga o
// espaço tirando algo do eager — subir o teto a cada feature virou carimbo
// (sete aumentos só em setembro, histórico abaixo).
const BUDGETS = {
  // 1350→1360 KB (2026-09-12): acompanha o +7 KB do index.html da
  // reestruturação da aba Perfil, mantendo folga em vez de ficar no limite.
  // 1360→1370 KB (2026-09-13): acompanha o +10 KB do appBundle abaixo.
  // 1370→1385 KB (2026-09-15): acompanha o +10 KB do appBundle (tags/marcadores).
  // 1385→1400 KB (2026-09-20): acompanha o +10 KB do appBundle (simulador financeiro).
  // 1400→1410 KB (2026-09-21): insight de meta + nota "cabe no seu mês" no
  // simulador (dados reais) — aumento intencional.
  // 1410→1415 KB (2026-09-21): confirmar fatura vencida como "ainda devo"
  // (contabiliza contra o limite/comprometido) — aumento intencional.
  // 1415→1418 KB (2026-09-21): alerta de fatura vencida no topo do dashboard
  // (lembrete básico que leva às faturas) — aumento intencional.
  // 1418→1392 KB (2026-09-27): simulador e tour de boas-vindas viram chunks lazy.
  // 1392→1300 KB (2026-09-27): Extrato, Orçamento e Perfil viram chunks lazy.
  // 1300→1305 KB (2026-09-27): supabase-js 2.112 → 2.117 (+6 KB no vendor).
  // Exceção registrada: o ganho do dia (1418 → 1305) paga a atualização da
  // biblioteca de login e sync, que não se encolhe por aqui.
  // 1305→1280 KB (2026-09-27): Orçamento e quatro sub-telas do Perfil saem do
  // index.html e vêm com o chunk (telas/, js/core/telas.js).
  // 1280→1240 KB (2026-09-27): Extrato e as demais telas do Perfil também
  // saem do index.html (segunda leva de telas/).
  // 1240→1236→1232 KB (2026-09-27/28): quarta e quinta fatias ESM (o Vite minifica melhor os módulos).
  // 1232→1205 KB (2026-09-29): DADOS vira ES Module (−28 KB) e os primeiros
  // chunks sob demanda ES Module (+1 KB do carregador).
  // 1205→1180 KB (2026-09-30): CSS das telas sob demanda (onboarding,
  // assinaturas, relatórios, patrimônio, simulador, Open Finance, paywall)
  // chega com o chunk (TELAS.estilo, scripts/generate-telas.cjs).
  // 1180→1110 KB (2026-10-01): a parte das folhas de Extrato, Orçamento e
  // Perfil que só essas telas desenham chega com o chunk (layouts/*-tela.css).
  // 1110→1082 KB (2026-10-02): sai o cliente da API Express e o sync v2
  // (ADR 0007): 1106 → 1079 KB.
  // 1082→1086/1083 KB (2026-10-08): segurança (PR 108) e acessibilidade (PR 109)
  // juntas; teto final acertado na consolidação.
  // 1082→1086 KB (2026-10-09): auditoria de integridade de dados — exclusão
  // e edição feitas sem rede chegam à nuvem, gravação no IndexedDB que falha
  // avisa em vez de sumir (1085 KB). Correção de perda de dado, não feature.
  // 1086→1088 KB (2026-10-09): botão voltar do Android (capacitor-init.js) e
  // aviso de primeiro acesso sem internet (1087 KB).
  // 1088→1090 KB (2026-10-10): auditorias de testes, servidor e retenção —
  // cadastro que mostra o próprio título, aviso de renda no primeiro gasto,
  // guia "Comece aqui" sem o passo do perfil, pull ordenado (1088 KB).
  precacheTotal: { max: 1090 * KB, label: 'Precache total (1º acesso)' },
  // 580→590 KB (2026-09-13): correção do KPI "Folga poupança" no Orçamento
  // (cálculo da folga da fatia de poupança) + referência de ritmo no Resumo
  // adicionam alguns KB de código — aumento intencional.
  // 590→600 KB (2026-09-15): feature de tags/marcadores nos lançamentos
  // (núcleo em transacoes.js + form + filtro no extrato) — aumento intencional.
  // 600→615 KB (2026-09-20): simulador financeiro (simulador.js + init-simulador.js:
  // à vista vs parcelado, juros compostos e financiamento) — aumento intencional.
  // 615→620 KB (2026-09-21): insight proativo de meta fora do ritmo + botão
  // "Criar meta no app" no simulador — aumento intencional.
  // 620→626 KB (2026-09-21): compartilhar "meu mês" e "plano de metas"
  // (resumo-mensal.js + plano-metas.js + handlers) — aumento intencional.
  // 626→628 KB (2026-09-21): "ainda devo" nas faturas + alerta de fatura
  // vencida no dashboard — aumento intencional.
  // 628→604 KB (2026-09-27): simulador (19 KB) e onboarding (8 KB) saem do
  // eager para js/lazy/. Daqui para baixo, só com mais chunks lazy.
  // 604→514 KB (2026-09-27): telas de Extrato (34 KB), Orçamento (21 KB) e
  // Perfil (37 KB) viram chunks lazy; ícones de categoria e ações de insight
  // ficam no eager (categoria-visual.js, insight-acoes.js).
  // 503→478 KB (2026-09-29): DADOS vira ES Module (o Vite minifica melhor) e
  // os primeiros chunks sob demanda ES Module.
  // 478→450 KB (2026-10-02): saem o cliente da API Express (dados-express.js)
  // e o sync v2, que só existia para ela (sync-engine.js) — ADR 0007. 475 →
  // 447 KB: a meta de 450 KB das auditorias de 30/09 e 1º/10.
  // 507→503 KB (2026-09-28): quinta fatia ESM (restante do domínio eager).
  // 512→507 KB (2026-09-27): quarta fatia ESM (utilitários e lançamentos).
  // 514→512 KB (2026-09-27): ícones de categoria e os services de transação
  // e orçamento viram ES Modules; o polyfill de modulepreload fica de fora.
  // Desde a fundação de ES Modules (ADR 0005), o código eager do app vem em
  // dois arquivos: app.bundle.js (scripts clássicos) e js/index-<hash>.js (a
  // entrada ESM que o Vite gera). O teto vale para a soma: migrar um módulo de
  // um para o outro não abre espaço.
  // 450→454 KB (2026-10-08): mesmas correções de segurança (452 KB).
  // 450→453 KB (2026-10-09): mesmas correções de integridade (452 KB).
  // 453→455 KB (2026-10-09): botão voltar do Android e aviso sem internet (454 KB).
  appBundle: { max: 455 * KB, label: 'App eager (clássico + ESM)', glob: /^js\/(app\.bundle|index-[\w-]+)\.js$/ },
  // 260→262 KB (2026-09-27): supabase-js 2.112 → 2.117. O vendor é só
  // supabase-js + lucide; não há o que mover para lazy aqui.
  vendorBundle: { max: 262 * KB, label: 'js/vendor.bundle.js', file: 'js/vendor.bundle.js' },
  // 300→253 KB (2026-09-30): as folhas usadas só por telas de chunk saem do
  // CSS do primeiro acesso (277 → 250 KB) e chegam com o chunk.
  // 253→184 KB (2026-10-01): Extrato, Orçamento e Perfil também (250 → 181 KB).
  cssBundle: { max: 184 * KB, label: 'CSS bundle', glob: /^css\/index-.*\.css$/ },
  // 100→112 KB (2026-09-12): reestruturação da aba Perfil em menu + sub-telas
  // (divulgação progressiva) adiciona ~7 KB de markup — aumento intencional.
  // 112→85 KB (2026-09-27): telas usadas só por um chunk lazy (Orçamento,
  // Categorias, Ajuda, Suporte, Editar perfil) moram em telas/ e chegam com o
  // chunk; o index.html guarda só a casca de cada uma.
  // 85→48 KB (2026-09-27): segunda leva — Extrato, Perfil (menu), Conta,
  // Segurança, Conexões, Preferências, Dados, Bancos e a casca do Simulador.
  indexHtml: { max: 48 * KB, label: 'index.html', file: 'index.html' },
};

function size(rel) {
  const full = path.join(dist, rel);
  return fs.existsSync(full) ? fs.statSync(full).size : 0;
}

function findByPattern(re) {
  const results = [];
  (function walk(dir, prefix) {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
      if (ent.isDirectory()) walk(path.join(dir, ent.name), rel);
      else if (re.test(rel)) results.push(rel);
    }
  })(dist, '');
  return results;
}

/** Soma o peso real das URLs listadas no precache do service worker. */
function precacheStats() {
  const swPath = path.join(dist, 'sw.js');
  if (!fs.existsSync(swPath)) return null;

  const sw = fs.readFileSync(swPath, 'utf8');
  const bloco = sw.match(/const urlsParaCache = (\[[\s\S]*?\]);/);
  if (!bloco) return null;

  let urls;
  try { urls = JSON.parse(bloco[1]); } catch { return null; }

  let total = 0;
  const ausentes = [];
  const itens = [];
  // "/" e "/index.html" apontam para o mesmo arquivo — contar as duas entradas
  // inflaria o total em ~80 KB e daria uma falsa sensação de folga.
  const jaContado = new Set();

  for (const url of urls) {
    const rel = url.replace(/^\//, '') || 'index.html';
    if (jaContado.has(rel)) continue;
    jaContado.add(rel);

    const bytes = size(rel);
    if (bytes === 0) ausentes.push(url);
    else { total += bytes; itens.push([rel, bytes]); }
  }

  itens.sort((a, b) => b[1] - a[1]);
  return { total, count: urls.length, ausentes, itens };
}

function fmt(bytes) {
  return `${(bytes / KB).toFixed(0)} KB`;
}

if (!fs.existsSync(dist)) {
  console.error('[bundle-budget] dist/ ausente — rode `npm run build` antes.');
  process.exit(reportOnly ? 0 : 1);
}

const falhas = [];
console.log('\n[bundle-budget] Orçamento do build de produção\n');

const pc = precacheStats();
if (pc) {
  const b = BUDGETS.precacheTotal;
  const ok = pc.total <= b.max;
  if (!ok) falhas.push(`${b.label}: ${fmt(pc.total)} (limite ${fmt(b.max)})`);
  console.log(`  ${ok ? '✓' : '✗'} ${b.label.padEnd(30)} ${fmt(pc.total).padStart(9)}  / ${fmt(b.max)}  (${pc.count} URLs)`);

  if (pc.ausentes.length) {
    console.log(`\n  ⚠ ${pc.ausentes.length} URL(s) no precache não existem em dist/:`);
    pc.ausentes.slice(0, 5).forEach(u => console.log(`      ${u}`));
    falhas.push(`precache referencia ${pc.ausentes.length} arquivo(s) inexistente(s)`);
  }
} else {
  console.log('  ⚠ não foi possível ler o precache de dist/sw.js');
}

for (const [, b] of Object.entries(BUDGETS)) {
  if (!b.file && !b.glob) continue;
  const bytes = b.file ? size(b.file) : findByPattern(b.glob).reduce((s, f) => s + size(f), 0);
  if (bytes === 0) { console.log(`  – ${b.label.padEnd(30)} ${'ausente'.padStart(9)}`); continue; }
  const ok = bytes <= b.max;
  if (!ok) falhas.push(`${b.label}: ${fmt(bytes)} (limite ${fmt(b.max)})`);
  console.log(`  ${ok ? '✓' : '✗'} ${b.label.padEnd(30)} ${fmt(bytes).padStart(9)}  / ${fmt(b.max)}`);
}

if (pc && pc.itens.length) {
  console.log('\n  Maiores itens do precache:');
  pc.itens.slice(0, 8).forEach(([rel, bytes]) => {
    console.log(`      ${fmt(bytes).padStart(9)}  ${rel}`);
  });
}

if (falhas.length && !reportOnly) {
  console.error('\n[bundle-budget] ✗ orçamento estourado:\n');
  falhas.forEach(f => console.error(`   · ${f}`));
  console.error('\n  Se o aumento for intencional, ajuste BUDGETS neste script');
  console.error('  no mesmo commit — assim a decisão fica registrada no histórico.\n');
  process.exit(1);
}

console.log(`\n[bundle-budget] ✓ dentro do orçamento\n`);
