#!/usr/bin/env node
/**
 * generate-frontend-globals.cjs — lista os globais que o frontend declara.
 *
 * O app é uma coleção de scripts clássicos: cada `var DADOS = {…}` no topo de
 * um arquivo vira global e é usado pelos outros sem import. Sem uma lista
 * desses nomes, o ESLint não consegue aplicar `no-undef` em js/**, e um nome
 * digitado errado (`DADSO.salvar`) só aparece em tempo de execução.
 *
 * Este script lê cada arquivo de js/ (menos js/vendor) como script e coleta as
 * declarações de topo — var/let/const, function e class — e as atribuições
 * explícitas `window.NOME = …`. O resultado vai para
 * config/frontend-globals.json, que o eslint.config.cjs usa como `globals`.
 *
 *   node scripts/generate-frontend-globals.cjs          # regrava o JSON
 *   node scripts/generate-frontend-globals.cjs --check  # falha se estiver defasado
 */
const fs = require('fs');
const path = require('path');
const espree = require('espree');

const root = path.join(__dirname, '..');
const jsDir = path.join(root, 'js');
const outPath = path.join(root, 'config', 'frontend-globals.json');

// Globais que vêm de bibliotecas de terceiros (js/vendor) ou do runtime nativo.
const EXTERNOS = ['lucide', 'supabase', 'Capacitor'];

function arquivosJs(dir) {
  const saida = [];
  for (const nome of fs.readdirSync(dir)) {
    const p = path.join(dir, nome);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (nome === 'vendor') continue;
      saida.push(...arquivosJs(p));
    } else if (nome.endsWith('.js')) {
      saida.push(p);
    }
  }
  return saida.sort();
}

function nomesDoPadrao(id, alvo) {
  if (!id) return;
  if (id.type === 'Identifier') alvo.add(id.name);
  else if (id.type === 'ObjectPattern') id.properties.forEach((p) => nomesDoPadrao(p.value || p.argument, alvo));
  else if (id.type === 'ArrayPattern') id.elements.forEach((e) => nomesDoPadrao(e, alvo));
}

/** `window.NOME = …` em qualquer profundidade (exporta para os outros scripts). */
function coletarWindowAssign(no, alvo) {
  if (!no || typeof no !== 'object') return;
  if (Array.isArray(no)) { no.forEach((n) => coletarWindowAssign(n, alvo)); return; }
  if (no.type === 'AssignmentExpression'
      && no.left.type === 'MemberExpression'
      && !no.left.computed
      && no.left.object.type === 'Identifier'
      && (no.left.object.name === 'window' || no.left.object.name === 'globalThis')
      && no.left.property.type === 'Identifier') {
    alvo.add(no.left.property.name);
  }
  for (const k of Object.keys(no)) {
    if (k === 'parent') continue;
    const v = no[k];
    if (v && typeof v === 'object') coletarWindowAssign(v, alvo);
  }
}

function globaisDe(arquivo) {
  const codigo = fs.readFileSync(arquivo, 'utf8');
  const ast = espree.parse(codigo, { ecmaVersion: 'latest', sourceType: 'script' });
  const nomes = new Set();
  for (const no of ast.body) {
    if (no.type === 'VariableDeclaration') no.declarations.forEach((d) => nomesDoPadrao(d.id, nomes));
    else if ((no.type === 'FunctionDeclaration' || no.type === 'ClassDeclaration') && no.id) nomes.add(no.id.name);
  }
  coletarWindowAssign(ast, nomes);
  return nomes;
}

function gerar() {
  const todos = new Set(EXTERNOS);
  for (const arq of arquivosJs(jsDir)) {
    for (const n of globaisDe(arq)) todos.add(n);
  }
  const globals = {};
  [...todos].sort((a, b) => a.localeCompare(b)).forEach((n) => { globals[n] = 'writable'; });
  return {
    _comentario: 'GERADO por scripts/generate-frontend-globals.cjs — não edite à mão. Globais declarados no topo dos scripts de js/ (usados pelo no-undef do ESLint).',
    globals,
  };
}

const esperado = JSON.stringify(gerar(), null, 2) + '\n';

if (process.argv.includes('--check')) {
  const atual = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : '';
  if (atual !== esperado) {
    console.error('[frontend-globals] config/frontend-globals.json está defasado.');
    console.error('                   Rode: node scripts/generate-frontend-globals.cjs');
    process.exit(1);
  }
  console.log('[frontend-globals] ✓ lista de globais em dia');
} else {
  fs.writeFileSync(outPath, esperado);
  console.log('[frontend-globals] ' + Object.keys(JSON.parse(esperado).globals).length + ' globais gravados em config/frontend-globals.json');
}
