/**
 * funil.js — instrumentação do funil de monetização.
 *
 * Sem isto, toda decisão de preço e de limite é opinião. O app estava prestes a
 * ser publicado sem saber onde as pessoas param — e o funil desta categoria tem
 * dez passos, cada um com um motivo diferente para vazar.
 *
 * Duas regras que o resto do arquivo obedece:
 *
 *   1. MARCO É ÚNICO. "Primeiro lançamento" só acontece uma vez na vida do
 *      usuário. Sem a trava, o evento vira contador de uso e a taxa de conversão
 *      entre passos deixa de significar qualquer coisa.
 *   2. NUNCA SAI VALOR. O que se registra é a forma do funil, não a vida
 *      financeira de ninguém: nomes de marco, o gate que barrou, o tier. Nenhum
 *      valor, descrição, categoria ou identificador de transação.
 *
 * O envio em si continua sob `obsAnalyticsEnabled` + `obsEndpoint` em OBS: sem
 * consentimento explícito, tudo fica no buffer local e nada deixa o aparelho.
 *
 * Depende de: observability.js (OBS). Degrada para no-op sem ele.
 */
var FUNIL = (function() {
  'use strict';

  var MARCOS_KEY = 'fp-funil-marcos';

  /** Os dez passos. A ordem é a do funil, e é ela que se lê no relatório. */
  var E = {
    APP_ABERTO:         'funil_app_aberto',
    PRIMEIRO_LANCAMENTO:'funil_primeiro_lancamento',
    AHA_AUTOCATEGORIA:  'funil_aha_autocategoria',
    CONTA_CRIADA:       'funil_conta_criada',
    D30_ATIVO:          'funil_d30_ativo',
    GATE_ENCONTRADO:    'funil_gate_encontrado',
    PAYWALL_VISTO:      'funil_paywall_visto',
    TRIAL_INICIADO:     'funil_trial_iniciado',
    CHECKOUT_INICIADO:  'funil_checkout_iniciado',
    ASSINATURA_ATIVA:   'funil_assinatura_ativa',
  };

  function _marcos() {
    try {
      var raw = localStorage.getItem(MARCOS_KEY);
      return raw ? (JSON.parse(raw) || {}) : {};
    } catch (e) {
      return {};
    }
  }

  function _gravarMarco(nome) {
    try {
      var m = _marcos();
      m[nome] = new Date().toISOString();
      localStorage.setItem(MARCOS_KEY, JSON.stringify(m));
    } catch (e) { /* modo privado: o evento vai, o marco não persiste */ }
  }

  function _tier() {
    try {
      return (typeof BILLING !== 'undefined' && BILLING.getTier) ? BILLING.getTier() : 'FREE';
    } catch (e) {
      return 'FREE';
    }
  }

  function _emitir(nome, props) {
    try {
      if (typeof OBS === 'undefined' || !OBS.track) return;
      var dados = props || {};
      dados.tier = _tier();
      OBS.track(nome, dados);
    } catch (e) { /* instrumentação nunca pode derrubar o app */ }
  }

  /** Evento de marco: dispara no máximo uma vez por aparelho. */
  function marco(nome, props) {
    if (_marcos()[nome]) return false;
    _gravarMarco(nome);
    _emitir(nome, props);
    return true;
  }

  /** Evento recorrente: pode repetir (paywall, gate, checkout). */
  function evento(nome, props) {
    _emitir(nome, props);
  }

  /**
   * Dias desde a primeira abertura. É o eixo do funil: sem ele não dá para
   * separar "não converteu" de "ainda não teve tempo de converter".
   */
  function diasDeUso() {
    var m = _marcos();
    if (!m[E.APP_ABERTO]) return 0;
    var t = new Date(m[E.APP_ABERTO]).getTime();
    if (isNaN(t)) return 0;
    return Math.floor((Date.now() - t) / 86400000);
  }

  function init() {
    marco(E.APP_ABERTO);
    // D30 é marco de retenção, não de abertura: só conta quem voltou.
    if (diasDeUso() >= 30) marco(E.D30_ATIVO);
  }

  return {
    E: E,
    init: init,
    marco: marco,
    evento: evento,
    diasDeUso: diasDeUso,
    _marcos: _marcos,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FUNIL;
}
