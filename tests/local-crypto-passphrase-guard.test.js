/**
 * local-crypto-passphrase-guard.test.js — impede perda de dados silenciosa.
 *
 * O modo 'passphrase' da cifragem local existe como encaixe: local-crypto.js
 * LÊ cfg.cryptoPassphrase, mas nada no app a ESCREVE — não há tela para
 * defini-la. Todo usuário está no modo 'dispositivo'.
 *
 * O risco não é o modo dispositivo ser fraco (isso está documentado e a UI
 * avisa). É alguém ligar a passphrase achando que basta gravar o campo: a
 * chave derivada muda e todo dado já cifrado como enc2/enc3 vira ilegível —
 * config, lançamentos, orçamento e anexos. O app não quebra, só para de
 * decifrar. Perda de dados sem mensagem de erro é a pior categoria.
 *
 * Este teste falha no minuto em que alguém começar a gravar a passphrase sem
 * ter entregue a recifragem junto.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function arquivosJs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name === 'vendor' || e.name === 'node_modules') return [];
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return arquivosJs(p);
    return e.name.endsWith('.js') ? [p] : [];
  });
}

const fontes = arquivosJs(path.join(root, 'js'));
const cripto = fs.readFileSync(path.join(root, 'js/utilities/local-crypto.js'), 'utf8');

/** Escrita = atribuição direta ou dentro de um objeto passado a salvarConfig. */
function escrevemPassphrase() {
  return fontes.filter((arq) => {
    const src = fs.readFileSync(arq, 'utf8');
    return /cryptoPassphrase\s*[:=][^=]/.test(src);
  }).map((a) => path.relative(root, a));
}

describe('Cifragem local — o modo passphrase não pode chegar pela metade', () => {
  test('hoje ninguém grava a passphrase (o modo é só encaixe)', () => {
    // Se este teste falhar, leia o teste seguinte antes de "consertar" aqui.
    expect(escrevemPassphrase()).toEqual([]);
  });

  test('se alguém passar a gravar, tem que existir recifragem junto', () => {
    const escritores = escrevemPassphrase();
    if (escritores.length === 0) return; // caminho normal hoje

    const temRecifragem = fontes.some((arq) => {
      const src = fs.readFileSync(arq, 'utf8');
      return /recifrar|reencriptar|reencrypt/i.test(src);
    });
    expect({ escritores, temRecifragem }).toEqual({ escritores, temRecifragem: true });
  });

  test('a armadilha está documentada onde alguém pisaria nela', () => {
    expect(cripto).toMatch(/ARMADILHA/);
    expect(cripto).toMatch(/recifrar tudo com a chave nova/);
  });

  test('o código continua honesto sobre o que o modo dispositivo protege', () => {
    // A UI não pode prometer mais do que o desenho entrega.
    expect(cripto).toMatch(/NÃO protege contra XSS/);
    expect(cripto).toContain('nivelDeProtecao');
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    expect(html).toMatch(/Não cobre XSS/i);
  });
});
