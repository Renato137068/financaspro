#!/usr/bin/env node
/**
 * check-xss-sinks.cjs — guardrail estático anti-XSS (auditoria #7).
 *
 * Falha (exit 1) se algum atribuição a `.innerHTML` interpolar um campo de
 * TEXTO LIVRE do usuário/fonte externa sem passar por uma função de escape.
 *
 * Campos monitorados: descricao, observacao, memo, nota, obs, payee,
 * estabelecimento, e leituras de `.value` de inputs — os que mais provavelmente
 * carregam um payload (ex.: descrições vindas do Open Finance / Belvo).
 *
 * Escapes aceitos: escapeHtml(...), _esc(...), escHtml(...), esc(...).
 *
 * Uso: node scripts/check-xss-sinks.cjs  (0 = limpo, 1 = violação)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const JS_DIR = path.join(__dirname, '..', 'js');
const FIELD = /\.(descricao|observacao|memo|nota|obs|payee|estabelecimento)\b|\binput\.value\b|\btextarea\.value\b/;
const ESC = /(escapeHtml|_esc|escHtml|\besc)\s*\(/;

function walk(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) { if (name !== 'vendor') walk(p, out); }
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

function statements(src) {
  const out = [];
  const re = /\.innerHTML\s*=/g;
  let m;
  while ((m = re.exec(src))) {
    const seg = src.slice(m.index + m[0].length, m.index + m[0].length + 2000);
    const end = seg.indexOf(';');
    out.push({ pos: m.index, text: end !== -1 ? seg.slice(0, end + 1) : seg.slice(0, 400) });
  }
  return out;
}

const files = walk(JS_DIR, []);
const violations = [];

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  for (const st of statements(src)) {
    let mm;
    const fieldRe = new RegExp(FIELD.source, 'g');
    while ((mm = fieldRe.exec(st.text))) {
      const before = st.text.slice(Math.max(0, mm.index - 60), mm.index);
      if (!ESC.test(before)) {
        const line = src.slice(0, st.pos).split('\n').length;
        violations.push(`${path.relative(path.join(__dirname, '..'), f)}:${line}  campo [${mm[0]}] sem escape em innerHTML`);
      }
    }
  }
}

if (violations.length) {
  console.error('[check-xss] ✗ ' + violations.length + ' sink(s) innerHTML com dado de usuário SEM escape:');
  violations.forEach((v) => console.error('  - ' + v));
  console.error('\nEnvolva o campo em UTILS.escapeHtml(...) (ou _esc/escHtml) antes de inserir no innerHTML.');
  process.exit(1);
}

console.log('[check-xss] ✓ nenhum sink innerHTML com texto livre de usuário sem escape (' + files.length + ' arquivos verificados)');
