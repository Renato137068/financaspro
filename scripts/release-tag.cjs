#!/usr/bin/env node
/**
 * release-tag.cjs — a tag da release é a versão do app.
 *
 * O workflow de release (.github/workflows/release.yml) publica a partir de
 * uma tag vX.Y.Z. Se ela não for a versão do package.json, sai um AAB cujo
 * nome, Release e faixa da Play dizem uma versão e o app diz outra — e ninguém
 * consegue ligar um relato de erro ao código. (O check:version cuida de o
 * build.gradle e o cache do service worker andarem com o package.json.)
 *
 *   node scripts/release-tag.cjs v11.3.19
 */
const path = require('path');

function conferir(tag, versao) {
  if (!/^v\d+\.\d+\.\d+$/.test(tag || '')) {
    return 'a tag precisa ter o formato vX.Y.Z (recebido: "' + tag + '")';
  }
  if (tag !== 'v' + versao) {
    return 'a tag ' + tag + ' não é a versão do package.json (' + versao + '): '
      + 'suba a versão (npm version) ou crie a tag v' + versao;
  }
  return null;
}

if (require.main === module) {
  const versao = require(path.join(__dirname, '..', 'package.json')).version;
  const erro = conferir(process.argv[2], versao);
  if (erro) {
    console.error('[release-tag] ' + erro);
    process.exit(1);
  }
  console.log('[release-tag] ✓ ' + process.argv[2] + ' = versão do app');
}

module.exports = { conferir };
