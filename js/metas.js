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
    var valorAlvo = UTILS.parseMoeda(dados.valorAlvo);
    if (!titulo) throw new Error('Informe o nome da meta');
    if (!valorAlvo || valorAlvo <= 0) throw new Error('Valor alvo inválido');

    var meta = {
      id: UTILS.gerarId(),
      titulo: titulo,
      valorAlvo: valorAlvo,
      valorAtual: UTILS.parseMoeda(dados.valorAtual) || 0,
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

  calcularProgresso: function(meta, hoje) {
    if (!meta) return { percentual: 0, restante: 0, diasRestantes: null, concluida: false };
    var pct = meta.valorAlvo > 0
      ? Math.min(100, Math.round((meta.valorAtual / meta.valorAlvo) * 100))
      : 0;

    // Ambos os lados ancorados ao meio-dia. A versão anterior comparava hoje às
    // 00:00 com o prazo às 12:00 e arredondava para cima — o mesmo erro que já
    // havia aparecido em contas-pagar e assinaturas, e que fazia uma meta
    // vencendo HOJE aparecer como "1 dia restante".
    var diasRestantes = null;
    if (meta.prazo) {
      var ref = METAS._agora(hoje);
      var refMeioDia = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 12, 0, 0, 0);
      var alvo = new Date(String(meta.prazo).slice(0, 10) + 'T12:00:00');
      diasRestantes = isNaN(alvo.getTime())
        ? null
        : Math.round((alvo - refMeioDia) / 86400000);
    }

    // Subtração em centavos: alvo 0,30 menos 0,10 dá 0,19999999999999998 em
    // ponto flutuante, e o "restante" exibido fica um centavo errado.
    var restanteCent = Math.max(
      0,
      UTILS.paraCentavos(meta.valorAlvo) - UTILS.paraCentavos(meta.valorAtual),
    );

    var concluida = !!meta.concluida || meta.valorAtual >= meta.valorAlvo;
    return {
      percentual: pct,
      restante: restanteCent / 100,
      diasRestantes: diasRestantes,
      concluida: concluida
    };
  },

  /**
   * Normaliza "agora" a partir de um parâmetro opcional.
   *
   * Não use `instanceof Date` aqui: uma Date criada em outro realm — outra
   * janela, um iframe, ou o contexto de vm que a suíte usa para carregar os
   * módulos — falha no `instanceof` e o parâmetro injetado seria silenciosamente
   * descartado, com a função voltando a usar a data real. O teste passaria a
   * medir o dia em que rodou, não o cenário. Checar o método é confiável entre
   * realms.
   */
  _agora: function(valor) {
    if (valor && typeof valor.getTime === 'function' && !isNaN(valor.getTime())) {
      return valor;
    }
    return new Date();
  },

  /**
   * Meses decorridos entre duas datas, em meses de CALENDÁRIO (fracionários).
   *
   * Dividir a diferença em dias por 30,44 parece equivalente e não é: de 10/02
   * a 10/08 dá 5,95 em vez dos 6 meses que qualquer pessoa contaria. Como esse
   * número vira o divisor do ritmo mensal, o desvio aparece direto no valor de
   * "aumente o aporte em R$ X" — e um número que não bate com a conta que o
   * usuário faz de cabeça destrói a confiança no resto da tela.
   */
  _mesesEntre: function(inicio, fim) {
    var meses = (fim.getFullYear() - inicio.getFullYear()) * 12
      + (fim.getMonth() - inicio.getMonth());
    // Fração do mês corrente, proporcional ao tamanho real do mês de destino.
    var diasNoMesFim = new Date(fim.getFullYear(), fim.getMonth() + 1, 0).getDate();
    meses += (fim.getDate() - inicio.getDate()) / diasNoMesFim;
    return meses;
  },

  /**
   * Responde "vou conseguir?" — o que o percentual sozinho não diz.
   *
   * Uma barra em 40% é ótima com dois anos pela frente e um problema com dois
   * meses. Esta função cruza o que falta, o prazo e o ritmo já demonstrado
   * para devolver um diagnóstico e, quando há atraso, o número exato do
   * ajuste — porque "você está atrasado" sem o quanto não ajuda ninguém.
   *
   * @param {Object} meta
   * @param {Date} [hoje] injetável para teste
   * @returns {{
   *   percentual:number, restante:number, diasRestantes:?number,
   *   mesesRestantes:?number, aporteMensalNecessario:?number,
   *   ritmoMensal:number, previsaoConclusao:?string,
   *   situacao:string, ajusteMensal:number
   * }}
   */
  calcularProjecao: function(meta, hoje) {
    var agora = METAS._agora(hoje);
    var base = this.calcularProgresso(meta, agora);

    var vazio = {
      percentual: base.percentual,
      restante: base.restante,
      diasRestantes: base.diasRestantes,
      mesesRestantes: null,
      aporteMensalNecessario: null,
      ritmoMensal: 0,
      previsaoConclusao: null,
      situacao: 'sem-prazo',
      ajusteMensal: 0
    };
    if (!meta) return vazio;

    // ── Ritmo demonstrado ────────────────────────────────────────────────
    // Quanto a pessoa vem guardando por mês desde que criou a meta. Um mês é
    // o piso: numa meta criada ontem, dividir por uma fração de mês daria um
    // ritmo fantasioso de dezenas de milhares por mês.
    var criadoEm = meta.criadoEm ? new Date(meta.criadoEm) : null;
    var mesesDecorridos = 0;
    if (criadoEm && !isNaN(criadoEm.getTime())) {
      mesesDecorridos = Math.max(0, METAS._mesesEntre(criadoEm, agora));
    }
    var ritmoMensal = mesesDecorridos >= 1
      ? UTILS.paraCentavos(meta.valorAtual) / 100 / mesesDecorridos
      : 0;

    if (base.concluida) {
      return Object.assign({}, vazio, {
        ritmoMensal: ritmoMensal,
        situacao: 'concluida',
        aporteMensalNecessario: 0,
        mesesRestantes: meta.prazo ? 0 : null
      });
    }

    // ── Previsão pelo ritmo atual ────────────────────────────────────────
    var previsaoConclusao = null;
    if (ritmoMensal > 0 && base.restante > 0) {
      var mesesAteConcluir = Math.ceil(base.restante / ritmoMensal);
      // addMesesClamp evita o transbordo de 31/01 -> 03/03 na projeção.
      previsaoConclusao = UTILS.addMesesClamp(UTILS.dataLocalIso(agora), mesesAteConcluir);
    }

    if (!meta.prazo) {
      return Object.assign({}, vazio, {
        ritmoMensal: ritmoMensal,
        previsaoConclusao: previsaoConclusao
      });
    }

    // ── Com prazo: quanto precisa por mês ────────────────────────────────
    var dias = base.diasRestantes;
    if (dias < 0) {
      return Object.assign({}, vazio, {
        mesesRestantes: 0,
        aporteMensalNecessario: base.restante,
        ritmoMensal: ritmoMensal,
        previsaoConclusao: previsaoConclusao,
        situacao: 'vencida',
        ajusteMensal: base.restante
      });
    }

    // Piso de 1: com o prazo dentro do mês corrente, o valor devido é o
    // restante inteiro — dividir por zero (ou por 0,4 mês) não faria sentido.
    var mesesRestantes = Math.max(1, Math.round(dias / 30.44));
    var aporteNecessario = base.restante / mesesRestantes;

    // Tolerância de 1%: exigir igualdade exata classificaria como "atrasado"
    // quem está a centavos do ritmo.
    var margem = aporteNecessario * 0.01;
    var situacao;
    if (ritmoMensal >= aporteNecessario + margem) situacao = 'adiantado';
    else if (ritmoMensal >= aporteNecessario - margem) situacao = 'no-ritmo';
    else situacao = 'atrasado';

    var ajuste = situacao === 'atrasado'
      ? Math.max(0, aporteNecessario - ritmoMensal)
      : 0;

    return {
      percentual: base.percentual,
      restante: base.restante,
      diasRestantes: dias,
      mesesRestantes: mesesRestantes,
      aporteMensalNecessario: aporteNecessario,
      ritmoMensal: ritmoMensal,
      previsaoConclusao: previsaoConclusao,
      situacao: situacao,
      ajusteMensal: ajuste
    };
  },

  /** Frase pronta para a UI. Vazia quando não há nada de acionável a dizer. */
  mensagemProjecao: function(meta, hoje) {
    var p = this.calcularProjecao(meta, hoje);
    var fmt = function(v) { return UTILS.formatarMoeda(v); };

    switch (p.situacao) {
      case 'concluida':
        return 'Meta alcançada.';
      case 'vencida':
        return 'Prazo vencido — faltam ' + fmt(p.restante) + '.';
      case 'atrasado':
        return 'Para chegar no prazo, aumente o aporte em ' + fmt(p.ajusteMensal) + ' por mês.';
      case 'adiantado':
        return 'Adiantado: no ritmo atual você chega antes do prazo.';
      case 'no-ritmo':
        return 'No ritmo certo: ' + fmt(p.aporteMensalNecessario) + ' por mês.';
      default:
        return p.previsaoConclusao
          ? 'No ritmo atual, conclui em ' + UTILS.formatarData(p.previsaoConclusao) + '.'
          : '';
    }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = METAS;
}
