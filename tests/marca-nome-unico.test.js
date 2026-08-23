/**
 * marca-nome-unico.test.js — o nome antigo não pode reaparecer no código vivo.
 *
 * Depois da renomeação para Sobra, dois cabeçalhos de CSS ficaram para trás
 * (design-system.css e style.css) porque aqueles arquivos foram restaurados de
 * um backup posterior à substituição. Não quebrava nada, mas é exatamente o
 * tipo de resíduo que faz uma marca parecer meio trocada — e ninguém procura
 * por ele de novo depois do dia da troca.
 *
 * A pasta docs/ está de fora de propósito: os relatórios datados são registro
 * histórico e devem continuar dizendo o nome que o produto tinha na época.
 */
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const PULAR = new Set(['node_modules', '.git', 'dist', 'docs', 'android', '_to_delete',
  'test-results', 'playwright-report', 'screenshots', 'coverage']);
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

describe('o nome antigo não sobreviveu em nenhum arquivo vivo', function() {
  const arquivos = varrer(raiz).filter((p) => !p.endsWith('package-lock.json'));

  test('varreu uma quantidade plausível de arquivos', function() {
    expect(arquivos.length).toBeGreaterThan(100);
  });

  test('nenhum arquivo exibe o nome antigo', function() {
    const achados = [];
    for (const arquivo of arquivos) {
      const fonte = fs.readFileSync(arquivo, 'utf8');
      // O nome como MARCA. As chaves de armazenamento (financaspro_ckey_salt,
      // o passphrase legado) usam a forma minúscula colada e são intocáveis —
      // ver tests/marca-nomes-persistidos.test.js.
      fonte.split('\n').forEach((linha, i) => {
        // Um comentário que EXPLICA a renomeação precisa poder citar o nome
        // antigo — é o único jeito de o próximo leitor entender por que certas
        // chaves de armazenamento não acompanharam a marca.
        const explicaATroca = /renomead|renomea[çc][ãa]o|nome antigo|marca antiga/i.test(linha);
        if (/Finan[çc]as\s?Pro/.test(linha) && !explicaATroca) {
          achados.push(`${path.relative(raiz, arquivo)}:${i + 1} → ${linha.trim().slice(0, 70)}`);
        }
      });
    }
    expect(achados).toEqual([]);
  });
});
