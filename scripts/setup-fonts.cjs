#!/usr/bin/env node
/**
 * setup-fonts.cjs — copia as fontes do @fontsource e gera css/fonts.css.
 *
 * Por que auto-hospedar:
 *
 * O app se apresenta como offline-first e carregava as fontes de
 * fonts.googleapis.com por uma tag <link rel="stylesheet"> — que bloqueia a
 * renderização. Três consequências que só aparecem juntas:
 *
 *   1. Sem rede, a folha externa nunca resolve. O navegador espera, estoura o
 *      timeout e só então pinta. Num app cujo argumento é funcionar offline,
 *      a primeira coisa que ele faz é depender da rede.
 *   2. O service worker não tinha como precachear a folha (origem cruzada,
 *      resposta opaca) — então nem o segundo carregamento resolvia.
 *   3. Todo usuário revelava a um terceiro que abriu um app de finanças, com
 *      IP e horário. Não é dado do produto, mas é dado sobre a pessoa.
 *
 * Rodar: `node scripts/setup-fonts.cjs`. Idempotente — reescreve tudo.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const destDir = path.join(root, 'fonts');
const cssOut = path.join(root, 'css', 'fonts.css');

/**
 * Subconjunto `latin` apenas.
 *
 * Cobre U+0000–00FF, que inclui todo o português: ã õ ç á é í ó ú â ê ô à.
 * `latin-ext` acrescentaria ~40% de peso para alfabetos que este produto não
 * atende (é pt-BR, com moeda e formato de data fixos).
 */
const SUBSET = 'latin';

const FAMILIAS = [
  {
    pacote: '@fontsource/inter',
    arquivoBase: 'inter',
    nomeCss: 'Inter',
    pesos: [400, 500, 600, 700, 800],
  },
  {
    pacote: '@fontsource/plus-jakarta-sans',
    arquivoBase: 'plus-jakarta-sans',
    nomeCss: 'Plus Jakarta Sans',
    pesos: [600, 700, 800],
  },
];

/**
 * Pesos presentes na primeira pintura. Só estes entram no precache do service
 * worker; os demais chegam pelo cache de runtime na primeira vez que aparecem.
 * Precachear os 8 custaria ~156 KB no primeiro acesso para pesos que talvez
 * nem apareçam na tela inicial.
 */
const CRITICOS = [
  { familia: 'Inter', peso: 400 },
  { familia: 'Inter', peso: 600 },
  { familia: 'Inter', peso: 700 },
  { familia: 'Plus Jakarta Sans', peso: 700 },
];

function ehCritico(nomeCss, peso) {
  return CRITICOS.some(c => c.familia === nomeCss && c.peso === peso);
}

fs.mkdirSync(destDir, { recursive: true });

const blocos = [];
const criticos = [];
let total = 0;
let copiados = 0;

for (const fam of FAMILIAS) {
  const filesDir = path.join(root, 'node_modules', fam.pacote, 'files');
  if (!fs.existsSync(filesDir)) {
    console.error(`[fonts] ${fam.pacote} não instalado — rode npm install`);
    process.exit(1);
  }

  for (const peso of fam.pesos) {
    const nome = `${fam.arquivoBase}-${SUBSET}-${peso}-normal.woff2`;
    const origem = path.join(filesDir, nome);

    if (!fs.existsSync(origem)) {
      console.error(`[fonts] arquivo ausente: ${nome}`);
      process.exit(1);
    }

    fs.copyFileSync(origem, path.join(destDir, nome));
    const bytes = fs.statSync(origem).size;
    total += bytes;
    copiados++;

    if (ehCritico(fam.nomeCss, peso)) criticos.push(nome);

    blocos.push(
      `@font-face {\n`
      + `  font-family: '${fam.nomeCss}';\n`
      + `  font-style: normal;\n`
      + `  font-weight: ${peso};\n`
      // swap: o texto aparece na fonte do sistema e troca quando a webfont
      // carrega. O contrário (block) é uma tela em branco esperando bytes.
      + `  font-display: swap;\n`
      + `  src: url('../fonts/${nome}') format('woff2');\n`
      + `  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6,\n`
      + `    U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+2074, U+20AC,\n`
      + `    U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;\n`
      + `}`,
    );
  }
}

const cabecalho = [
  '/* GERADO POR scripts/setup-fonts.cjs — NÃO EDITAR À MÃO.',
  ' *',
  ' * Fontes auto-hospedadas. Antes vinham de fonts.googleapis.com por uma tag',
  ' * <link rel="stylesheet">, que bloqueia a renderização e não pode ser',
  ' * precacheada (origem cruzada, resposta opaca) — num app offline-first, a',
  ' * primeira coisa a fazer era esperar a rede.',
  ' *',
  ` * Subconjunto: ${SUBSET}. Cobre todo o português.`,
  ' */',
  '',
].join('\n');

fs.writeFileSync(cssOut, cabecalho + blocos.join('\n\n') + '\n');

// Lista consumida por generate-sw-cache.cjs para o precache seletivo.
fs.writeFileSync(
  path.join(destDir, 'criticas.json'),
  JSON.stringify(criticos, null, 2) + '\n',
);

console.log(`[fonts] ${copiados} arquivos → fonts/ (${Math.round(total / 1024)} KB)`);
console.log(`[fonts] ${criticos.length} críticas para precache: ${criticos.join(', ')}`);
console.log(`[fonts] css/fonts.css gerado`);
