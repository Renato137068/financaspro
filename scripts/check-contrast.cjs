#!/usr/bin/env node
/**
 * check-contrast.cjs — verifica contraste WCAG 2.1 dos tokens de cor.
 *
 * Por que existe: uma auditoria manual encontrou quatro cores semânticas
 * reprovando AA — o botão de alerta chegava a 2,15:1, contra o mínimo de 4,5:1.
 * Sem verificação automática, a próxima cor adicionada reintroduz o problema, e
 * a auditoria manual seguinte pode demorar anos.
 *
 * Lê os tokens de css/design-system.css (bloco :root, tema claro) e de
 * css/themes/dark-mode.css, resolve as referências var() e checa cada par
 * declarado em PARES abaixo.
 *
 * Uso:
 *   node scripts/check-contrast.cjs            # falha se algum par reprovar
 *   node scripts/check-contrast.cjs --report   # só relata, sai 0
 */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const reportOnly = process.argv.includes('--report');

const AA_TEXTO = 4.5;   // texto normal
const AA_UI = 3.0;      // componente de interface e texto grande

// ─── leitura dos tokens ──────────────────────────────────────────────────────

/** Extrai `--nome: valor` de um bloco CSS. */
function lerTokens(css, seletor) {
  const re = new RegExp(`${seletor}\\s*\\{([\\s\\S]*?)\\n\\}`);
  const m = css.match(re);
  if (!m) return {};
  const out = {};
  for (const [, nome, valor] of m[1].matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
    out[nome] = valor.trim();
  }
  return out;
}

/** Resolve `var(--x)` recursivamente até chegar num valor literal. */
function resolver(tokens, valor, profundidade = 0) {
  if (profundidade > 10) return null;
  const m = String(valor).match(/^var\(--([a-z0-9-]+)\)$/);
  if (!m) return valor;
  const alvo = tokens[m[1]];
  return alvo === undefined ? null : resolver(tokens, alvo, profundidade + 1);
}

function paraRgb(cor) {
  if (!cor) return null;
  const hex = String(cor).trim();
  let m = hex.match(/^#([0-9a-f]{6})$/i);
  if (m) {
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  m = hex.match(/^#([0-9a-f]{3})$/i);
  if (m) {
    const [r, g, b] = m[1].split('');
    return [parseInt(r + r, 16), parseInt(g + g, 16), parseInt(b + b, 16)];
  }
  m = hex.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+)\s*)?\)$/i);
  if (m) {
    const canal = (v) => Math.max(0, Math.min(255, Math.round(parseFloat(v))));
    const alfa = m[4] === undefined ? 1 : Math.max(0, Math.min(1, parseFloat(m[4])));
    return [canal(m[1]), canal(m[2]), canal(m[3]), alfa];
  }
  return null; // gradientes e afins continuam fora da checagem
}

/**
 * Compoe uma cor semitransparente sobre uma base opaca.
 *
 * Sem isto, todo token em rgba() era "sem valor hex resolvivel" e saia da
 * checagem em silencio -- que foi exatamente como o chip de categoria do
 * extrato passou despercebido: --color-bg-primary e rgba(0,114,63,.08), o
 * script pulava, e o texto de apoio ficava em 4,2:1 sobre o verde resultante.
 * Um check que pula sozinho e pior que nenhum, porque parece cobertura.
 */
function compor(cor, base) {
  if (!cor) return null;
  const alfa = cor.length > 3 ? cor[3] : 1;
  if (alfa >= 1) return [cor[0], cor[1], cor[2]];
  if (!base) return null;
  return [0, 1, 2].map((i) => Math.round(cor[i] * alfa + base[i] * (1 - alfa)));
}

// ─── cálculo WCAG 2.1 ────────────────────────────────────────────────────────

function luminancia([r, g, b]) {
  const canal = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

function razao(a, b) {
  const la = luminancia(a);
  const lb = luminancia(b);
  const claro = Math.max(la, lb);
  const escuro = Math.min(la, lb);
  return (claro + 0.05) / (escuro + 0.05);
}

// ─── pares verificados ───────────────────────────────────────────────────────
// Cada entrada descreve uma combinação que EXISTE na interface.

const PARES_CLARO = [
  // texto sobre superfícies
  ['color-text-primary', 'color-bg-card', AA_TEXTO, 'texto principal em card'],
  ['color-text-primary', 'color-bg-page', AA_TEXTO, 'texto principal na página'],
  ['color-text-secondary', 'color-bg-card', AA_TEXTO, 'texto secundário em card'],
  ['color-text-muted', 'color-bg-card', AA_TEXTO, 'texto de apoio em card'],
  ['color-text-muted', 'color-bg-page', AA_TEXTO, 'texto de apoio na página'],

  // semântica como TEXTO — foi aqui que a auditoria encontrou as falhas
  ['color-success-text', 'color-bg-card', AA_TEXTO, 'status positivo em card'],
  ['color-warning-text', 'color-bg-card', AA_TEXTO, 'status de atenção em card'],
  ['color-danger-text', 'color-bg-card', AA_TEXTO, 'status negativo em card'],
  ['color-info-text', 'color-bg-card', AA_TEXTO, 'status informativo em card'],
  ['color-success-text', 'color-bg-page', AA_TEXTO, 'status positivo na página'],
  ['color-warning-text', 'color-bg-page', AA_TEXTO, 'status de atenção na página'],
  ['color-danger-text', 'color-bg-page', AA_TEXTO, 'status negativo na página'],

  // texto branco sobre fundo de botão
  ['color-text-inverse', 'color-primary-500', AA_TEXTO, 'botão primário'],
  ['color-text-inverse', 'color-success-on-light', AA_TEXTO, 'botão de confirmação'],
  ['color-text-inverse', 'color-warning-on-light', AA_TEXTO, 'botão de alerta'],
  ['color-text-inverse', 'color-danger-on-light', AA_TEXTO, 'botão destrutivo'],

  // superfícies TINGIDAS — o buraco que a auditoria de 22/08 encontrou.
  //
  // Os pares acima cobriam texto sobre branco e sobre o fundo da página. Só que
  // texto de apoio também aparece sobre tinta: os chips de categoria do extrato
  // (.ext-tx-meta-tag, background --color-bg-primary) e legendas sobre cards com
  // fundo verde-claro. Ali o axe mediu 4,21:1 e 4,25:1, abaixo do mínimo AA.
  //
  // Ressalva honesta: mesmo com estes pares, este script sozinho NÃO teria
  // reprovado a cor antiga — daria 4,58:1, logo acima do limite. Ele compõe um
  // nível de transparência sobre o card; na tela a pilha é mais profunda (chip
  // tingido sobre card sobre página tingida), e cada camada tira um pouco mais.
  // Quem mede a pilha real é o axe, no e2e/accessibility.spec.cjs. O valor
  // destes pares é outro: eles impedem que um token tingido volte a sair da
  // checagem em silêncio, e dão o sinal de que a margem está apertada.
  ['color-text-muted', 'color-bg-primary', AA_TEXTO, 'texto de apoio em chip tingido'],
  ['color-text-secondary', 'color-bg-primary', AA_TEXTO, 'texto secundário em chip tingido'],
  ['color-text-primary', 'color-bg-primary', AA_TEXTO, 'texto principal em chip tingido'],
  ['color-text-muted', 'color-primary-50', AA_TEXTO, 'texto de apoio sobre tinta clara'],

  // borda e elemento não textual: exigência menor (1.4.11)
  ['color-border-focus', 'color-bg-card', AA_UI, 'anel de foco'],
];

const PARES_ESCURO = [
  ['color-success-text', 'color-bg-dark-card', AA_TEXTO, 'status positivo (escuro)'],
  ['color-warning-text', 'color-bg-dark-card', AA_TEXTO, 'status de atenção (escuro)'],
  ['color-danger-text', 'color-bg-dark-card', AA_TEXTO, 'status negativo (escuro)'],
  ['color-info-text', 'color-bg-dark-card', AA_TEXTO, 'status informativo (escuro)'],
  ['color-success-text', 'color-bg-dark-elevated', AA_TEXTO, 'status positivo (elevado)'],
  ['color-danger-text', 'color-bg-dark-elevated', AA_TEXTO, 'status negativo (elevado)'],
];

// ─── execução ────────────────────────────────────────────────────────────────

const dsCss = fs.readFileSync(path.join(root, 'css', 'design-system.css'), 'utf8');
const darkCss = fs.readFileSync(path.join(root, 'css', 'themes', 'dark-mode.css'), 'utf8');

const tokensClaro = lerTokens(dsCss, ':root');
const tokensEscuro = { ...tokensClaro, ...lerTokens(darkCss, '\\[data-theme="dark"\\]') };

function verificar(pares, tokens, rotuloTema, tokenBase) {
  const linhas = [];
  const falhas = [];
  const pulados = [];

  // Superficie opaca sob os tokens semitransparentes: um chip com 8% de verde
  // esta, na pratica, sobre o card.
  const base = paraRgb(resolver(tokens, tokens[tokenBase]));

  for (const [frente, fundo, minimo, descricao] of pares) {
    const cf = compor(paraRgb(resolver(tokens, tokens[frente])), base);
    const cb = compor(paraRgb(resolver(tokens, tokens[fundo])), base);

    if (!cf || !cb) { pulados.push(`${descricao} (${frente} / ${fundo})`); continue; }

    const r = razao(cf, cb);
    const ok = r >= minimo;
    if (!ok) falhas.push({ descricao, frente, fundo, r, minimo });
    linhas.push(`  ${ok ? '✓' : '✗'} ${descricao.padEnd(32)} ${r.toFixed(2).padStart(6)}:1  (min ${minimo})`);
  }

  console.log(`\n[contraste] ${rotuloTema}`);
  linhas.forEach((l) => console.log(l));
  if (pulados.length) {
    console.log(`  – ${pulados.length} par(es) sem valor hex resolvível, ignorado(s)`);
  }
  return falhas;
}

console.log('\n[contraste] Verificação WCAG 2.1 dos tokens de cor');

const falhas = [
  ...verificar(PARES_CLARO, tokensClaro, 'Tema claro', 'color-bg-card'),
  ...verificar(PARES_ESCURO, tokensEscuro, 'Tema escuro', 'color-bg-dark-card'),
];

if (falhas.length && !reportOnly) {
  console.error('\n[contraste] ✗ pares abaixo do mínimo WCAG AA:\n');
  for (const f of falhas) {
    console.error(`   · ${f.descricao}: ${f.r.toFixed(2)}:1 (mínimo ${f.minimo}:1)`);
    console.error(`     ${f.frente} sobre ${f.fundo}`);
  }
  console.error('\n  Use os tokens --color-*-text para texto e --color-*-on-light para');
  console.error('  fundo de botão. Os tons vivos (--color-success, --color-warning...)');
  console.error('  servem apenas para preenchimento não textual.\n');
  process.exit(1);
}

console.log(`\n[contraste] ✓ ${PARES_CLARO.length + PARES_ESCURO.length} pares dentro do WCAG AA\n`);
