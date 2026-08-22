#!/usr/bin/env node
/**
 * convert-copy-tests.cjs — troca cópias inline de módulos pelo módulo real.
 *
 * Script de migração pontual. Encontra `const MODULO = { ... }` no topo de um
 * arquivo de teste, remove o bloco inteiro (casando chaves) e substitui por um
 * alias para o módulo carregado por `tests/load-sources.js`.
 *
 * A conversão pode fazer testes falharem — e é esse o ponto: cada falha é uma
 * divergência entre a cópia e o código de produção que estava escondida.
 *
 * Uso: node scripts/convert-copy-tests.cjs [--dry]
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const testsDir = path.join(root, 'tests');
const dryRun = process.argv.includes('--dry');

// arquivo → módulo global que ele reimplementa
const ALVOS = {
  'utils.test.js': 'UTILS',
  'validations.test.js': 'VALIDATIONS',
  'score.test.js': 'SCORE',
  'parser.test.js': 'PARSER',
};

const CABECALHO = (mod) => `const { loadCoreModules } = require('./load-sources');

// Carrega os módulos REAIS de js/. Antes deste ajuste o arquivo declarava uma
// cópia inline de ${mod} e testava a cópia — os testes passavam mesmo quando o
// código de produção divergia. Ver tests/suite-integrity.test.js.
loadCoreModules();
const ${mod} = global.${mod};
`;

/**
 * Devolve [inicio, fim) do bloco `const NOME = { ... };`.
 *
 * Usa o fechamento na coluna 0 (`};`) como delimitador em vez de casar chaves
 * caractere a caractere. Contar chaves exigiria um tokenizer de verdade: o
 * objeto de `utils.test.js` contém o literal de regex /[&<>"']/g, cujas aspas
 * fazem um scanner ingênuo entrar em "modo string" e perder a contagem.
 * Como todos os arquivos-alvo declaram o objeto no nível superior, o fechamento
 * na coluna 0 é um delimitador confiável — e verificável.
 */
function acharBloco(src, nome) {
  const re = new RegExp(`^(?:const|var|let)\\s+${nome}\\s*=\\s*\\{`, 'm');
  const m = re.exec(src);
  if (!m) return null;

  const fechamento = /^\};?[ \t]*$/m;
  const resto = src.slice(m.index + m[0].length);
  const f = fechamento.exec(resto);
  if (!f) return null;

  let fim = m.index + m[0].length + f.index + f[0].length;
  if (src[fim] === '\n') fim++;
  return [m.index, fim];
}

let convertidos = 0;

for (const [arquivo, modulo] of Object.entries(ALVOS)) {
  const full = path.join(testsDir, arquivo);
  if (!fs.existsSync(full)) { console.warn(`[convert] ausente: ${arquivo}`); continue; }

  let src = fs.readFileSync(full, 'utf8');

  if (src.includes('load-sources')) {
    console.log(`[convert] ${arquivo}: já convertido`);
    continue;
  }

  const bloco = acharBloco(src, modulo);
  if (!bloco) { console.warn(`[convert] ${arquivo}: bloco de ${modulo} não encontrado`); continue; }

  const [inicio, fim] = bloco;
  const removido = src.slice(inicio, fim).split('\n').length;
  src = src.slice(0, inicio) + CABECALHO(modulo) + src.slice(fim);

  if (dryRun) {
    console.log(`[convert] ${arquivo}: removeria ${removido} linhas de cópia de ${modulo}`);
  } else {
    fs.writeFileSync(full, src);
    console.log(`[convert] ${arquivo}: -${removido} linhas de cópia → módulo real ${modulo}`);
    convertidos++;
  }
}

console.log(`[convert] ${convertidos} arquivo(s) convertido(s)`);
