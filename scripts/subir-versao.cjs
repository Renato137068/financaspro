#!/usr/bin/env node
/**
 * subir-versao.cjs — sobe a versão do app em todos os lugares de uma vez.
 *
 * A versão mora em quatro arquivos, e o check:version reprova se divergirem:
 * package.json (e o lock), android/app/build.gradle (versionName; versionCode
 * sobe 1, a Play recusa repetir), js/core/config.js (CONFIG.VERSION) e sw.js
 * (CACHE_NAME, que troca o cache no aparelho). `npm version` só conhece o
 * primeiro e ainda cria a tag antes dos outros — a tag sairia com o
 * build.gradle velho e o workflow de release reprovaria.
 *
 *   node scripts/subir-versao.cjs patch|minor|major|X.Y.Z
 *   git commit -am "chore(release): vX.Y.Z" && git tag vX.Y.Z && git push --follow-tags
 */
const fs = require('fs');
const path = require('path');

// Raiz trocável só para o teste rodar numa cópia.
const ROOT = process.env.FP_RAIZ || path.join(__dirname, '..');

function proxima(atual, pedido) {
  if (/^\d+\.\d+\.\d+$/.test(pedido)) return pedido;
  const [ma, mi, pa] = atual.split('.').map(Number);
  if (pedido === 'patch') return [ma, mi, pa + 1].join('.');
  if (pedido === 'minor') return [ma, mi + 1, 0].join('.');
  if (pedido === 'major') return [ma + 1, 0, 0].join('.');
  throw new Error('use patch, minor, major ou X.Y.Z (recebido: "' + pedido + '")');
}

function maior(a, b) {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}

function trocar(rel, re, novo) {
  const arq = path.join(ROOT, rel);
  const antes = fs.readFileSync(arq, 'utf8');
  if (!re.test(antes)) throw new Error('não achei o campo de versão em ' + rel);
  fs.writeFileSync(arq, antes.replace(re, novo));
}

function subir(pedido) {
  const pkgArq = path.join(ROOT, 'package.json');
  const atual = JSON.parse(fs.readFileSync(pkgArq, 'utf8')).version;
  const nova = proxima(atual, pedido);
  if (!maior(nova, atual)) throw new Error('a versão nova (' + nova + ') precisa ser maior que a atual (' + atual + ')');

  // package.json e o lock: só o campo "version" do topo (e do pacote raiz no lock).
  trocar('package.json', /("version":\s*)"[^"]+"/, '$1"' + nova + '"');
  const lock = path.join(ROOT, 'package-lock.json');
  if (fs.existsSync(lock)) {
    const j = JSON.parse(fs.readFileSync(lock, 'utf8'));
    j.version = nova;
    if (j.packages && j.packages['']) j.packages[''].version = nova;
    fs.writeFileSync(lock, JSON.stringify(j, null, 2) + '\n');
  }

  const gradle = fs.readFileSync(path.join(ROOT, 'android/app/build.gradle'), 'utf8');
  const code = Number((gradle.match(/versionCode\s+(\d+)/) || [])[1]);
  if (!code) throw new Error('versionCode não encontrado em android/app/build.gradle');
  trocar('android/app/build.gradle', /versionCode\s+\d+/, 'versionCode ' + (code + 1));
  trocar('android/app/build.gradle', /versionName\s+"[^"]+"/, 'versionName "' + nova + '"');
  trocar('js/core/config.js', /VERSION:\s*'[^']+'/, "VERSION: '" + nova + "'");
  // generate-sw-cache embute a versão sem pontos (11.3.18 → 11318) e um sufixo
  // (-p3) que força cache novo; o sufixo fica.
  trocar('sw.js', /(CACHE_NAME\s*=\s*'financaspro-v)\d+/, '$1' + nova.replace(/\D/g, ''));

  return { atual, nova, versionCode: code + 1 };
}

if (require.main === module) {
  try {
    const r = subir(process.argv[2]);
    console.log('[subir-versao] ' + r.atual + ' → ' + r.nova + ' (versionCode ' + r.versionCode + ')');
    console.log('  Próximo: git commit -am "chore(release): v' + r.nova + '" && git tag v' + r.nova + ' && git push --follow-tags');
  } catch (e) {
    console.error('[subir-versao] ' + e.message);
    process.exit(1);
  }
}

module.exports = { proxima, subir };
