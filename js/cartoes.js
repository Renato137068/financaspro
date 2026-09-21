/**
 * cartoes.js — cartão de crédito como ciclo, não como rótulo.
 * v11.0 — Depende de: config.js, dados.js, utils.js
 *
 * Até aqui o app guardava só o nome do cartão em cada lançamento. Uma compra
 * parcelada em 12x abatia o saldo do mês da compra, quando o desembolso real
 * acontece em doze faturas futuras. Para quem usa cartão — praticamente todo
 * mundo — o número mais visível do app contava a história errada.
 *
 * O que define um cartão é o CICLO: a compra entra numa fatura, a fatura fecha
 * num dia e é paga em outro. Enquanto não vence, o dinheiro ainda está na
 * conta: comprometido, não gasto.
 *
 * MODELO SEM MIGRAÇÃO
 * As transações referenciam o cartão pelo NOME (campo `cartao`), e
 * `config.cartoes` já guardava `{ nome, bandeira, limite }`. Este módulo apenas
 * lê dois campos novos — `fechamento` e `vencimento` — no mesmo objeto. Nenhum
 * dado existente muda de forma, e cartões cadastrados antes continuam
 * funcionando, só que sem ciclo.
 */
var CARTOES = {

  /** Normaliza "hoje" aceitando Date de qualquer realm (ver UTILS._ehData). */
  _agora: function(valor) {
    return UTILS._ehData(valor) ? valor : new Date();
  },

  /** Lista bruta do cadastro, tolerando os dois formatos históricos. */
  _lista: function() {
    var config = (typeof DADOS !== 'undefined' && DADOS.getConfig) ? DADOS.getConfig() : {};
    return config.cartoes || [];
  },

  /**
   * Lê um cartão do cadastro pelo nome.
   *
   * A comparação ignora caixa e espaços porque o nome vem de digitação livre
   * em dois lugares diferentes — o cadastro e o formulário de lançamento — e
   * "nubank" nunca deveria ser um cartão diferente de "Nubank".
   *
   * @returns {?{nome:string, bandeira:?string, limite:?number,
   *             fechamento:?number, vencimento:?number, temCiclo:boolean}}
   */
  obter: function(nome) {
    var alvo = UTILS.nomeDeConta(nome).toLowerCase();
    if (!alvo) return null;

    var bruto = null;
    this._lista().forEach(function(c) {
      if (bruto) return;
      if (UTILS.nomeDeConta(c).toLowerCase() === alvo) bruto = c;
    });
    if (!bruto) return null;

    // Formato legado: só o nome, sem nenhum atributo.
    if (typeof bruto === 'string') {
      return {
        nome: bruto.trim(), bandeira: null, limite: null,
        fechamento: null, vencimento: null, temCiclo: false
      };
    }

    var fechamento = this._diaValido(bruto.fechamento);
    var vencimento = this._diaValido(bruto.vencimento);
    var limite = (bruto.limite === 0 || bruto.limite) ? Number(bruto.limite) : null;

    return {
      nome: UTILS.nomeDeConta(bruto),
      bandeira: bruto.bandeira || null,
      limite: (limite !== null && isFinite(limite) && limite > 0) ? limite : null,
      fechamento: fechamento,
      vencimento: vencimento,
      // Sem os dois dias não há ciclo: o app não deve inventar datas de fatura.
      temCiclo: fechamento !== null && vencimento !== null
    };
  },

  _diaValido: function(v) {
    var n = parseInt(v, 10);
    return (isFinite(n) && n >= 1 && n <= 31) ? n : null;
  },

  /** Último dia existente do mês, para não estourar dia 31 em fevereiro. */
  _diaNoMes: function(ano, mesIdx, dia) {
    var ultimo = new Date(ano, mesIdx + 1, 0).getDate();
    return Math.min(dia, ultimo);
  },

  _iso: function(ano, mesIdx, dia) {
    var d = this._diaNoMes(ano, mesIdx, dia);
    var alvo = new Date(ano, mesIdx, 1);
    return alvo.getFullYear() + '-'
      + String(alvo.getMonth() + 1).padStart(2, '0') + '-'
      + String(d).padStart(2, '0');
  },

  /**
   * Em qual fatura uma compra cai.
   *
   * Convenção brasileira: compra feita ATÉ o dia de fechamento entra na fatura
   * que fecha naquele mês; depois disso, vai para a seguinte. O vencimento cai
   * no mesmo mês do fechamento quando o dia de vencer é maior que o de fechar,
   * e no mês seguinte quando é menor ou igual — arranjo mais comum do mercado
   * (fecha dia 28, vence dia 5).
   *
   * @param {string} nomeCartao
   * @param {string} dataCompra YYYY-MM-DD
   * @returns {?{competencia:string, fechamento:string, vencimento:string}}
   */
  faturaDaCompra: function(nomeCartao, dataCompra, cartaoPre) {
    // cartaoPre: cartão já resolvido, passado pelos laços que iteram muitas
    // transações do MESMO cartão (fatura/resumo) — evita re-resolver obter()
    // (getConfig + varredura) por transação, O(N×C) por render do dashboard.
    var cartao = cartaoPre || this.obter(nomeCartao);
    if (!cartao || !cartao.temCiclo) return null;

    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dataCompra || ''));
    if (!m) return null;

    var ano = parseInt(m[1], 10);
    var mesIdx = parseInt(m[2], 10) - 1;
    var dia = parseInt(m[3], 10);

    // O dia de fechamento efetivo do mês da compra (clampado ao mês real).
    var fechaNesteMes = this._diaNoMes(ano, mesIdx, cartao.fechamento);

    // Passou do fechamento? Vai para o ciclo seguinte.
    if (dia > fechaNesteMes) mesIdx += 1;

    var anoFech = ano + Math.floor(mesIdx / 12);
    var mesFech = ((mesIdx % 12) + 12) % 12;

    // Vencimento: mesmo mês se vence depois de fechar; senão, mês seguinte.
    var mesVenc = mesFech;
    var anoVenc = anoFech;
    if (cartao.vencimento <= cartao.fechamento) {
      mesVenc += 1;
      anoVenc += Math.floor(mesVenc / 12);
      mesVenc = mesVenc % 12;
    }

    return {
      competencia: anoFech + '-' + String(mesFech + 1).padStart(2, '0'),
      fechamento: this._iso(anoFech, mesFech, cartao.fechamento),
      vencimento: this._iso(anoVenc, mesVenc, cartao.vencimento)
    };
  },

  /**
   * Melhor dia de compra — o dia seguinte ao fechamento.
   *
   * Uma compra feita logo APÓS o fechamento entra na próxima fatura, o que dá o
   * maior intervalo possível até o vencimento: o período sem juros máximo que o
   * cartão oferece. É o recurso que Mobills/Organizze destacam, e sai de graça
   * do ciclo que o app já modela.
   *
   * @param {string} nomeCartao
   * @param {Date} [hoje] injetável para teste
   * @returns {?{melhorDia:number, proximaData:string, fechamento:string,
   *             vencimento:string, diasSemJuros:number, temCiclo:boolean}}
   */
  melhorDiaCompra: function(nomeCartao, hoje) {
    var cartao = this.obter(nomeCartao);
    if (!cartao || !cartao.temCiclo) return null;

    var ref = (hoje && typeof hoje.getTime === 'function' && !isNaN(hoje.getTime()))
      ? hoje : new Date();
    var ano = ref.getFullYear();
    var mesIdx = ref.getMonth();

    // Dia seguinte ao fechamento deste mês, montado como data real para tratar
    // meses curtos (fechar dia 31 em fevereiro cai no último dia real).
    var melhor = new Date(ano, mesIdx, this._diaNoMes(ano, mesIdx, cartao.fechamento));
    melhor.setDate(melhor.getDate() + 1);

    // Se essa data já passou, aponta para o dia seguinte ao fechamento do
    // próximo mês — a recomendação é sempre a PRÓXIMA melhor janela.
    var hojeZero = new Date(ano, mesIdx, ref.getDate());
    if (melhor < hojeZero) {
      var mesProx = mesIdx + 1;
      var anoProx = ano + Math.floor(mesProx / 12);
      mesProx = ((mesProx % 12) + 12) % 12;
      melhor = new Date(anoProx, mesProx, this._diaNoMes(anoProx, mesProx, cartao.fechamento));
      melhor.setDate(melhor.getDate() + 1);
    }

    var iso = melhor.getFullYear() + '-'
      + String(melhor.getMonth() + 1).padStart(2, '0') + '-'
      + String(melhor.getDate()).padStart(2, '0');

    var fat = this.faturaDaCompra(cartao.nome, iso);
    if (!fat) return null;

    // Ambos ao meio-dia: contar dias entre 00:00 e 12:00 escorregaria de fuso.
    var compra = new Date(melhor.getFullYear(), melhor.getMonth(), melhor.getDate(), 12, 0, 0, 0);
    var venc = new Date(fat.vencimento + 'T12:00:00');
    var diasSemJuros = Math.round((venc.getTime() - compra.getTime()) / 86400000);

    return {
      melhorDia: melhor.getDate(),
      proximaData: iso,
      fechamento: fat.fechamento,
      vencimento: fat.vencimento,
      diasSemJuros: diasSemJuros,
      temCiclo: true
    };
  },

  /**
   * Total e composição de uma fatura.
   *
   * @param {string} nomeCartao
   * @param {string} competencia 'YYYY-MM'
   * @returns {{competencia:string, total:number, transacoes:Array,
   *            fechamento:?string, vencimento:?string}}
   */
  fatura: function(nomeCartao, competencia, cartaoPre) {
    // cartaoPre evita re-resolver obter() (getConfig + varredura) quando quem
    // chama já tem o cartão em mãos (ex.: COMPROMISSOS.porMes por competência).
    var cartao = cartaoPre || this.obter(nomeCartao);
    var vazia = {
      competencia: competencia, total: 0, transacoes: [],
      fechamento: null, vencimento: null
    };
    if (!cartao) return vazia;

    var alvo = cartao.nome.toLowerCase();
    var txs = (typeof DADOS !== 'undefined' && DADOS.getTransacoes)
      ? DADOS.getTransacoes() : [];

    var doCartao = [];
    var totalCent = 0;

    txs.forEach(function(t) {
      if (!t) return;
      // Só despesa: receita (estorno) e transferência não compõem fatura.
      if (t.tipo !== CONFIG.TIPO_DESPESA) return;
      if (UTILS.nomeDeConta(t.cartao).toLowerCase() !== alvo) return;

      var f = CARTOES.faturaDaCompra(cartao.nome, t.data, cartao);
      if (!f || f.competencia !== competencia) return;

      doCartao.push(t);
      totalCent += UTILS.paraCentavos(t.valor);
    });

    var datas = cartao.temCiclo
      ? CARTOES._datasDaCompetencia(cartao, competencia)
      : { fechamento: null, vencimento: null };

    return {
      competencia: competencia,
      total: totalCent / 100,
      transacoes: doCartao,
      fechamento: datas.fechamento,
      vencimento: datas.vencimento,
      status: this._statusFatura(cartao, competencia, totalCent, datas.vencimento)
    };
  },

  /**
   * Estado de uma fatura.
   *
   * 'vazia'          — sem compras; não há o que confirmar
   * 'paga'           — o usuário confirmou o pagamento
   * 'aberta'         — ainda não venceu
   * 'devida'         — venceu e o usuário confirmou que ainda deve
   * 'nao-confirmada' — venceu e ninguém disse se foi paga
   *
   * Os dois últimos são o ponto: em vez de assumir em silêncio, o app admite
   * que não sabe e deixa a UI perguntar — e, quando o usuário responde "ainda
   * devo", registra o fato ('devida') em vez de seguir supondo.
   */
  _statusFatura: function(cartao, competencia, totalCent, vencimento) {
    if (!totalCent) return 'vazia';
    if (this.faturaEstaPaga(cartao.nome, competencia)) return 'paga';
    if (!vencimento) return 'aberta';
    if (vencimento >= UTILS.dataLocalIso()) return 'aberta';
    return this.faturaConfirmadaDevida(cartao.nome, competencia) ? 'devida' : 'nao-confirmada';
  },

  // ───────────────────────────────────────────────────────────────────────
  // PAGAMENTO DE FATURA
  //
  // A Fase 5 assumia que fatura vencida foi paga. Era a hipótese menos
  // enganosa disponível, mas continuava sendo uma suposição silenciosa sobre
  // dinheiro — e errava nos dois extremos: quem paga adiantado ficava dias
  // vendo limite consumido que já estava livre, e quem atrasou via limite
  // disponível que não tinha.
  //
  // A saída não é trocar uma suposição por outra: é deixar confirmar, e —
  // quando não houve confirmação — dizer que não se sabe, em vez de fingir
  // que se sabe. Daí `naoConfirmadas`.
  // ───────────────────────────────────────────────────────────────────────

  /** Chave estável de uma fatura no registro de pagamentos. */
  _chaveFatura: function(nomeCartao, competencia) {
    return UTILS.nomeDeConta(nomeCartao).toLowerCase() + '|' + String(competencia || '');
  },

  _pagamentos: function() {
    var config = (typeof DADOS !== 'undefined' && DADOS.getConfig) ? DADOS.getConfig() : {};
    return config.faturasPagas || {};
  },

  /**
   * Registra o pagamento de uma fatura.
   * @param {string} nomeCartao
   * @param {string} competencia 'YYYY-MM'
   * @param {string} [dataPagamento] YYYY-MM-DD (padrão: hoje)
   * @returns {boolean} false se o cartão não existe
   */
  marcarFaturaPaga: function(nomeCartao, competencia, dataPagamento) {
    var cartao = this.obter(nomeCartao);
    if (!cartao || !competencia) return false;

    var chave = this._chaveFatura(cartao.nome, competencia);
    var pagos = Object.assign({}, this._pagamentos());
    pagos[chave] = String(dataPagamento || UTILS.dataLocalIso()).slice(0, 10);

    // Paga e "ainda devo" são estados mutuamente exclusivos: confirmar o
    // pagamento apaga qualquer marca de que a fatura seguia devida.
    var devidas = this._devidas();
    var patch = { faturasPagas: pagos };
    if (devidas[chave]) {
      devidas = Object.assign({}, devidas);
      delete devidas[chave];
      patch.faturasDevidas = devidas;
    }
    DADOS.salvarConfig(patch);
    return true;
  },

  /** Desfaz o registro de pagamento (o usuário marcou por engano). */
  desmarcarFaturaPaga: function(nomeCartao, competencia) {
    var cartao = this.obter(nomeCartao);
    if (!cartao) return false;

    var pagos = Object.assign({}, this._pagamentos());
    delete pagos[this._chaveFatura(cartao.nome, competencia)];
    DADOS.salvarConfig({ faturasPagas: pagos });
    return true;
  },

  /** Data em que a fatura foi paga, ou null. */
  pagamentoDaFatura: function(nomeCartao, competencia) {
    return this._pagamentos()[this._chaveFatura(nomeCartao, competencia)] || null;
  },

  faturaEstaPaga: function(nomeCartao, competencia) {
    return !!this.pagamentoDaFatura(nomeCartao, competencia);
  },

  // ───────────────────────────────────────────────────────────────────────
  // FATURA VENCIDA CONFIRMADA COMO "AINDA DEVO"
  //
  // A pergunta honesta do `naoConfirmadas` tinha só metade das respostas: dava
  // pra dizer "sim, paguei" (marcarFaturaPaga), mas não "não, ainda devo". Sem
  // isso, uma fatura vencida e não paga ficava fora do limite e do comprometido
  // — o app subestimava a dívida, que é o erro mais perigoso num app de dinheiro.
  //
  // A regra do módulo continua a mesma: o app não inventa fatos. A diferença é
  // que agora o FATO vem do usuário — ele confirma que ainda deve —, então
  // contar contra o limite deixa de ser suposição e passa a ser o que ele disse.
  // Vencida SEM resposta segue de fora (conservador, como antes).
  // ───────────────────────────────────────────────────────────────────────

  _devidas: function() {
    var config = (typeof DADOS !== 'undefined' && DADOS.getConfig) ? DADOS.getConfig() : {};
    return config.faturasDevidas || {};
  },

  /** Data em que o usuário confirmou que ainda deve a fatura, ou null. */
  confirmacaoDevida: function(nomeCartao, competencia) {
    return this._devidas()[this._chaveFatura(nomeCartao, competencia)] || null;
  },

  faturaConfirmadaDevida: function(nomeCartao, competencia) {
    return !!this.confirmacaoDevida(nomeCartao, competencia);
  },

  /**
   * Confirma que uma fatura vencida ainda não foi paga — passa a contar contra
   * o limite e o comprometido. Exclui o registro de "paga" da mesma competência,
   * já que os dois estados não coexistem.
   * @returns {boolean} false se o cartão não existe
   */
  confirmarFaturaDevida: function(nomeCartao, competencia, dataConfirmacao) {
    var cartao = this.obter(nomeCartao);
    if (!cartao || !competencia) return false;

    var chave = this._chaveFatura(cartao.nome, competencia);
    var devidas = Object.assign({}, this._devidas());
    devidas[chave] = String(dataConfirmacao || UTILS.dataLocalIso()).slice(0, 10);

    var patch = { faturasDevidas: devidas };
    var pagos = this._pagamentos();
    if (pagos[chave]) {
      pagos = Object.assign({}, pagos);
      delete pagos[chave];
      patch.faturasPagas = pagos;
    }
    DADOS.salvarConfig(patch);
    return true;
  },

  /** Desfaz o "ainda devo" (o usuário marcou por engano). */
  desmarcarFaturaDevida: function(nomeCartao, competencia) {
    var cartao = this.obter(nomeCartao);
    if (!cartao) return false;

    var devidas = Object.assign({}, this._devidas());
    delete devidas[this._chaveFatura(cartao.nome, competencia)];
    DADOS.salvarConfig({ faturasDevidas: devidas });
    return true;
  },

  /** Datas de fechamento e vencimento de uma competência 'YYYY-MM'. */
  _datasDaCompetencia: function(cartao, competencia) {
    var p = String(competencia || '').split('-');
    var ano = parseInt(p[0], 10);
    var mesIdx = parseInt(p[1], 10) - 1;
    if (!isFinite(ano) || !isFinite(mesIdx)) return { fechamento: null, vencimento: null };

    var mesVenc = mesIdx;
    var anoVenc = ano;
    if (cartao.vencimento <= cartao.fechamento) {
      mesVenc += 1;
      anoVenc += Math.floor(mesVenc / 12);
      mesVenc = mesVenc % 12;
    }

    return {
      fechamento: this._iso(ano, mesIdx, cartao.fechamento),
      vencimento: this._iso(anoVenc, mesVenc, cartao.vencimento)
    };
  },

  /** Competência de um deslocamento de meses a partir de hoje. */
  _competenciaDe: function(cartao, hoje, deslocamento) {
    var hojeIso = UTILS.dataLocalIso(hoje);
    var atual = this.faturaDaCompra(cartao.nome, hojeIso);
    if (!atual) return null;
    if (!deslocamento) return atual.competencia;

    var p = atual.competencia.split('-');
    var idx = parseInt(p[0], 10) * 12 + (parseInt(p[1], 10) - 1) + deslocamento;
    return Math.floor(idx / 12) + '-' + String((idx % 12) + 1).padStart(2, '0');
  },

  /**
   * Situação do cartão: limite, quanto está usado e quanto sobra.
   *
   * "Utilizado" soma as faturas ainda NÃO vencidas.
   *
   * O app ainda não registra pagamento de fatura. Assumir que o que já venceu
   * foi pago é a hipótese menos enganosa disponível: o contrário mostraria o
   * limite preso para sempre, e o usuário veria um cartão cheio que na vida
   * real está livre. A alternativa correta — marcar fatura como paga — é
   * trabalho de produto, não de cálculo, e está registrada como pendência.
   *
   * @param {string} nomeCartao
   * @param {Date} [hoje] injetável para teste
   */
  resumo: function(nomeCartao, hoje) {
    var cartao = this.obter(nomeCartao);
    if (!cartao) return null;

    var ref = this._agora(hoje);
    var hojeIso = UTILS.dataLocalIso(ref);
    var alvo = cartao.nome.toLowerCase();

    var txs = (typeof DADOS !== 'undefined' && DADOS.getTransacoes)
      ? DADOS.getTransacoes() : [];

    var utilizadoCent = 0;
    // Parte do utilizado que vem de faturas VENCIDAS que o usuário confirmou que
    // ainda deve. Separada porque a agenda (COMPROMISSOS.porMes) precisa jogá-la
    // no mês corrente para a soma continuar batendo com o comprometido.
    var devidoVencidoCent = 0;
    // Competências vencidas, com valor, e sem confirmação de pagamento.
    var vencidasSemConfirmacao = {};
    // Competências vencidas que o usuário confirmou que AINDA DEVE (contam no
    // limite; ficam visíveis para poder desfazer).
    var vencidasDevidas = {};

    txs.forEach(function(t) {
      if (!t || t.tipo !== CONFIG.TIPO_DESPESA) return;
      if (UTILS.nomeDeConta(t.cartao).toLowerCase() !== alvo) return;

      if (!cartao.temCiclo) {
        // Sem ciclo não dá para saber o que já venceu: soma tudo, que é a
        // leitura conservadora.
        utilizadoCent += UTILS.paraCentavos(t.valor);
        return;
      }

      var f = CARTOES.faturaDaCompra(cartao.nome, t.data, cartao);
      if (!f) return;

      // Confirmada como paga: sai do limite na hora, mesmo antes de vencer.
      // É o caso de quem quita no dia 20 uma fatura que vence dia 28.
      if (CARTOES.faturaEstaPaga(cartao.nome, f.competencia)) return;

      var centT = UTILS.paraCentavos(t.valor);

      if (f.vencimento < hojeIso) {
        var comp = f.competencia;
        // Venceu e o usuário confirmou que ainda deve: passa a contar no limite
        // e no comprometido — o fato veio dele, não é mais suposição do app.
        if (CARTOES.faturaConfirmadaDevida(cartao.nome, comp)) {
          utilizadoCent += centT;
          devidoVencidoCent += centT;
          if (!vencidasDevidas[comp]) {
            vencidasDevidas[comp] = { competencia: comp, vencimento: f.vencimento, cent: 0 };
          }
          vencidasDevidas[comp].cent += centT;
          return;
        }
        // Venceu e ninguém confirmou. Continua FORA do cálculo — travar o
        // limite de quem simplesmente não usa o recurso seria pior —, mas
        // fica registrada para a interface poder perguntar em vez de o app
        // decidir sozinho.
        if (!vencidasSemConfirmacao[comp]) {
          vencidasSemConfirmacao[comp] = { competencia: comp, vencimento: f.vencimento, cent: 0 };
        }
        vencidasSemConfirmacao[comp].cent += centT;
        return;
      }

      utilizadoCent += centT;
    });

    // Só as três mais recentes: a lista existe para provocar uma ação, não
    // para virar um histórico que ninguém lê.
    var naoConfirmadas = Object.keys(vencidasSemConfirmacao)
      .sort()
      .reverse()
      .slice(0, 3)
      .map(function(comp) {
        var r = vencidasSemConfirmacao[comp];
        return { competencia: r.competencia, vencimento: r.vencimento, total: r.cent / 100 };
      });

    // Confirmadas como devidas, da mais recente para a mais antiga (para desfazer).
    var devidas = Object.keys(vencidasDevidas)
      .sort()
      .reverse()
      .map(function(comp) {
        var r = vencidasDevidas[comp];
        return { competencia: r.competencia, vencimento: r.vencimento, total: r.cent / 100 };
      });

    var utilizado = utilizadoCent / 100;
    var limiteCent = cartao.limite !== null ? UTILS.paraCentavos(cartao.limite) : null;

    var faturaAtual = null;
    var proximaFatura = null;
    if (cartao.temCiclo) {
      var compAtual = this._competenciaDe(cartao, ref, 0);
      var compProx = this._competenciaDe(cartao, ref, 1);
      if (compAtual) faturaAtual = this.fatura(cartao.nome, compAtual);
      if (compProx) proximaFatura = this.fatura(cartao.nome, compProx);
    }

    return {
      nome: cartao.nome,
      bandeira: cartao.bandeira,
      temCiclo: cartao.temCiclo,
      limite: cartao.limite,
      utilizado: utilizado,
      disponivel: limiteCent === null ? null : Math.max(0, limiteCent - utilizadoCent) / 100,
      percentualUso: limiteCent ? Math.round((utilizadoCent / limiteCent) * 100) : 0,
      estourado: limiteCent !== null && utilizadoCent > limiteCent,
      faturaAtual: faturaAtual,
      proximaFatura: proximaFatura,
      naoConfirmadas: naoConfirmadas,
      // Faturas vencidas confirmadas como "ainda devo" (já contam no utilizado).
      vencidasDevidas: devidas,
      // Parte do utilizado que veio delas — usada pela agenda mês a mês.
      devidoVencido: devidoVencidoCent / 100
    };
  },

  /** Resumo de todos os cartões, do mais comprometido para o menos. */
  listarResumos: function(hoje) {
    var self = this;
    return this._lista()
      .map(function(c) { return self.resumo(UTILS.nomeDeConta(c), hoje); })
      .filter(Boolean)
      .sort(function(a, b) { return b.utilizado - a.utilizado; });
  },

  /**
   * Total comprometido em todos os cartões — o que ainda vai sair da conta.
   * Consumido por COMPROMISSOS para compor o "disponível para gastar".
   */
  totalComprometido: function(hoje) {
    var cent = this.listarResumos(hoje).reduce(function(acc, r) {
      return acc + UTILS.paraCentavos(r.utilizado);
    }, 0);
    return cent / 100;
  },

  // ───────────────────────────────────────────────────────────────────────
  // RENDER
  // ───────────────────────────────────────────────────────────────────────

  _lucide: function(nome) {
    if (typeof lucideIconHtml === 'function') return lucideIconHtml(nome);
    return '<i data-lucide="' + (nome || 'credit-card') + '" aria-hidden="true"></i>';
  },

  /** Rótulo curto do próximo vencimento — o que o usuário precisa saber. */
  _rotuloVencimento: function(fatura, hoje) {
    if (!fatura || !fatura.vencimento) return '';
    var dias = UTILS.diasAte(fatura.vencimento, hoje);
    if (!isFinite(dias)) return '';
    if (dias < 0) return 'vencida';
    if (dias === 0) return 'vence hoje';
    if (dias === 1) return 'vence amanhã';
    return 'vence em ' + dias + ' dias';
  },

  render: function(hoje) {
    var secao = document.getElementById('secao-cartoes');
    var lista = document.getElementById('cartoes-lista');
    var totalEl = document.getElementById('cartoes-total');
    if (!lista) return;

    var resumos = this.listarResumos(hoje);
    if (resumos.length === 0) {
      if (secao) secao.style.display = 'none';
      return;
    }
    if (secao) secao.style.display = '';

    if (totalEl) {
      // Reusa os resumos já calculados em vez de chamar totalComprometido, que
      // rodaria listarResumos (resumo por cartão + varredura de transações) de novo.
      var total = resumos.reduce(function(acc, r) {
        return acc + UTILS.paraCentavos(r.utilizado);
      }, 0) / 100;
      totalEl.textContent = total > 0 ? UTILS.formatarMoeda(total) + ' em faturas' : '';
    }

    var self = this;
    lista.innerHTML = resumos.map(function(r) {
      var nome = UTILS.escapeHtml(r.nome);

      // Barra de uso só faz sentido com limite declarado.
      var barra = '';
      if (r.limite !== null) {
        var pct = Math.min(100, r.percentualUso);
        var classe = r.estourado ? 'estourado' : (pct >= 80 ? 'alerta' : 'ok');
        barra =
          '<div class="cartao-barra" role="img" aria-label="'
            + r.percentualUso + '% do limite utilizado">' +
            '<div class="cartao-barra-fill ' + classe + '" style="width:' + pct + '%"></div>' +
          '</div>' +
          '<div class="cartao-limite-linha">' +
            '<span>' + UTILS.escapeHtml(UTILS.formatarMoeda(r.utilizado)) + ' de '
              + UTILS.escapeHtml(UTILS.formatarMoeda(r.limite)) + '</span>' +
            '<span class="cartao-disponivel' + (r.estourado ? ' estourado' : '') + '">' +
              (r.estourado
                ? 'limite estourado'
                : UTILS.escapeHtml(UTILS.formatarMoeda(r.disponivel)) + ' livres') +
            '</span>' +
          '</div>';
      } else {
        barra = '<div class="cartao-limite-linha"><span>'
          + UTILS.escapeHtml(UTILS.formatarMoeda(r.utilizado)) + ' em aberto</span></div>';
      }

      // Faturas: só aparecem quando o cartão tem ciclo configurado. Sem
      // fechamento e vencimento o app não sabe — e não deve inventar — datas.
      var faturas = '';
      if (r.temCiclo && r.faturaAtual) {
        var venc = self._rotuloVencimento(r.faturaAtual, hoje);
        faturas =
          '<div class="cartao-faturas">' +
            '<div class="cartao-fatura">' +
              '<span class="cartao-fatura-rot">Fatura atual' +
                (venc ? ' · ' + UTILS.escapeHtml(venc) : '') + '</span>' +
              '<strong>' + UTILS.escapeHtml(UTILS.formatarMoeda(r.faturaAtual.total)) + '</strong>' +
            '</div>' +
            (r.proximaFatura
              ? '<div class="cartao-fatura">' +
                  '<span class="cartao-fatura-rot">Próxima</span>' +
                  '<strong>' + UTILS.escapeHtml(UTILS.formatarMoeda(r.proximaFatura.total)) + '</strong>' +
                '</div>'
              : '') +
          '</div>';
      } else if (!r.temCiclo) {
        faturas = '<p class="cartao-sem-ciclo">Informe fechamento e vencimento '
          + 'para acompanhar as faturas.</p>';
      }

      // Botão de quitar a fatura aberta: quem paga no dia 20 não deve esperar
      // até o 28 para ver o limite voltar. E, se marcou por engano, precisa de
      // uma saída — sem o "Desmarcar", um toque errado prendia o dinheiro fora
      // do limite sem volta pela interface, embora o backend já soubesse desfazer.
      var acaoPagar = '';
      if (r.faturaAtual && r.faturaAtual.total > 0) {
        if (r.faturaAtual.status === 'aberta') {
          acaoPagar =
            '<button type="button" class="btn-secundario btn-sm cartao-acao"' +
              ' data-cartao-acao="pagar" data-cartao="' + nome + '"' +
              ' data-competencia="' + UTILS.escapeHtml(r.faturaAtual.competencia) + '">' +
              'Marcar fatura como paga' +
            '</button>';
        } else if (r.faturaAtual.status === 'paga') {
          acaoPagar =
            '<div class="cartao-fatura-paga">' +
              '<span class="cartao-fatura-paga-selo">' + self._lucide('check-circle') + ' Fatura paga</span>' +
              '<button type="button" class="btn-ghost btn-sm cartao-acao"' +
                ' data-cartao-acao="desmarcar" data-cartao="' + nome + '"' +
                ' data-competencia="' + UTILS.escapeHtml(r.faturaAtual.competencia) + '">' +
                'Desmarcar' +
              '</button>' +
            '</div>';
        }
      }

      // Faturas vencidas sem confirmação. O app NÃO afirma que estão em
      // aberto — ele admite que não sabe e pergunta. É a diferença entre
      // uma suposição silenciosa e uma pergunta honesta.
      var pendentes = '';
      if (r.naoConfirmadas && r.naoConfirmadas.length) {
        pendentes = '<div class="cartao-pendentes">' +
          r.naoConfirmadas.map(function(f) {
            return '<div class="cartao-pendente">' +
              '<span>Fatura de ' + UTILS.escapeHtml(self._rotuloCompetencia(f.competencia))
                + ' · ' + UTILS.escapeHtml(UTILS.formatarMoeda(f.total))
                + ' — foi paga?</span>' +
              '<span class="cartao-pendente-acoes">' +
                '<button type="button" class="btn-ghost btn-sm"' +
                  ' data-cartao-acao="pagar" data-cartao="' + nome + '"' +
                  ' data-competencia="' + UTILS.escapeHtml(f.competencia) + '">Sim</button>' +
                '<button type="button" class="btn-ghost btn-sm"' +
                  ' data-cartao-acao="devo" data-cartao="' + nome + '"' +
                  ' data-competencia="' + UTILS.escapeHtml(f.competencia) + '">Não, ainda devo</button>' +
              '</span>' +
            '</div>';
          }).join('') +
        '</div>';
      }

      // Faturas vencidas que o usuário confirmou que ainda deve: já contam no
      // limite. Ficam visíveis para poder marcar como paga ou desfazer o "devo".
      var devidas = '';
      if (r.vencidasDevidas && r.vencidasDevidas.length) {
        devidas = '<div class="cartao-devidas">' +
          r.vencidasDevidas.map(function(f) {
            return '<div class="cartao-pendente cartao-devida">' +
              '<span>Fatura de ' + UTILS.escapeHtml(self._rotuloCompetencia(f.competencia))
                + ' · ' + UTILS.escapeHtml(UTILS.formatarMoeda(f.total))
                + ' — em aberto (você confirmou que ainda deve)</span>' +
              '<span class="cartao-pendente-acoes">' +
                '<button type="button" class="btn-ghost btn-sm"' +
                  ' data-cartao-acao="pagar" data-cartao="' + nome + '"' +
                  ' data-competencia="' + UTILS.escapeHtml(f.competencia) + '">Marcar paga</button>' +
                '<button type="button" class="btn-ghost btn-sm"' +
                  ' data-cartao-acao="devo-desfazer" data-cartao="' + nome + '"' +
                  ' data-competencia="' + UTILS.escapeHtml(f.competencia) + '">Desfazer</button>' +
              '</span>' +
            '</div>';
          }).join('') +
        '</div>';
      }

      return '<article class="cartao-card">' +
        '<div class="cartao-header">' +
          '<span class="cartao-icon" aria-hidden="true">' + self._lucide('credit-card') + '</span>' +
          '<div class="cartao-titulos">' +
            '<h3 class="cartao-nome">' + nome + '</h3>' +
            (r.bandeira ? '<span class="cartao-bandeira">' + UTILS.escapeHtml(r.bandeira) + '</span>' : '') +
          '</div>' +
        '</div>' +
        barra + faturas + acaoPagar + pendentes + devidas +
      '</article>';
    }).join('');

    if (typeof renderLucideIcons === 'function') renderLucideIcons(lista);
    this._bindAcoes(lista);
  },

  /** '2026-08' → 'agosto/2026' */
  _rotuloCompetencia: function(competencia) {
    var meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
      'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    var p = String(competencia || '').split('-');
    var idx = parseInt(p[1], 10) - 1;
    return (meses[idx] || competencia) + '/' + p[0];
  },

  _acoesBound: false,

  _bindAcoes: function(container) {
    if (this._acoesBound || !container) return;
    this._acoesBound = true;

    container.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-cartao-acao]');
      if (!btn) return;

      var nome = btn.dataset.cartao;
      var competencia = btn.dataset.competencia;
      var acao = btn.dataset.cartaoAcao;
      var ACOES = { pagar: 1, desmarcar: 1, devo: 1, 'devo-desfazer': 1 };
      if (!ACOES[acao]) return;

      var rotulo = CARTOES._rotuloCompetencia(competencia);
      var msg, tom = 'success';
      if (acao === 'desmarcar') {
        CARTOES.desmarcarFaturaPaga(nome, competencia);
        msg = 'Fatura de ' + rotulo + ' voltou para em aberto';
        tom = 'info';
      } else if (acao === 'devo') {
        CARTOES.confirmarFaturaDevida(nome, competencia);
        msg = 'Fatura de ' + rotulo + ' contabilizada como ainda devida';
        tom = 'info';
      } else if (acao === 'devo-desfazer') {
        CARTOES.desmarcarFaturaDevida(nome, competencia);
        msg = 'Fatura de ' + rotulo + ' saiu do limite comprometido';
        tom = 'info';
      } else {
        CARTOES.marcarFaturaPaga(nome, competencia);
        msg = 'Fatura de ' + rotulo + ' marcada como paga';
      }
      if (typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
        UTILS.mostrarToast(msg, tom);
      }
      if (typeof atualizarDashboard === 'function') atualizarDashboard();
    });
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CARTOES;
}
