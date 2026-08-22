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
  faturaDaCompra: function(nomeCartao, dataCompra) {
    var cartao = this.obter(nomeCartao);
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
   * Total e composição de uma fatura.
   *
   * @param {string} nomeCartao
   * @param {string} competencia 'YYYY-MM'
   * @returns {{competencia:string, total:number, transacoes:Array,
   *            fechamento:?string, vencimento:?string}}
   */
  fatura: function(nomeCartao, competencia) {
    var cartao = this.obter(nomeCartao);
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

      var f = CARTOES.faturaDaCompra(cartao.nome, t.data);
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
   * 'nao-confirmada' — venceu e ninguém disse se foi paga
   *
   * O último estado é o ponto: em vez de assumir em silêncio, o app admite
   * que não sabe e deixa a UI perguntar.
   */
  _statusFatura: function(cartao, competencia, totalCent, vencimento) {
    if (!totalCent) return 'vazia';
    if (this.faturaEstaPaga(cartao.nome, competencia)) return 'paga';
    if (!vencimento) return 'aberta';
    return vencimento < UTILS.dataLocalIso() ? 'nao-confirmada' : 'aberta';
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

    var pagos = Object.assign({}, this._pagamentos());
    pagos[this._chaveFatura(cartao.nome, competencia)] =
      String(dataPagamento || UTILS.dataLocalIso()).slice(0, 10);

    DADOS.salvarConfig({ faturasPagas: pagos });
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
    // Competências vencidas, com valor, e sem confirmação de pagamento.
    var vencidasSemConfirmacao = {};

    txs.forEach(function(t) {
      if (!t || t.tipo !== CONFIG.TIPO_DESPESA) return;
      if (UTILS.nomeDeConta(t.cartao).toLowerCase() !== alvo) return;

      if (!cartao.temCiclo) {
        // Sem ciclo não dá para saber o que já venceu: soma tudo, que é a
        // leitura conservadora.
        utilizadoCent += UTILS.paraCentavos(t.valor);
        return;
      }

      var f = CARTOES.faturaDaCompra(cartao.nome, t.data);
      if (!f) return;

      // Confirmada como paga: sai do limite na hora, mesmo antes de vencer.
      // É o caso de quem quita no dia 20 uma fatura que vence dia 28.
      if (CARTOES.faturaEstaPaga(cartao.nome, f.competencia)) return;

      if (f.vencimento < hojeIso) {
        // Venceu e ninguém confirmou. Continua FORA do cálculo — travar o
        // limite de quem simplesmente não usa o recurso seria pior —, mas
        // fica registrada para a interface poder perguntar em vez de o app
        // decidir sozinho.
        var comp = f.competencia;
        if (!vencidasSemConfirmacao[comp]) {
          vencidasSemConfirmacao[comp] = { competencia: comp, vencimento: f.vencimento, cent: 0 };
        }
        vencidasSemConfirmacao[comp].cent += UTILS.paraCentavos(t.valor);
        return;
      }

      utilizadoCent += UTILS.paraCentavos(t.valor);
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
      naoConfirmadas: naoConfirmadas
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
    var dias = UTILS.diasAte(fatura.vencimento);
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
      var total = this.totalComprometido(hoje);
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
      // até o 28 para ver o limite voltar.
      var acaoPagar = '';
      if (r.faturaAtual && r.faturaAtual.status === 'aberta' && r.faturaAtual.total > 0) {
        acaoPagar =
          '<button type="button" class="btn-secundario btn-sm cartao-acao"' +
            ' data-cartao-acao="pagar" data-cartao="' + nome + '"' +
            ' data-competencia="' + UTILS.escapeHtml(r.faturaAtual.competencia) + '">' +
            'Marcar fatura como paga' +
          '</button>';
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
        barra + faturas + acaoPagar + pendentes +
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
      if (btn.dataset.cartaoAcao !== 'pagar') return;

      CARTOES.marcarFaturaPaga(nome, competencia);
      if (typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
        UTILS.mostrarToast('Fatura de ' + CARTOES._rotuloCompetencia(competencia)
          + ' marcada como paga', 'success');
      }
      if (typeof atualizarDashboard === 'function') atualizarDashboard();
    });
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CARTOES;
}
