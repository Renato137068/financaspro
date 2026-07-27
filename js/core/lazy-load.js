/**
 * lazy-load.js — carregador de chunks sob demanda (code-splitting)
 *
 * Em produção, o build move features opcionais para js/lazy/<chunk>.bundle.js
 * (fora do app.bundle.js eager). Este helper injeta o script uma única vez e
 * resolve quando carregar. Em DEV (index.html cru) os módulos já vêm eager, então
 * os chamadores checam `typeof MODULO !== 'undefined'` antes de pedir o chunk —
 * nunca há fetch de um js/lazy/* inexistente no dev.
 */
var LAZY = {
  _loaded: {},
  _loading: {},

  /**
   * Carrega um chunk lazy por nome. Idempotente.
   * @param {string} chunk — nome base do arquivo em js/lazy/
   * @returns {Promise<void>}
   */
  load: function(chunk) {
    if (this._loaded[chunk]) return Promise.resolve();
    if (this._loading[chunk]) return this._loading[chunk];

    var self = this;
    var p = new Promise(function(resolve, reject) {
      if (typeof document === 'undefined') { resolve(); return; }
      var s = document.createElement('script');
      s.src = 'js/lazy/' + chunk + '.bundle.js';
      s.async = false; // preserva ordem caso haja mais de um chunk em voo
      s.onload = function() {
        self._loaded[chunk] = true;
        delete self._loading[chunk];
        resolve();
      };
      s.onerror = function() {
        delete self._loading[chunk];
        reject(new Error('Falha ao carregar módulo sob demanda: ' + chunk));
      };
      document.head.appendChild(s);
    });

    this._loading[chunk] = p;
    return p;
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = LAZY;
}
