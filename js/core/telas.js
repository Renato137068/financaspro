/**
 * telas.js — markup de telas que não vem no index.html.
 *
 * Telas usadas só por um chunk lazy (Orçamento, sub-telas do Perfil) ficam em
 * telas/<chunk>/<tela>.html. scripts/generate-telas.cjs as transforma em
 * js/telas/<chunk>.js, um ES Module que a entrada do chunk
 * (js/esm/chunks/<chunk>.js) importa primeiro e que chama TELAS.registrar
 * para cada tela ao carregar. O index.html guarda só a casca
 * (`<div id="aba-<tela>" data-tela="<tela>" aria-busy="true">`), então o HTML
 * do primeiro acesso não carrega markup de tela que talvez nunca abra.
 *
 * O markup é estático e do próprio app (nada vem do usuário). Quem precisa
 * reagir à chegada de uma tela escuta o evento `fp:tela-carregada` no document.
 *
 * ES Module (ADR 0005), publicado por js/esm/ponte.js.
 */
const TELAS = {
  _carregadas: {},

  /**
   * Preenche a casca #aba-<nome> com o markup da tela.
   * @param {string} nome  id da tela sem o prefixo 'aba-'
   * @param {string} html  markup gerado de telas/<chunk>/<nome>.html
   */
  registrar: function(nome, html) {
    if (TELAS._carregadas[nome]) return;
    var casca = document.getElementById('aba-' + nome);
    if (!casca) {
      console.error('[TELAS] casca #aba-' + nome + ' ausente no index.html');
      return;
    }
    casca.innerHTML = html;
    casca.removeAttribute('aria-busy');
    TELAS._carregadas[nome] = true;
    if (typeof renderLucideIcons === 'function') renderLucideIcons(casca);
    document.dispatchEvent(new CustomEvent('fp:tela-carregada', { detail: { nome: nome } }));
  },

  /** A tela já está no DOM? */
  carregada: function(nome) {
    return !!TELAS._carregadas[nome];
  },
};

export { TELAS };
export default TELAS;
