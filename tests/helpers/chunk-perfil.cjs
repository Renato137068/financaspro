/**
 * chunk-perfil.cjs — o Perfil (chunk sob demanda 'config') nos testes.
 *
 * INIT_CONFIG vem dividido em módulos: init-config.js declara o objeto e os
 * mixins (config-backup.js, config-bancos.js) se copiam para ele com
 * Object.assign ao carregar. Testar só o primeiro deixaria metade do Perfil de
 * fora. A lista sai do grafo da entrada js/esm/chunks/config.js, a mesma que o
 * build usa, para não divergir.
 */
const fs = require('fs');
const path = require('path');
const { entradasEsm, chunksEsm } = require('../../scripts/lib/esm-grafo.cjs');
const { converter, executarModulo } = require('./esm-como-script.cjs');

const ROOT = path.join(__dirname, '..', '..');
const ENTRADA = 'js/esm/chunks/config.js';

function arquivosDoPerfil() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const lista = chunksEsm(ROOT, entradasEsm(html)).get(ENTRADA);
  if (!lista) throw new Error('[chunk-perfil] ' + ENTRADA + ' não é alvo de import() em js/core/lazy-load.js');
  // A entrada só publica em window; js/telas/config.js só traz markup
  // (TELAS.registrar), e quem confere markup lê tests/helpers/index-com-telas.cjs.
  return lista.filter((rel) => rel !== ENTRADA && !rel.startsWith('js/telas/'));
}

const ARQUIVOS_PERFIL = arquivosDoPerfil();

/** Fonte de todos os arquivos do Perfil, na ordem do chunk (para testes de texto). */
function fontePerfil() {
  return ARQUIVOS_PERFIL.map((rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')).join('\n');
}

/**
 * Roda o Perfil num contexto vm, cada arquivo com o nome real (cobertura).
 * O que o contexto tem entra como dublê dos imports; o que ele não tem fica
 * ausente (undefined), como os globais que faltavam ao script clássico.
 */
function rodarPerfil(ctx) {
  const mocks = {};
  for (const rel of ARQUIVOS_PERFIL) {
    const arquivo = path.join(ROOT, rel);
    for (const dep of converter(fs.readFileSync(arquivo, 'utf8'), arquivo).importa) {
      const alvo = path.relative(ROOT, dep.arquivo).split(path.sep).join('/');
      if (ARQUIVOS_PERFIL.includes(alvo)) continue;
      for (const { importado, local } of dep.nomes) {
        mocks[importado] = Object.prototype.hasOwnProperty.call(ctx, local) ? ctx[local] : undefined;
      }
    }
  }
  for (const rel of ARQUIVOS_PERFIL) executarModulo(ctx, path.join(ROOT, rel), undefined, mocks);
  return ctx.INIT_CONFIG;
}

module.exports = { ARQUIVOS_PERFIL, fontePerfil, rodarPerfil };
