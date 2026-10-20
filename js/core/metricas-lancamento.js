/**
 * metricas-lancamento.js — linha de base do tempo para registrar uma movimentação.
 *
 * Mede só o que é preciso para comparar a experiência antes e depois das
 * melhorias: quanto tempo leva entre começar a preencher e salvar, quantos
 * toques e teclas foram usados e quantas tentativas foram concluídas. Não
 * guarda valor, descrição, categoria, conta nem data. Fica no aparelho e sai
 * apenas no diagnóstico de suporte (HEALTH_SERVICE.exportarDiagnostico).
 *
 * ES Module (ADR 0005): o formulário e o diagnóstico o importam direto.
 */
const METRICAS_CHAVE = 'fp_metricas_lancamento';
const METRICAS_MAX_AMOSTRAS = 200;
// Um formulário deixado aberto por horas não é um lançamento lento: descarta.
const METRICAS_MAX_DURACAO_MS = 30 * 60 * 1000;

let _metricasPendente = null;

function metricasVazio() {
  return { iniciados: 0, concluidos: 0, duracoesMs: [], interacoes: [] };
}

function metricasLer() {
  try {
    const raw = localStorage.getItem(METRICAS_CHAVE);
    const dados = raw ? JSON.parse(raw) : null;
    return dados && typeof dados === 'object' ? Object.assign(metricasVazio(), dados) : metricasVazio();
  } catch (_e) {
    return metricasVazio();
  }
}

function metricasGravar(dados) {
  try {
    localStorage.setItem(METRICAS_CHAVE, JSON.stringify(dados));
  } catch (_e) {
    // Modo privativo ou armazenamento bloqueado: o app segue sem medir.
  }
}

function metricasMediana(lista) {
  if (!lista.length) return null;
  const ordenada = lista.slice().sort(function(a, b) { return a - b; });
  const meio = Math.floor(ordenada.length / 2);
  return ordenada.length % 2 ? ordenada[meio] : Math.round((ordenada[meio - 1] + ordenada[meio]) / 2);
}

const METRICAS_LANCAMENTO = {
  /**
   * Começa uma tentativa. Não reinicia uma tentativa recente em andamento;
   * uma antiga (formulário abandonado) é substituída.
   */
  iniciar: function(agora) {
    if (_metricasPendente && agora - _metricasPendente.inicio < METRICAS_MAX_DURACAO_MS) return;
    _metricasPendente = { inicio: agora, interacoes: 0 };
    const dados = metricasLer();
    dados.iniciados += 1;
    metricasGravar(dados);
  },

  /** Conta um toque ou tecla na tentativa em andamento. */
  interagir: function() {
    if (_metricasPendente) _metricasPendente.interacoes += 1;
  },

  /** Fecha a tentativa ao salvar. Devolve false se não havia tentativa. */
  concluir: function(agora) {
    if (!_metricasPendente) return false;
    const duracao = agora - _metricasPendente.inicio;
    const interacoes = _metricasPendente.interacoes;
    _metricasPendente = null;
    if (duracao < 0 || duracao > METRICAS_MAX_DURACAO_MS) return false;

    const dados = metricasLer();
    dados.concluidos += 1;
    dados.duracoesMs = dados.duracoesMs.concat([duracao]).slice(-METRICAS_MAX_AMOSTRAS);
    dados.interacoes = dados.interacoes.concat([interacoes]).slice(-METRICAS_MAX_AMOSTRAS);
    metricasGravar(dados);
    return true;
  },

  /** Descarta a tentativa em andamento sem gravar nada. */
  cancelar: function() {
    _metricasPendente = null;
  },

  /** Resumo para o diagnóstico: contagens, taxa de conclusão e medianas. */
  resumo: function() {
    const dados = metricasLer();
    return {
      iniciados: dados.iniciados,
      concluidos: dados.concluidos,
      taxaConclusaoPct: dados.iniciados
        ? Math.round((dados.concluidos / dados.iniciados) * 1000) / 10
        : null,
      medianaTempoMs: metricasMediana(dados.duracoesMs),
      medianaInteracoes: metricasMediana(dados.interacoes),
      amostras: dados.duracoesMs.length,
    };
  },

  limpar: function() {
    _metricasPendente = null;
    metricasGravar(metricasVazio());
  },
};

export { METRICAS_LANCAMENTO };
export default METRICAS_LANCAMENTO;
