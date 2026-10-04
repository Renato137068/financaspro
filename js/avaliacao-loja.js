/**
 * avaliacao-loja.js — pede avaliação na Play em momentos bons, e raramente.
 *
 * Usa a janela de avaliação do Google (In-App Review), pelo plugin nativo
 * FpInAppReview (android/.../FpInAppReviewPlugin.java): a pessoa avalia em
 * dois toques, sem sair do app. Sem ela só avalia quem lembra de voltar à loja,
 * e esse grupo tende a ser quem teve problema.
 *
 * Regras (política da Play e bom senso):
 *   - só no app Android; na web e no iOS não faz nada;
 *   - só depois de um momento bom: 10 lançamentos em 7 dias ou uma meta
 *     concluída. Nunca depois de erro;
 *   - nunca nos primeiros 3 dias de uso, e no máximo uma vez a cada 90 dias;
 *   - nunca pergunta antes "está gostando?" para filtrar quem vai avaliar: a
 *     Play proíbe. Quem decide se a janela aparece é o Google (tem cota
 *     própria); o app só escolhe a hora de pedir.
 *
 * ES Module (ADR 0005): os scripts clássicos o recebem como global por
 * js/esm/ponte.js.
 */

import { FUNIL } from './utilities/funil.js';

const CHAVE = 'fp-avaliacao-loja';
const DIA_MS = 24 * 60 * 60 * 1000;
const INTERVALO_DIAS = 90;
const MIN_DIAS_USO = 3;
const LANCAMENTOS_NA_SEMANA = 10;

function lerEstado() {
  try {
    var bruto = JSON.parse(localStorage.getItem(CHAVE) || '{}');
    return (bruto && typeof bruto === 'object') ? bruto : {};
  } catch (e) {
    return {};
  }
}

function gravarEstado(estado) {
  try { localStorage.setItem(CHAVE, JSON.stringify(estado)); } catch (e) { /* storage cheio ou bloqueado */ }
}

const AVALIACAO_LOJA = {

  /** O plugin nativo, ou null fora do app Android. */
  _plugin: function() {
    try {
      var cap = window.Capacitor;
      if (!cap || !cap.isNativePlatform || !cap.isNativePlatform()) return null;
      if (cap.getPlatform && cap.getPlatform() !== 'android') return null;
      return (cap.Plugins && cap.Plugins.FpInAppReview) || null;
    } catch (e) {
      return null;
    }
  },

  /** Dias desde o primeiro uso neste aparelho (o mesmo relógio do funil). */
  _diasDeUso: function() {
    return FUNIL.diasDeUso();
  },

  podePedir: function(agora) {
    agora = typeof agora === 'number' ? agora : Date.now();
    if (!AVALIACAO_LOJA._plugin()) return false;
    if (AVALIACAO_LOJA._diasDeUso() < MIN_DIAS_USO) return false;
    var pedidaEm = Number(lerEstado().pedidaEm) || 0;
    return !pedidaEm || (agora - pedidaEm) >= INTERVALO_DIAS * DIA_MS;
  },

  /**
   * Chamado depois de um lançamento salvo com sucesso. Guarda só as horas dos
   * últimos 7 dias (nada do lançamento) e pede ao chegar a 10.
   */
  aposLancamento: function(agora) {
    agora = typeof agora === 'number' ? agora : Date.now();
    var estado = lerEstado();
    var recentes = (Array.isArray(estado.lancamentos) ? estado.lancamentos : [])
      .filter(function(t) { return typeof t === 'number' && agora - t < 7 * DIA_MS; });
    recentes.push(agora);
    estado.lancamentos = recentes.slice(-LANCAMENTOS_NA_SEMANA);
    gravarEstado(estado);
    if (recentes.length >= LANCAMENTOS_NA_SEMANA) return AVALIACAO_LOJA.pedir('lancamentos', agora);
    return Promise.resolve(false);
  },

  /** Chamado quando uma meta passa a concluída. */
  aposMetaConcluida: function(agora) {
    return AVALIACAO_LOJA.pedir('meta', agora);
  },

  /**
   * Pede a janela, se as regras deixam. Marca a data ANTES de chamar: se o
   * Google não mostrar (cota dele), não insistimos de novo amanhã.
   * Espera um pouco para o "Registrado!" aparecer antes da janela.
   */
  pedir: function(motivo, agora) {
    agora = typeof agora === 'number' ? agora : Date.now();
    if (!AVALIACAO_LOJA.podePedir(agora)) return Promise.resolve(false);
    var estado = lerEstado();
    estado.pedidaEm = agora;
    estado.motivo = String(motivo || '');
    estado.lancamentos = [];
    gravarEstado(estado);
    var plugin = AVALIACAO_LOJA._plugin();
    return new Promise(function(resolve) {
      setTimeout(function() {
        Promise.resolve()
          .then(function() { return plugin.solicitar(); })
          .then(function() { resolve(true); }, function() { resolve(false); });
      }, AVALIACAO_LOJA._atrasoMs);
    });
  },

  _atrasoMs: 1500,
};

export { AVALIACAO_LOJA };
export default AVALIACAO_LOJA;
