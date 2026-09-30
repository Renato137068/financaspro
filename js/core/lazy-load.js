/**
 * lazy-load.js — carregador de chunks sob demanda (code-splitting)
 *
 * Cada chunk é um ES Module (ADR 0005): a entrada js/esm/chunks/<chunk>.js,
 * pedida por import() dinâmico. No build o Vite a transforma num arquivo
 * próprio (js/<chunk>-<hash>.js, fora do boot), que importa do bundle do boot:
 * os módulos do chunk compartilham a mesma instância de UTILS, DADOS etc. No
 * código-fonte é um import nativo do navegador, então o dev também carrega
 * sob demanda. Quem chama checa `typeof MODULO !== 'undefined'` antes de
 * pedir (INIT_NAVIGATION._ensureChunk).
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
  extrato: function() { return import('../esm/chunks/extrato.js'); },
  orcamento: function() { return import('../esm/chunks/orcamento.js'); },
  config: function() { return import('../esm/chunks/config.js'); },
  simulador: function() { return import('../esm/chunks/simulador.js'); },
};

const LAZY = {
  _loaded: {},
  _loading: {},

  /**
   * Carrega um chunk lazy por nome. Idempotente.
   * @param {string} chunk — nome do chunk (chave de CHUNKS_ESM)
   * @returns {Promise<void>}
   */
  load: function(chunk) {
    if (LAZY._loaded[chunk]) return Promise.resolve();
    if (LAZY._loading[chunk]) return LAZY._loading[chunk];
    if (!CHUNKS_ESM[chunk]) return Promise.reject(new Error('Chunk desconhecido: ' + chunk));

    var p = CHUNKS_ESM[chunk]().then(function() {
      LAZY._loaded[chunk] = true;
      delete LAZY._loading[chunk];
    }, function(e) {
      delete LAZY._loading[chunk];
      var erro = new Error('Falha ao carregar módulo sob demanda: ' + chunk);
      erro.cause = e;
      throw erro;
    });
    LAZY._loading[chunk] = p;
    return p;
  },
};

export { LAZY };
export default LAZY;
