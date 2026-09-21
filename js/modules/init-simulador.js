/**
 * init-simulador.js — UI da calculadora financeira (SIMULADOR).
 *
 * Três modos numa sub-tela do Perfil: "à vista vs parcelado", "poupar" (juros
 * compostos) e "financiamento" (Tabela Price). Toda a conta vive em
 * simulador.js (puro e testado); aqui é só ler o formulário, chamar e desenhar
 * o resultado. Nada é salvo — é uma ferramenta de decisão, não um cadastro.
 */
const INIT_SIMULADOR = {
  _bound: false,
  _modo: 'parcelado',

  init: function() {
    if (this._bound) return;
    this._bound = true;
    var self = this;

    document.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-action]');
      if (!btn) return;
      var action = btn.dataset.action;
      if (action === 'sim-modo') {
        e.preventDefault();
        self._modo = btn.dataset.modo || 'parcelado';
        self.render();
      } else if (action === 'sim-calc-parcelado') {
        e.preventDefault();
        self._calcParcelado();
      } else if (action === 'sim-calc-juros') {
        e.preventDefault();
        self._calcJuros();
      } else if (action === 'sim-calc-financiamento') {
        e.preventDefault();
        self._calcFinanciamento();
      } else if (action === 'sim-calc-meta') {
        e.preventDefault();
        self._calcMeta();
      } else if (action === 'sim-criar-meta') {
        e.preventDefault();
        self._criarMeta();
      }
    });

    // Enter dentro de um input dispara o cálculo do modo ativo.
    document.addEventListener('keydown', function(e) {
      if (e.key !== 'Enter') return;
      var alvo = e.target;
      if (!alvo || !alvo.id || alvo.id.indexOf('sim-') !== 0) return;
      var panel = document.getElementById('simulador-panel');
      if (!panel || !panel.contains(alvo)) return;
      e.preventDefault();
      if (self._modo === 'parcelado') self._calcParcelado();
      else if (self._modo === 'poupar') self._calcJuros();
      else if (self._modo === 'financiamento') self._calcFinanciamento();
      else if (self._modo === 'meta') self._calcMeta();
    });
  },

  // ─── helpers de leitura ─────────────────────────────────────────────────
  _moeda: function(id) {
    var el = document.getElementById(id);
    if (!el || !el.value) return 0;
    return (typeof UTILS !== 'undefined' && UTILS.parseMoeda) ? UTILS.parseMoeda(el.value) : parseFloat(el.value) || 0;
  },

  /** Percentual ao mês → decimal (0,8 → 0.008). Vazio → 0. */
  _pct: function(id) {
    var el = document.getElementById(id);
    if (!el || !el.value) return 0;
    var n = parseFloat(String(el.value).replace(',', '.'));
    return isFinite(n) ? n / 100 : 0;
  },

  _int: function(id) {
    var el = document.getElementById(id);
    if (!el || !el.value) return 0;
    var n = parseInt(el.value, 10);
    return isFinite(n) ? n : 0;
  },

  _fmt: function(v) {
    return (typeof UTILS !== 'undefined' && UTILS.formatarMoeda) ? UTILS.formatarMoeda(v) : ('R$ ' + Number(v).toFixed(2));
  },

  _pctTexto: function(dec) {
    var n = Math.round(dec * 10000) / 100;
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
  },

  // ─── render ─────────────────────────────────────────────────────────────
  render: function() {
    var panel = document.getElementById('simulador-panel');
    if (!panel) return;
    if (typeof SIMULADOR === 'undefined') {
      panel.innerHTML = '<p class="sim-empty">Calculadora indisponível.</p>';
      return;
    }

    var modos = [
      { id: 'parcelado', rotulo: 'À vista ou parcelado', icone: 'scale' },
      { id: 'poupar', rotulo: 'Poupar', icone: 'piggy-bank' },
      { id: 'meta', rotulo: 'Meta', icone: 'target' },
      { id: 'financiamento', rotulo: 'Financiamento', icone: 'landmark' },
    ];
    var tabs = '<div class="sim-tabs" role="tablist" aria-label="Tipo de simulação">';
    for (var i = 0; i < modos.length; i++) {
      var m = modos[i];
      var ativo = m.id === this._modo;
      tabs += '<button type="button" class="sim-tab' + (ativo ? ' sim-tab--ativo' : '') + '"' +
        ' role="tab" aria-selected="' + (ativo ? 'true' : 'false') + '"' +
        ' data-action="sim-modo" data-modo="' + m.id + '">' +
        '<i data-lucide="' + m.icone + '" aria-hidden="true"></i><span>' + m.rotulo + '</span>' +
        '</button>';
    }
    tabs += '</div>';

    var corpo;
    if (this._modo === 'poupar') corpo = this._formPoupar();
    else if (this._modo === 'meta') corpo = this._formMeta();
    else if (this._modo === 'financiamento') corpo = this._formFinanciamento();
    else corpo = this._formParcelado();

    panel.innerHTML = tabs +
      '<div class="sim-form">' + corpo + '</div>' +
      '<div class="sim-resultado" id="sim-resultado" aria-live="polite"></div>';

    if (typeof window !== 'undefined' && window.renderLucideIcons) window.renderLucideIcons();
  },

  _campo: function(id, rotulo, atributos, dica) {
    return '<div class="sim-campo">' +
      '<label class="sim-label" for="' + id + '">' + rotulo + '</label>' +
      '<input class="form-input sim-input" id="' + id + '" ' + (atributos || '') + '>' +
      (dica ? '<small class="sim-dica">' + dica + '</small>' : '') +
      '</div>';
  },

  _formParcelado: function() {
    return '<p class="sim-intro">Compare pagar agora com parcelar. Se você informar quanto seu dinheiro rende, o app decide pelo valor de hoje — parcelar sem juros e deixar rendendo pode valer mais que pagar à vista.</p>' +
      this._campo('sim-p-vista', 'Preço à vista', 'inputmode="decimal" placeholder="R$ 0,00"') +
      this._campo('sim-p-num', 'Nº de parcelas', 'inputmode="numeric" placeholder="12"') +
      this._campo('sim-p-parcela', 'Valor de cada parcela', 'inputmode="decimal" placeholder="R$ 0,00"') +
      this._campo('sim-p-rende', 'Rendimento do seu dinheiro (% ao mês)', 'inputmode="decimal" placeholder="0,80"', 'Opcional. Ex.: poupança ~0,5% · CDI ~0,9%.') +
      '<button type="button" class="btn-primario sim-btn" data-action="sim-calc-parcelado">Comparar</button>';
  },

  _formPoupar: function() {
    return '<p class="sim-intro">Veja quanto um valor guardado, com aportes mensais, vira ao longo do tempo com juros compostos.</p>' +
      this._campo('sim-j-inicial', 'Valor inicial', 'inputmode="decimal" placeholder="R$ 0,00"') +
      this._campo('sim-j-aporte', 'Aporte mensal', 'inputmode="decimal" placeholder="R$ 0,00"') +
      this._campo('sim-j-taxa', 'Rendimento (% ao mês)', 'inputmode="decimal" placeholder="0,80"') +
      this._campo('sim-j-meses', 'Prazo (meses)', 'inputmode="numeric" placeholder="12"') +
      '<button type="button" class="btn-primario sim-btn" data-action="sim-calc-juros">Calcular</button>';
  },

  _formMeta: function() {
    return '<p class="sim-intro">Diga quanto quer juntar e em quanto tempo — o app calcula o valor que você precisa guardar por mês para chegar lá.</p>' +
      this._campo('sim-m-objetivo', 'Quero juntar', 'inputmode="decimal" placeholder="R$ 0,00"') +
      this._campo('sim-m-meses', 'Em quantos meses', 'inputmode="numeric" placeholder="24"') +
      this._campo('sim-m-inicial', 'Já tenho guardado', 'inputmode="decimal" placeholder="R$ 0,00"', 'Opcional.') +
      this._campo('sim-m-taxa', 'Rendimento (% ao mês)', 'inputmode="decimal" placeholder="0,80"', 'Opcional. Ex.: poupança ~0,5% · CDI ~0,9%.') +
      '<button type="button" class="btn-primario sim-btn" data-action="sim-calc-meta">Calcular</button>';
  },

  _formFinanciamento: function() {
    return '<p class="sim-intro">Descubra o custo real de um financiamento pela Tabela Price (parcela fixa): quanto fica a parcela e quanto do total é só juros.</p>' +
      this._campo('sim-f-valor', 'Valor do bem', 'inputmode="decimal" placeholder="R$ 0,00"') +
      this._campo('sim-f-entrada', 'Entrada', 'inputmode="decimal" placeholder="R$ 0,00"') +
      this._campo('sim-f-taxa', 'Juros (% ao mês)', 'inputmode="decimal" placeholder="1,50"') +
      this._campo('sim-f-num', 'Nº de parcelas', 'inputmode="numeric" placeholder="48"') +
      '<button type="button" class="btn-primario sim-btn" data-action="sim-calc-financiamento">Calcular</button>';
  },

  _erro: function(msg) {
    var out = document.getElementById('sim-resultado');
    if (out) out.innerHTML = '<div class="sim-aviso"><i data-lucide="alert-circle" aria-hidden="true"></i> ' +
      (typeof UTILS !== 'undefined' && UTILS.escapeHtml ? UTILS.escapeHtml(msg) : msg) + '</div>';
    if (typeof window !== 'undefined' && window.renderLucideIcons) window.renderLucideIcons();
  },

  _mostrar: function(html) {
    var out = document.getElementById('sim-resultado');
    if (out) out.innerHTML = html;
    if (typeof window !== 'undefined' && window.renderLucideIcons) window.renderLucideIcons();
  },

  _linha: function(rotulo, valor, destaque) {
    return '<div class="sim-res-linha' + (destaque ? ' sim-res-linha--forte' : '') + '">' +
      '<span>' + rotulo + '</span><strong>' + valor + '</strong></div>';
  },

  // ─── cálculos ───────────────────────────────────────────────────────────
  _calcParcelado: function() {
    var r = SIMULADOR.compararParcelado({
      precoVista: this._moeda('sim-p-vista'),
      numParcelas: this._int('sim-p-num'),
      valorParcela: this._moeda('sim-p-parcela'),
      taxaInvestimento: this._pct('sim-p-rende'),
    });
    if (!r.valido) { this._erro(r.motivo); return; }

    var vereditos = {
      vista: { classe: 'sim-veredito--vista', icone: 'wallet', texto: 'Compensa pagar à vista' },
      parcelado: { classe: 'sim-veredito--parcelado', icone: 'calendar-clock', texto: 'Compensa parcelar' },
      indiferente: { classe: 'sim-veredito--neutro', icone: 'scale', texto: 'Tanto faz — dá no mesmo' },
    };
    var v = vereditos[r.vantagem] || vereditos.indiferente;

    var detalhe;
    if (r.vantagem === 'indiferente') {
      detalhe = 'À vista e parcelado custam o mesmo em dinheiro de hoje.';
    } else if (r.vantagem === 'vista') {
      detalhe = 'Pagar à vista economiza <strong>' + this._fmt(r.economia) + '</strong> em dinheiro de hoje.';
    } else {
      detalhe = 'Parcelar (e deixar o dinheiro rendendo) economiza <strong>' + this._fmt(r.economia) + '</strong> em dinheiro de hoje.';
    }

    var html = '<div class="sim-veredito ' + v.classe + '">' +
      '<i data-lucide="' + v.icone + '" aria-hidden="true"></i>' +
      '<div><strong>' + v.texto + '</strong><span>' + detalhe + '</span></div></div>';

    html += '<div class="sim-res-bloco">';
    html += this._linha('Total à vista', this._fmt(r.precoVista));
    html += this._linha('Total parcelado', this._fmt(r.totalParcelado) + ' (' + r.numParcelas + 'x ' + this._fmt(r.valorParcela) + ')');
    if (r.semJuros) {
      html += this._linha('Juros do parcelamento', 'sem juros', true);
    } else {
      html += this._linha('Acréscimo do parcelamento', this._fmt(r.acrescimo) + ' (' + r.acrescimoPct.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%)');
      html += this._linha('Juros embutidos', this._pctTexto(r.taxaMensal) + ' ao mês · ' + this._pctTexto(r.taxaAnual) + ' ao ano', true);
    }
    html += '</div>';
    this._mostrar(html);
  },

  _calcJuros: function() {
    var r = SIMULADOR.jurosCompostos({
      principal: this._moeda('sim-j-inicial'),
      aporteMensal: this._moeda('sim-j-aporte'),
      taxaMensal: this._pct('sim-j-taxa'),
      meses: this._int('sim-j-meses'),
    });
    if (!r.valido) { this._erro(r.motivo); return; }

    var html = '<div class="sim-veredito sim-veredito--parcelado">' +
      '<i data-lucide="trending-up" aria-hidden="true"></i>' +
      '<div><strong>' + this._fmt(r.montante) + '</strong>' +
      '<span>é quanto você terá em ' + r.meses + (r.meses > 1 ? ' meses' : ' mês') + '.</span></div></div>';

    html += '<div class="sim-res-bloco">';
    html += this._linha('Total investido', this._fmt(r.totalAportado));
    html += this._linha('Juros ganhos', this._fmt(r.jurosGanhos), true);
    html += this._linha('Rendimento no período', this._pctTexto(r.taxaAnual) + ' ao ano');
    html += '</div>';
    this._mostrar(html);
  },

  /**
   * Folga mensal média do usuário (receitas − despesas por mês) pelos últimos
   * meses com dados. null quando não há histórico suficiente para uma média
   * honesta — melhor não opinar do que opinar com base num mês só.
   */
  _folgaMensal: function() {
    if (typeof RELATORIOS === 'undefined' || !RELATORIOS.resumoPeriodo) return null;
    // Começa no MÊS PASSADO, não no corrente: o mês em curso está incompleto e
    // entraria como um mês "cheio" na média, subestimando a folga no começo do
    // mês e fazendo o veredito oscilar conforme o dia em que se calcula.
    var agora = new Date();
    var mesAnterior = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
    var r = RELATORIOS.resumoPeriodo(mesAnterior.getMonth() + 1, mesAnterior.getFullYear(), 6);
    if (!r || !r.mesesComDados || r.mesesComDados < 2) return null;
    return r.saldo / r.mesesComDados;
  },

  /** Nota "cabe no seu mês?" comparando o aporte com a folga média. */
  _notaFolga: function(aporte) {
    var folga = this._folgaMensal();
    if (folga == null) return '';
    if (folga <= 0) {
      return '<div class="sim-nota sim-nota--aviso">' +
        '<i data-lucide="alert-circle" aria-hidden="true"></i> ' +
        'Hoje seus gastos consomem toda a renda — não sobra para este aporte. ' +
        'Rever o orçamento vem antes de mirar a meta.</div>';
    }
    if (aporte <= folga) {
      return '<div class="sim-nota sim-nota--ok">' +
        '<i data-lucide="check-circle" aria-hidden="true"></i> ' +
        'Cabe no seu mês: sobram em média ' + this._fmt(folga) + ' por mês.</div>';
    }
    return '<div class="sim-nota sim-nota--aviso">' +
      '<i data-lucide="alert-circle" aria-hidden="true"></i> ' +
      'Puxado: sobra em média ' + this._fmt(folga) + ' por mês, menos que o aporte. ' +
      'Considere um prazo maior ou uma meta menor.</div>';
  },

  _calcMeta: function() {
    var r = SIMULADOR.aporteParaMeta({
      objetivo: this._moeda('sim-m-objetivo'),
      meses: this._int('sim-m-meses'),
      inicial: this._moeda('sim-m-inicial'),
      taxaMensal: this._pct('sim-m-taxa'),
    });
    if (!r.valido) { this._erro(r.motivo); return; }

    var html;
    if (r.jaAlcanca) {
      html = '<div class="sim-veredito sim-veredito--parcelado">' +
        '<i data-lucide="party-popper" aria-hidden="true"></i>' +
        '<div><strong>Você já chega lá</strong>' +
        '<span>O que você já tem, rendendo, alcança a meta no prazo — sem precisar guardar mais.</span></div></div>';
    } else {
      html = '<div class="sim-veredito sim-veredito--vista">' +
        '<i data-lucide="target" aria-hidden="true"></i>' +
        '<div><strong>' + this._fmt(r.aporteMensal) + ' por mês</strong>' +
        '<span>para juntar ' + this._fmt(r.objetivo) + ' em ' + r.meses + (r.meses > 1 ? ' meses' : ' mês') + '.</span></div></div>';
    }

    html += '<div class="sim-res-bloco">';
    html += this._linha('Meta', this._fmt(r.objetivo));
    if (r.inicial > 0) html += this._linha('Já tenho guardado', this._fmt(r.inicial));
    html += this._linha('Guardar por mês', this._fmt(r.aporteMensal), true);
    html += this._linha('Total que você vai guardar', this._fmt(r.totalAportado));
    if (r.jurosGanhos > 0) html += this._linha('Juros ajudam com', this._fmt(r.jurosGanhos), true);
    html += '</div>';

    // Aterrissa o número na realidade do usuário: o aporte cabe na folga que ele
    // costuma ter no mês? Sem isso o "guarde R$ X/mês" é genérico; com isso vira
    // conselho pessoal. Só aparece quando há histórico suficiente para uma média.
    if (!r.jaAlcanca) html += this._notaFolga(r.aporteMensal);

    // Transforma o cálculo em ação: cria a meta no app com o objetivo, o prazo
    // e o quanto já se tem. Só oferece quando o módulo de metas existe.
    if (typeof METAS !== 'undefined' && METAS.criar) {
      html += '<div class="sim-cta">' +
        '<label class="sim-label" for="sim-m-nome">Salvar como meta</label>' +
        '<input class="form-input sim-input" id="sim-m-nome" maxlength="60" placeholder="Ex.: Viagem, Reserva de emergência">' +
        '<button type="button" class="btn-secundario sim-btn" data-action="sim-criar-meta">' +
        '<i data-lucide="target" aria-hidden="true"></i> Criar meta no app</button>' +
        '</div>';
    }
    this._mostrar(html);
  },

  /** hoje + meses como YYYY-MM-DD (local), sem depender de UTILS. */
  _prazoFallback: function(meses) {
    var d = new Date();
    d.setMonth(d.getMonth() + meses);
    var mm = String(d.getMonth() + 1);
    var dd = String(d.getDate());
    return d.getFullYear() + '-' + (mm.length < 2 ? '0' + mm : mm) + '-' + (dd.length < 2 ? '0' + dd : dd);
  },

  /** Cria uma meta a partir do que foi simulado no modo "Meta". */
  _criarMeta: function() {
    if (typeof METAS === 'undefined' || !METAS.criar) return;
    var r = SIMULADOR.aporteParaMeta({
      objetivo: this._moeda('sim-m-objetivo'),
      meses: this._int('sim-m-meses'),
      inicial: this._moeda('sim-m-inicial'),
      taxaMensal: this._pct('sim-m-taxa'),
    });
    if (!r.valido) { this._erro(r.motivo); return; }

    var nomeEl = document.getElementById('sim-m-nome');
    var titulo = (nomeEl && nomeEl.value ? nomeEl.value : '').trim() || 'Minha meta';

    // Prazo = hoje + meses (data local, YYYY-MM-DD, como METAS espera). O
    // usuário pediu "juntar X em N meses"; se o util não estiver carregado,
    // computa a data à mão em vez de criar uma meta sem prazo em silêncio.
    var prazo = (typeof UTILS !== 'undefined' && UTILS.addMesesClamp && UTILS.dataLocalIso)
      ? UTILS.addMesesClamp(UTILS.dataLocalIso(), r.meses)
      : this._prazoFallback(r.meses);

    try {
      METAS.criar({
        titulo: titulo,
        valorAlvo: r.objetivo,
        valorAtual: r.inicial,
        prazo: prazo,
        icone: 'target',
      });
    } catch (e) {
      // Cota do plano gratuito: aciona o paywall se houver; senão, avisa.
      if (e && e.code === 'quota') {
        if (typeof BILLING !== 'undefined' && BILLING.onPaymentRequired) {
          BILLING.onPaymentRequired({ message: 'Limite de metas do plano gratuito. Assine o Pro para criar mais.' });
        } else if (typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
          UTILS.mostrarToast('Limite de metas do plano gratuito.', 'warning');
        }
      } else if (typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
        UTILS.mostrarToast((e && e.message) || 'Não foi possível criar a meta.', 'error');
      }
      return;
    }

    if (typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
      UTILS.mostrarToast('Meta criada', 'success');
    }
    // Leva o usuário direto para a meta recém-criada.
    if (typeof mudarAba === 'function') mudarAba('orcamento', { orcSub: 'metas' });
  },

  _calcFinanciamento: function() {
    var r = SIMULADOR.financiamento({
      valor: this._moeda('sim-f-valor'),
      entrada: this._moeda('sim-f-entrada'),
      taxaMensal: this._pct('sim-f-taxa'),
      numParcelas: this._int('sim-f-num'),
    });
    if (!r.valido) { this._erro(r.motivo); return; }

    var html = '<div class="sim-veredito sim-veredito--vista">' +
      '<i data-lucide="landmark" aria-hidden="true"></i>' +
      '<div><strong>' + r.numParcelas + 'x de ' + this._fmt(r.valorParcela) + '</strong>' +
      '<span>Total pago: ' + this._fmt(r.totalPago) + '.</span></div></div>';

    html += '<div class="sim-res-bloco">';
    html += this._linha('Valor financiado', this._fmt(r.valorFinanciado));
    html += this._linha('Total pago', this._fmt(r.totalPago));
    html += this._linha('Total de juros', this._fmt(r.totalJuros) + ' (' + r.jurosPct.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '% sobre o financiado)', true);
    html += this._linha('Taxa', this._pctTexto(r.taxaMensal) + ' ao mês · ' + this._pctTexto(r.taxaAnual) + ' ao ano');
    html += '</div>';
    this._mostrar(html);
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = INIT_SIMULADOR;
}
