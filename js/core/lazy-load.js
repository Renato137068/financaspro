/**
 * lazy-load.js — carregador de chunks sob demanda (code-splitting)
 *
 * Dois tipos de chunk:
 *   - ES Module (ADR 0005): a entrada js/esm/chunks/<chunk>.js, pedida por
 *     import() dinâmico. No build o Vite a transforma num arquivo próprio
 *     (fora do boot); no código-fonte é um import nativo do navegador. Os
 *     módulos do chunk compartilham com o boot a mesma instância de UTILS,
 *     DADOS etc.
 *   - clássico: em produção, o build junta os scripts em
 *     js/lazy/<chunk>.bundle.js (LAZY_CHUNKS em scripts/bundle-app.cjs) e
 *     este helper injeta o <script> uma vez. Em DEV (index.html cru) esses
 *     scripts já vêm eager, então os chamadores checam
 *     `typeof MODULO !== 'undefined'` antes de pedir o chunk.
 *
 * ES Module (ADR 0005): os scripts clássicos o recebem como global por
 * js/esm/ponte.js.
 */

// Caminho literal em cada import(): é o que deixa o Vite dividir o chunk.
const CHUNKS_ESM = {
  previsao: function() { return import('../esm/chunks/previsao.js'); },
  onboarding: function() { return import('../esm/chunks/onboarding.js'); },
  relatorios: function() { return import('../esm/chunks/relatorios.js'); },
  anexos: function() { return import('../esm/chunks/anexos.js'); },
  metas: function() { return import('../esm/chunks/metas.js'); },
  assinaturas: function() { return import('../esm/chunks/assinaturas.js'); },
  patrimonio: function() { return import('../esm/chunks/patrimonio.js'); },
  conta: function() { return import('../esm/chunks/conta.js'); },
};

const LAZY = {
  _loaded: {},
  _loading: {},

  /**
   * Carrega um chunk lazy por nome. Idempotente.
   * @param {string} chunk — nome do chunk (CHUNKS_ESM ou js/lazy/<chunk>.bundle.js)
   * @returns {Promise<void>}
   */
  load: function(chunk) {
    if (LAZY._loaded[chunk]) return Promise.resolve();
    if (LAZY._loading[chunk]) return LAZY._loading[chunk];

    var p = CHUNKS_ESM[chunk] ? LAZY._importar(chunk) : LAZY._injetar(chunk);
    LAZY._loading[chunk] = p;
    return p;
  },

  _importar: function(chunk) {
    return CHUNKS_ESM[chunk]().then(function() {
      LAZY._loaded[chunk] = true;
      delete LAZY._loading[chunk];
    }, function(e) {
      delete LAZY._loading[chunk];
      var erro = new Error('Falha ao carregar módulo sob demanda: ' + chunk);
      erro.cause = e;
      throw erro;
    });
  },

  _injetar: function(chunk) {
    return new Promise(function(resolve, reject) {
      if (typeof document === 'undefined') { resolve(); return; }
      var s = document.createElement('script');
      s.src = 'js/lazy/' + chunk + '.bundle.js';
      s.async = false; // preserva ordem caso haja mais de um chunk em voo
      s.onload = function() {
        LAZY._loaded[chunk] = true;
        delete LAZY._loading[chunk];
        resolve();
      };
      s.onerror = function() {
        delete LAZY._loading[chunk];
        reject(new Error('Falha ao carregar módulo sob demanda: ' + chunk));
      };
      document.head.appendChild(s);
    });
  },
};

export { LAZY };
export default LAZY;
