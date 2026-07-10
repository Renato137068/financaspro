/**
 * metas.js — Metas financeiras (valor alvo, progresso, prazo)
 */
const METAS = {
  ICONES: {
    viagem: 'plane',
    reserva: 'shield',
    carro: 'car',
    casa: 'home',
    educacao: 'book-open',
    outros: 'target'
  },

  init: function() {
    var config = DADOS.getConfig();
    if (!config.metas) DADOS.salvarConfig({ metas: [] });
  },

  listar: function(apenasAtivas) {
    var metas = DADOS.getConfig().metas || [];
    if (!apenasAtivas) return metas.slice();
    return metas.filter(function(m) { return !m.concluida && m.valorAtual < m.valorAlvo; });
  },

  obter: function(id) {
    return this.listar().filter(function(m) { return m.id === id; })[0] || null;
  },

  criar: function(dados) {
    var titulo = (dados.titulo || '').trim();
    var valorAlvo = parseFloat(dados.valorAlvo);
    if (!titulo) throw new Error('Informe o nome da meta');
    if (!valorAlvo || valorAlvo <= 0) throw new Error('Valor alvo inválido');

    var meta = {
      id: UTILS.gerarId(),
      titulo: titulo,
      valorAlvo: valorAlvo,
      valorAtual: parseFloat(dados.valorAtual) || 0,
      prazo: dados.prazo || null,
      icone: dados.icone || 'target',
      criadoEm: new Date().toISOString(),
      concluida: false
    };
    var metas = this.listar();
    metas.push(meta);
    DADOS.salvarConfig({ metas: metas });
    return meta;
  },

  atualizar: function(id, patch) {
    var metas = this.listar();
    var idx = -1;
    for (var i = 0; i < metas.length; i++) {
      if (metas[i].id === id) { idx = i; break; }
    }
    if (idx < 0) return null;
    metas[idx] = Object.assign({}, metas[idx], patch);
    if (metas[idx].valorAtual >= metas[idx].valorAlvo) metas[idx].concluida = true;
    DADOS.salvarConfig({ metas: metas });
    return metas[idx];
  },

  excluir: function(id) {
    var metas = this.listar().filter(function(m) { return m.id !== id; });
    DADOS.salvarConfig({ metas: metas });
  },

  registrarAporte: function(id, valor) {
    var v = parseFloat(valor);
    if (!v || v <= 0) throw new Error('Valor inválido');
    var meta = this.obter(id);
    if (!meta) throw new Error('Meta não encontrada');
    return this.atualizar(id, { valorAtual: Math.min(meta.valorAlvo, meta.valorAtual + v) });
  },

  calcularProgresso: function(meta) {
    if (!meta) return { percentual: 0, restante: 0, diasRestantes: null, concluida: false };
    var pct = meta.valorAlvo > 0
      ? Math.min(100, Math.round((meta.valorAtual / meta.valorAlvo) * 100))
      : 0;
    var diasRestantes = null;
    if (meta.prazo) {
      var hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      var prazo = new Date(meta.prazo + 'T12:00:00');
      diasRestantes = Math.ceil((prazo - hoje) / 86400000);
    }
    var concluida = !!meta.concluida || meta.valorAtual >= meta.valorAlvo;
    return {
      percentual: pct,
      restante: Math.max(0, meta.valorAlvo - meta.valorAtual),
      diasRestantes: diasRestantes,
      concluida: concluida
    };
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = METAS;
}
