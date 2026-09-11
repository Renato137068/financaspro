/**
 * marca-nomes-persistidos.test.js — trava as chaves e o passphrase que NÃO podem
 * acompanhar o nome do produto.
 *
 * Quando o produto foi renomeado de FinançasPro para FinançasPro, uma substituição
 * global trocou também o passphrase legado de `local-crypto.js`. Isso teria
 * tornado ilegível todo dado gravado no formato 'enc1' — falha silenciosa, sem
 * erro no console, descoberta só quando o usuário reabrisse o app. Este teste
 * existe para que a próxima renomeação não repita o acidente.
 */
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const ler = (p) => fs.readFileSync(path.join(raiz, p), 'utf8');

describe('identificadores persistidos são imutáveis', function() {
  const cripto = ler('js/utilities/local-crypto.js');

  test('o passphrase legado continua sendo o literal original', function() {
    expect(cripto).toContain("_PASSE_LEGADO: 'financaspro'");
  });

  test.each([
    ['flag de cifragem', "_ENABLED_KEY: 'financaspro_crypto_enabled'"],
    ['sal da chave',     "_SALT_KEY: 'financaspro_ckey_salt'"],
    ['chave do device',  "_DEV_KEY:  'financaspro_ckey_dev'"],
  ])('a chave de armazenamento %s não mudou', function(_rotulo, trecho) {
    expect(cripto).toContain(trecho);
  });

  test('as chaves de dados do app seguem com o prefixo fp-', function() {
    const config = ler('js/core/config.js');
    for (const chave of ['fp-transacoes', 'fp-config', 'fp-contas', 'fp-outbox']) {
      expect(config).toContain(`'${chave}'`);
    }
  });
});

describe('o nome do produto está unificado', function() {
  test('a interface escreve o nome de UMA forma só', function() {
    // O nome não tinha forma fixa: o código dizia "FinançasPro" e os textos
    // diziam "Finanças Pro". Duas grafias é o começo de duas marcas — e foi
    // uma das notas mais baixas da auditoria. A forma canônica é sem espaço.
    const alvos = ['index.html', 'privacidade.html', 'manifest.json', 'js/core/config.js'];
    for (const alvo of alvos) {
      const fonte = ler(alvo);
      expect(fonte).toMatch(/FinançasPro/);
      expect(fonte).not.toMatch(/Finanças Pro/);
      expect(fonte).not.toMatch(/FinancasPro/);
    }
  });

  test('a tagline está no manifest; meta description alinha com o manifest', function() {
    const tagline = 'Seu dinheiro, no seu aparelho.';
    const manifest = JSON.parse(ler('manifest.json'));
    expect(manifest.name).toContain(tagline);
    const html = ler('index.html');
    expect(html).toMatch(/meta name="description"/);
    expect(manifest.description).toMatch(/Controle de gastos/);
    expect(html).toContain('Controle de gastos');
  });
});
