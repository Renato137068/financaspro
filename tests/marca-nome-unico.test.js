/**
 * marca-nome-unico.test.js — o nome do produto tem UMA grafia só.
 *
 * A auditoria de marca encontrou o nome escrito de duas maneiras: o código
 * dizia "FinançasPro" e vários textos diziam "Finanças Pro". Parece detalhe,
 * mas duas grafias são o começo de duas marcas — ninguém procura na loja por
 * um nome que não sabe escrever, e o registro no INPI protege uma forma, não
 * as duas. A forma canônica é sem espaço: FinançasPro.
 *
 * A pasta docs/ fica de fora: os relatórios datados são registro histórico.
 */
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const PULAR = new Set(['node_modules', '.git', 'dist', 'docs', '_to_delete', '.aud',
  'test-results', 'playwright-report', 'screenshots', 'coverage', 'android']);
const EXTENSOES = ['.js', '.cjs', '.mjs', '.css', '.html', '.json'];

function varrer(dir) {
  const saida = [];
  for (const nome of fs.readdirSync(dir)) {
    if (PULAR.has(nome)) continue;
    const p = path.join(dir, nome);
    if (fs.statSync(p).isDirectory()) saida.push(...varrer(p));
    else if (EXTENSOES.includes(path.extname(nome))) saida.push(p);
  }
  return saida;
}

// Os dois arquivos que DEFINEM a regra precisam escrever as grafias erradas
// para poder proibi-las — senão o teste se acusa a si mesmo.
const GUARDIOES = ['marca-nome-unico.test.js', 'marca-nomes-persistidos.test.js'];

const ARQUIVOS = varrer(raiz)
  .filter((p) => !p.endsWith('package-lock.json'))
  .filter((p) => !GUARDIOES.includes(path.basename(p)));

describe('a grafia do nome é única', function() {
  test('varreu uma quantidade plausível de arquivos', function() {
    expect(ARQUIVOS.length).toBeGreaterThan(100);
  });

  test.each([
    ['com espaço', /Finanças Pro/],
    ['sem cedilha', /FinancasPro/],
    ['tudo minúsculo no texto', /\bfinançaspro\b/],
  ])('nenhum arquivo escreve o nome %s', function(_rotulo, padrao) {
    const achados = [];
    for (const arquivo of ARQUIVOS) {
      // Corrida com testes que criam/apagaram fixtures temporários.
      if (!fs.existsSync(arquivo)) continue;
      if (path.basename(arquivo).startsWith('_csp-sample')) continue;
      const fonte = fs.readFileSync(arquivo, 'utf8');
      fonte.split('\n').forEach((linha, i) => {
        // Comentários que explicam a grafia precisam poder citá-la.
        if (/grafia|escrit[oa] de duas|forma can[ôo]nica|nome antigo/i.test(linha)) return;
        if (padrao.test(linha)) {
          achados.push(`${path.relative(raiz, arquivo)}:${i + 1} → ${linha.trim().slice(0, 70)}`);
        }
      });
    }
    expect(achados).toEqual([]);
  });

  test('o nome canônico aparece nos pontos de marca', function() {
    for (const alvo of ['index.html', 'manifest.json', 'js/core/config.js']) {
      expect(fs.readFileSync(path.join(raiz, alvo), 'utf8')).toMatch(/FinançasPro/);
    }
  });
});
