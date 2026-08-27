/**
 * @file utils.js — Utility functions
 * @module UTILS
 * Tier 1. Depende de: config.js
 * @requires js/utilities/aria-live.js
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valido
 * @property {string} [erro]
 * @property {*} [valor]
 */

/**
 * @typedef {Object} StorageCheck
 * @property {boolean} disponivel
 * @property {string} [erro]
 * @property {number} [tamanho]
 */

var UTILS = {
  /**
   * Formata número como moeda local.
   * @param {number} valor
   * @param {'BRL'|'USD'|'EUR'} [moeda='BRL']
   * @returns {string}
   */
  formatarMoeda: function(valor, moeda) {
    moeda = moeda || 'BRL';
    var config = CONFIG.MOEDA_FORMATACAO[moeda] || CONFIG.MOEDA_FORMATACAO.BRL;
    return new Intl.NumberFormat(config.locale, {
      style: 'currency',
      currency: config.currency
    }).format(valor);
  },

  /**
   * Formata data ISO ou string YYYY-MM-DD para DD/MM/YYYY.
   * Evita timezone bugs ao parsear strings ISO direto via split.
   * @param {string|Date} data
   * @returns {string}
   */
  formatarData: function(data) {
    var parts = String(data).split('T')[0].split('-');
    if (parts.length === 3) {
      return parts[2] + '/' + parts[1] + '/' + parts[0];
    }
    return new Intl.DateTimeFormat('pt-BR').format(new Date(data));
  },

  formatarDataHora: function(data) {
    if (typeof data === 'string') data = new Date(data);
    return new Intl.DateTimeFormat('pt-BR', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    }).format(data);
  },

  /**
   * Valida transação básica (valor, tipo, categoria, data).
   * @param {Object} transacao
   * @returns {ValidationResult}
   */
  validarTransacao: function(transacao) {
    if (!transacao.valor || transacao.valor <= 0) {
      return { valido: false, erro: 'Valor deve ser maior que 0' };
    }
    var tiposValidos = [
      CONFIG.TIPO_RECEITA,
      CONFIG.TIPO_DESPESA,
      CONFIG.TIPO_TRANSFERENCIA
    ];
    if (!transacao.tipo || tiposValidos.indexOf(transacao.tipo) === -1) {
      return { valido: false, erro: 'Tipo invalido' };
    }
    if (!transacao.categoria) {
      return { valido: false, erro: 'Categoria obrigatoria' };
    }
    if (!transacao.data) {
      return { valido: false, erro: 'Data obrigatoria' };
    }
    return { valido: true };
  },

  /**
   * Exibe toast acessível (aria-live=polite).
   * @param {string} mensagem
   * @param {'info'|'success'|'error'|'warning'} [tipo='info']
   */
  mostrarToast: function(mensagem, tipo) {
    tipo = tipo || 'info';
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + tipo;
    toast.textContent = mensagem;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
    
    // Announce to screen readers using aria-live utility
    if (typeof ariaLive !== 'undefined') {
      ariaLive.announceToast(mensagem, tipo);
    }
    
    setTimeout(function() { toast.classList.add('show'); }, 10);
    setTimeout(function() {
      toast.classList.remove('show');
      setTimeout(function() { toast.remove(); }, 300);
    }, 3000);
  },

  mostrarToastAcao: function(mensagem, rotuloAcao, aoClicar, opts) {
    opts = opts || {};
    var tipo = opts.tipo || 'info';
    var duracao = typeof opts.duracaoMs === 'number' ? opts.duracaoMs : 6000;

    var toast = document.createElement('div');
    toast.className = 'toast toast-' + tipo + ' toast-acao';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');

    var texto = document.createElement('span');
    texto.className = 'toast-acao-texto';
    texto.textContent = mensagem;
    toast.appendChild(texto);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-acao-btn';
    btn.textContent = rotuloAcao || 'Desfazer';

    var encerrado = false;
    function fechar() {
      if (encerrado) return;
      encerrado = true;
      toast.classList.remove('show');
      setTimeout(function() { toast.remove(); }, 300);
    }
    btn.addEventListener('click', function() {
      try { if (typeof aoClicar === 'function') aoClicar(); }
      finally { fechar(); }
    });
    toast.appendChild(btn);

    document.body.appendChild(toast);
    if (typeof ariaLive !== 'undefined') { ariaLive.announceToast(mensagem, tipo); }
    setTimeout(function() { toast.classList.add('show'); }, 10);
    setTimeout(fechar, duracao);
    return { fechar: fechar };
  },

  _exclusoesPendentes: {},

  /**
   * Agenda exclusão definitiva após janela de desfazer (~5s).
   * @param {string} chave id único da operação pendente
   * @param {Function} efetivarFn chamada ao expirar o prazo
   * @param {{mensagem?:string,rotuloAcao?:string,duracaoMs?:number,aoDesfazer?:Function,tipo?:string}} [opts]
   */
  agendarExclusao: function(chave, efetivarFn, opts) {
    opts = opts || {};
    var self = this;
    var duracao = typeof opts.duracaoMs === 'number' ? opts.duracaoMs : 5000;

    if (this._exclusoesPendentes[chave]) {
      clearTimeout(this._exclusoesPendentes[chave].timer);
      if (this._exclusoesPendentes[chave].toast && this._exclusoesPendentes[chave].toast.fechar) {
        this._exclusoesPendentes[chave].toast.fechar();
      }
    }

    var timer = setTimeout(function() {
      try {
        if (typeof efetivarFn === 'function') efetivarFn();
      } finally {
        delete self._exclusoesPendentes[chave];
      }
    }, duracao);

    var toast = this.mostrarToastAcao(
      opts.mensagem || 'Excluído',
      opts.rotuloAcao || 'Desfazer',
      function() {
        clearTimeout(timer);
        delete self._exclusoesPendentes[chave];
        if (typeof opts.aoDesfazer === 'function') opts.aoDesfazer();
      },
      { duracaoMs: duracao, tipo: opts.tipo || 'info' }
    );

    this._exclusoesPendentes[chave] = { timer: timer, toast: toast };
  },

  /**
   * Banner dispensável (não-modal) para avisos como backup pendente.
   */
  mostrarBanner: function(opts) {
    opts = opts || {};
    var id = opts.id || 'fp-banner';
    var existente = document.getElementById(id);
    if (existente) existente.remove();

    var banner = document.createElement('div');
    banner.id = id;
    banner.className = 'fp-banner' + (opts.tipo ? ' fp-banner--' + opts.tipo : '');
    banner.setAttribute('role', opts.role || 'status');
    banner.setAttribute('aria-live', 'polite');

    var texto = document.createElement('p');
    texto.className = 'fp-banner-texto';
    texto.textContent = opts.mensagem || '';
    banner.appendChild(texto);

    var actions = document.createElement('div');
    actions.className = 'fp-banner-actions';

    if (opts.acao && typeof opts.onAcao === 'function') {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'fp-banner-btn';
      btn.textContent = opts.acao;
      btn.addEventListener('click', function() {
        opts.onAcao();
        if (opts.fecharAoAcao !== false) banner.remove();
      });
      actions.appendChild(btn);
    }

    if (opts.dismissivel !== false) {
      var dismiss = document.createElement('button');
      dismiss.type = 'button';
      dismiss.className = 'fp-banner-dismiss';
      dismiss.setAttribute('aria-label', 'Dispensar aviso');
      dismiss.textContent = '×';
      dismiss.addEventListener('click', function() {
        banner.remove();
        if (typeof opts.aoDispensar === 'function') opts.aoDispensar();
      });
      actions.appendChild(dismiss);
    }

    banner.appendChild(actions);
    document.body.appendChild(banner);
    return banner;
  },

  /**
   * Converte um valor monetário digitado (ou numérico) em Number.
   * Aceita número (usa direto), string em formato BR ("1.234,56" → 1234.56) e
   * string simples ("1234.56", "50"). Centraliza a normalização que antes vivia
   * duplicada (`.replace(/\./g,'').replace(',','.')`) em vários módulos.
   * @param {number|string} input
   * @returns {number} valor ≥ 0 (NaN/vazio → 0)
   */
  parseMoeda: function(input) {
    if (typeof input === 'number') {
      return (isNaN(input) || !isFinite(input)) ? 0 : input;
    }
    var str = String(input == null ? '' : input).trim().replace(/[R$\s]/gi, '');
    if (!str) return 0;

    var lastComma = str.lastIndexOf(',');
    var lastDot = str.lastIndexOf('.');
    var normalized;

    if (lastComma > lastDot) {
      normalized = str.replace(/\./g, '').replace(',', '.');
    } else if (lastDot > lastComma) {
      if (lastComma >= 0) {
        normalized = str.replace(/,/g, '');
      } else {
        var parts = str.split('.');
        if (parts.length === 2 && parts[1].length <= 2) {
          normalized = str;
        } else {
          normalized = str.replace(/\./g, '');
        }
      }
    } else if (lastComma >= 0) {
      normalized = str.replace(',', '.');
    } else {
      normalized = str;
    }

    var num = parseFloat(normalized);
    return (isNaN(num) || !isFinite(num)) ? 0 : num;
  },

  /**
   * Como parseMoeda, mas devolve NaN quando a entrada não é um número.
   *
   * parseMoeda é deliberadamente tolerante e devolve 0 para lixo — o que serve
   * a quem valida com `!valor || valor <= 0`, porque 0 já é rejeitado ali. Não
   * serve a quem aceita zero como valor legítimo: em patrimônio, uma conta
   * zerada continua sendo um ativo, então `0` precisa passar e `'abc'` não.
   * Sem esta distinção, digitar texto criaria um ativo de R$ 0,00 em silêncio.
   */
  parseMoedaEstrita: function(input) {
    if (typeof input === 'number') return (isNaN(input) || !isFinite(input)) ? NaN : input;
    var str = String(input == null ? '' : input).trim();
    if (!str) return NaN;
    // Aceita prefixo R$ (já removido em parseMoeda); aqui só rejeita texto livre.
    var limpo = str.replace(/[R$\s]/gi, '');
    if (!/^-?[\d.,]+$/.test(limpo)) return NaN;
    return this.parseMoeda(str);
  },

  /**
   * Liga um input de valor monetário: digita livre (6000, 6.000, 6.000,00, R$…)
   * e mostra prévia do que será salvo. No blur, formata em pt-BR com 2 casas.
   *
   * Substitui a máscara "centavos a cada dígito" (6000 → 60,00), que contradizia
   * a expectativa do usuário brasileiro de inteiros em reais.
   *
   * @param {HTMLInputElement|null} input
   * @param {{ previewId?: string, previewEl?: HTMLElement|null, onChange?: Function }} [opts]
   */
  bindCampoMoeda: function(input, opts) {
    if (!input || input._fpMoedaBound) return;
    opts = opts || {};
    input._fpMoedaBound = true;
    input.setAttribute('inputmode', input.getAttribute('inputmode') || 'decimal');
    input.setAttribute('autocomplete', 'off');

    var preview = opts.previewEl || null;
    if (!preview && opts.previewId) {
      preview = document.getElementById(opts.previewId);
    }

    var atualizar = function() {
      var raw = String(input.value || '').trim();
      var valor = UTILS.parseMoeda(raw);
      if (preview) {
        if (!raw) {
          preview.hidden = true;
          preview.textContent = '';
        } else if (!/[\d]/.test(raw)) {
          preview.hidden = false;
          preview.textContent = 'Valor inválido';
          preview.classList.add('campo-moeda-preview--erro');
        } else {
          preview.hidden = false;
          preview.classList.remove('campo-moeda-preview--erro');
          preview.textContent = 'Você está salvando ' + UTILS.formatarMoeda(valor);
        }
      }
      if (typeof opts.onChange === 'function') opts.onChange(valor, raw);
    };

    input.addEventListener('input', atualizar);
    input.addEventListener('blur', function() {
      var raw = String(input.value || '').trim();
      if (!raw) {
        atualizar();
        return;
      }
      var valor = UTILS.parseMoeda(raw);
      input.value = valor.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
      atualizar();
    });

    if (input.value) atualizar();
  },

  /**
   * Formata um número já parseado para exibição no campo (pt-BR, 2 casas).
   */
  formatarCampoMoeda: function(valor) {
    var n = typeof valor === 'number' ? valor : this.parseMoeda(valor);
    if (!isFinite(n)) n = 0;
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  /**
   * Valida data calendário real (YYYY-MM-DD). Rejeita 2026-02-31 etc.
   * @param {string} dataIso
   * @returns {boolean}
   */
  dataIsoValida: function(dataIso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dataIso || '').trim());
    if (!m) return false;
    var ano = parseInt(m[1], 10);
    var mes = parseInt(m[2], 10);
    var dia = parseInt(m[3], 10);
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return false;
    var ultimo = new Date(ano, mes, 0).getDate();
    return dia <= ultimo;
  },

  calcularSaldo: function(transacoes) {
    if (typeof TRANSACTION_SERVICE !== 'undefined' && TRANSACTION_SERVICE.calculateBalance) {
      return TRANSACTION_SERVICE.calculateBalance(transacoes);
    }
    return (transacoes || []).reduce(function(acc, t) {
      if (t.tipo === CONFIG.TIPO_RECEITA) return acc + UTILS.paraCentavos(t.valor);
      if (t.tipo === CONFIG.TIPO_DESPESA) return acc - UTILS.paraCentavos(t.valor);
      return acc;
    }, 0) / 100;
  },

  filtrarPorMes: function(transacoes, mes, ano) {
    return transacoes.filter(function(t) {
      var dataStr = String(t.data || '').split('T')[0];
      var parts = dataStr.split('-');
      if (parts.length === 3) {
        var anoTx = parseInt(parts[0], 10);
        var mesTx = parseInt(parts[1], 10);
        return mesTx === mes && anoTx === ano;
      }
      var data = new Date(t.data);
      return data.getMonth() === mes - 1 && data.getFullYear() === ano;
    });
  },

  filtrarPorTipo: function(transacoes, tipo) {
    return transacoes.filter(function(t) { return t.tipo === tipo; });
  },

  /**
   * Escapa string para HTML (atributos e conteúdo).
   * NÃO escapa para contexto JS string — para isso, evite onclick inline.
   * @param {*} text
   * @returns {string}
   */
  escapeHtml: function(text) {
    var map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text).replace(/[&<>"']/g, function(m) { return map[m]; });
  },

  labelCategoria: function(key) {
    return CONFIG.CATEGORIAS_MAP[key] || key;
  },

  formatarDataRelativa: function(data) {
    var parts = String(data).split('T')[0].split('-');
    if (parts.length !== 3) return this.formatarData(data);
    var hoje = new Date();
    var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    var ontem = new Date(hoje); ontem.setDate(hoje.getDate() - 1);
    if (d.toDateString() === hoje.toDateString()) return 'Hoje';
    if (d.toDateString() === ontem.toDateString()) return 'Ontem';
    return this.formatarData(data);
  },

  _idCounter: 0,
  /**
   * Gera ID único composto: timestamp + random36 + counter.
   * @returns {string}
   */
  gerarId: function() {
    var timestamp = Date.now();
    var randomPart = Math.random().toString(36).substr(2, 9);
    var counter = (this._idCounter = (this._idCounter || 0) + 1);
    return timestamp + '-' + randomPart + '-' + counter;
  },

  /**
   * UUID v4 — obrigatório para sync v2 com a API.
   * @returns {string}
   */
  gerarUuid: function() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0;
      var v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  },

  // Cache de elementos DOM
  _domCache: {},
  obterElemento: function(id) {
    if (!this._domCache[id]) {
      this._domCache[id] = document.getElementById(id);
    }
    return this._domCache[id];
  },

  limparCacheDom: function() {
    this._domCache = {};
  },

  // Debounce para eventos frequentes
  debounce: function(func, delay) {
    var timeout;
    return function() {
      var context = this, args = arguments;
      clearTimeout(timeout);
      timeout = setTimeout(function() { func.apply(context, args); }, delay);
    };
  },

  /**
   * Apenas valida quota localStorage — NÃO grava o dado real.
   * Chamador é responsável pelo setItem subsequente.
   * @param {*} dados
   * @param {string} chave
   * @returns {StorageCheck}
   */
  verificarStorageDisponivel: function(dados, chave) {
    try {
      var serializado = JSON.stringify(dados);
      // Calcula tamanho do payload + overhead de chave
      var tamanho = (chave.length + serializado.length) * 2; // UTF-16: 2 bytes/char
      // Teste leve: tenta gravar key temporária do mesmo tamanho aproximado
      var probe = '__sd_' + Date.now();
      var amostra = serializado.length > 4096 ? serializado.substring(0, 4096) : serializado;
      localStorage.setItem(probe, amostra);
      localStorage.removeItem(probe);
      return { disponivel: true, tamanho: tamanho };
    } catch (e) {
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        return { disponivel: false, erro: 'Espaço de armazenamento cheio' };
      }
      return { disponivel: false, erro: e.message };
    }
  },

  /**
   * setInterval que só corre enquanto a aba está visível.
   *
   * O app tinha 4 timers periódicos (sync 15s, autosave 30s, alertas 5min,
   * cache 5min) e nenhuma ocorrência de `visibilitychange`. Num PWA instalado
   * no celular isso é bateria gasta recalculando uma tela que ninguém está
   * vendo — o custo não aparece em nenhuma métrica do produto, só na
   * estimativa de uso do sistema operacional, onde o usuário lê o nome do app
   * ao lado de um número e desinstala.
   *
   * Ao voltar, executa UMA VEZ imediatamente antes de retomar o ciclo. Sem
   * isso, quem volta para a aba veria estado velho por até um período inteiro
   * — e "pausei para economizar" viraria "o app estava desatualizado".
   *
   * Devolve `{ parar: fn }`. Sem `document` (jsdom sem DOM, WebView antiga),
   * degrada para um setInterval comum: pior para bateria, nunca quebrado.
   */
  intervaloVisivel: function(fn, ms) {
    if (typeof fn !== 'function' || !(ms > 0)) return { parar: function() {} };

    var temDoc = typeof document !== 'undefined' && document
      && typeof document.addEventListener === 'function';

    if (!temDoc) {
      var simples = setInterval(fn, ms);
      return { parar: function() { clearInterval(simples); } };
    }

    var handle = null;

    function rodando() { return handle !== null; }

    function iniciar() {
      if (rodando()) return;
      handle = setInterval(fn, ms);
    }

    function pausar() {
      if (!rodando()) return;
      clearInterval(handle);
      handle = null;
    }

    function aoMudarVisibilidade() {
      if (document.visibilityState === 'hidden') {
        pausar();
        return;
      }
      if (rodando()) return;
      // Atualiza já: o usuário voltou e precisa ver o estado atual, não o de
      // quando saiu. Erro aqui não pode impedir a retomada do ciclo.
      try { fn(); } catch (e) { /* o próprio callback registra o erro */ }
      iniciar();
    }

    document.addEventListener('visibilitychange', aoMudarVisibilidade);
    if (document.visibilityState !== 'hidden') iniciar();

    return {
      parar: function() {
        pausar();
        document.removeEventListener('visibilitychange', aoMudarVisibilidade);
      },
    };
  },

  /**
   * Converte um valor em reais para centavos inteiros.
   *
   * Dinheiro em ponto flutuante não é confiável para COMPARAR. Mil somas de
   * R$ 0,10 dão 99,9999999999986, e `>= 100` devolve false — o orçamento
   * mostrava 100% consumido com selo de "atenção" em vez de "excedido".
   *
   * Somar e comparar em centavos inteiros elimina a classe inteira do
   * problema, sem precisar migrar o formato de armazenamento.
   */
  paraCentavos: function(valor) {
    var n = typeof valor === 'number' ? valor : UTILS.parseMoeda(valor);
    if (!isFinite(n)) return 0;
    return Math.round(n * 100);
  },

  /** Soma uma lista de valores em reais sem acumular erro de ponto flutuante. */
  somarMoeda: function(valores) {
    var centavos = (valores || []).reduce(function(acc, v) {
      return acc + UTILS.paraCentavos(v);
    }, 0);
    return centavos / 100;
  },

  /**
   * Divide um valor em N parcelas cuja soma é EXATAMENTE o valor original.
   *
   * O parcelamento fazia `Math.round((valor / n) * 100) / 100` e repetia o
   * mesmo número N vezes. R$ 100 em 3x virava 3 × 33,33 = R$ 99,99 — um
   * centavo sumia do extrato. R$ 1.000 em 6x fazia o contrário e criava
   * R$ 0,02 do nada. Não é arredondamento infeliz: é erro de saldo, e o
   * usuário só descobre conferindo a fatura.
   *
   * A divisão é feita em centavos inteiros e o resto vai para as PRIMEIRAS
   * parcelas — a convenção do mercado brasileiro (a diferença aparece na
   * entrada, não na última cobrança) e a que garante que quem desistir no
   * meio já pagou proporcionalmente mais, nunca menos.
   *
   * @param {number|string} valor  total em reais
   * @param {number} n             quantidade de parcelas
   * @returns {number[]} lista de N valores em reais; [] se n for inválido
   */
  dividirEmParcelas: function(valor, n) {
    var qtd = parseInt(n, 10);
    if (!isFinite(qtd) || qtd < 1) return [];

    var totalCent = UTILS.paraCentavos(valor);
    var negativo = totalCent < 0;
    var abs = Math.abs(totalCent);

    var base = Math.floor(abs / qtd);
    var resto = abs - base * qtd;

    var parcelas = [];
    for (var i = 0; i < qtd; i++) {
      var cent = base + (i < resto ? 1 : 0);
      parcelas.push((negativo ? -cent : cent) / 100);
    }
    return parcelas;
  },

  /**
   * Soma meses a uma data ISO limitando o dia ao último dia do mês destino.
   *
   * `d.setMonth(d.getMonth() + 1)` sobre 31/01 NÃO devolve 28/02: o Date
   * transborda para 03/03. Uma compra em 31/01 parcelada em 5x gerava
   * jan, MAR, mar, MAI, mai — fevereiro e abril sem parcela nenhuma, março e
   * maio com duas. O orçamento mensal do usuário fica irreconhecível, e o
   * mesmo erro derruba recorrências (que derivam um pouco a cada ciclo).
   *
   * A conta é feita em componentes (ano/mês/dia), nunca deixando o Date
   * "corrigir" sozinho, e o dia é limitado ao último do mês destino. A string
   * de saída é montada à mão para não passar por `toISOString()`, que
   * converteria para UTC e voltaria um dia em fusos negativos como o nosso.
   *
   * @param {string|Date} dataIso data base (YYYY-MM-DD ou ISO completo)
   * @param {number} meses        deslocamento (aceita negativo)
   * @returns {string|null} YYYY-MM-DD, ou null se a data de entrada é inválida
   */
  addMesesClamp: function(dataIso, meses) {
    var ano, mes, dia;

    // Duck-typing em vez de `instanceof Date`: uma Date criada em outro realm
    // — iframe, outra janela, ou o contexto de vm que a suíte usa — falha no
    // `instanceof` e cairia no ramo de string, devolvendo null para uma data
    // perfeitamente válida.
    if (UTILS._ehData(dataIso)) {
      ano = dataIso.getFullYear();
      mes = dataIso.getMonth();
      dia = dataIso.getDate();
    } else if (dataIso && typeof dataIso.getTime === 'function') {
      return null; // Date inválida (getTime NaN)
    } else {
      var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dataIso || ''));
      if (!m) return null;
      ano = parseInt(m[1], 10);
      mes = parseInt(m[2], 10) - 1;
      dia = parseInt(m[3], 10);
      // Rejeita 2026-02-31 e afins em vez de deixar o Date "consertar".
      if (mes < 0 || mes > 11 || dia < 1 || dia > 31) return null;
    }

    var deslocamento = parseInt(meses, 10);
    if (!isFinite(deslocamento)) deslocamento = 0;

    var totalMeses = ano * 12 + mes + deslocamento;
    var anoAlvo = Math.floor(totalMeses / 12);
    var mesAlvo = totalMeses - anoAlvo * 12;

    // Dia 0 do mês seguinte = último dia do mês alvo.
    var ultimoDia = new Date(anoAlvo, mesAlvo + 1, 0).getDate();
    var diaAlvo = Math.min(dia, ultimoDia);

    return anoAlvo + '-'
      + String(mesAlvo + 1).padStart(2, '0') + '-'
      + String(diaAlvo).padStart(2, '0');
  },

  /**
   * Executa `fn` sem deixar a exceção escapar — e sem deixá-la sumir.
   *
   * Substitui o catch de corpo vazio, que é a forma mais barata de fazer
   * um bug desaparecer da vista sem desaparecer do app: quando algo quebra na
   * casa do usuário, não sobra rastro nenhum para investigar.
   *
   * Três coisas acontecem aqui e não acontecem num catch vazio:
   *   1. o erro é registrado no OBS com um CONTEXTO nomeado, que é o que
   *      transforma um stack anônimo em algo investigável;
   *   2. quem chamou descobre que falhou, em vez de receber `undefined` e
   *      seguir como se tivesse dado certo;
   *   3. o usuário é avisado quando — e só quando — o erro é assunto dele.
   *
   * A mensagem exibida é sempre a que o chamador escreveu, nunca a técnica:
   * "Cannot read properties of undefined" não ajuda ninguém e ainda expõe
   * detalhe interno.
   *
   * @param {string} contexto  nome curto do que estava sendo feito
   * @param {Function} fn
   * @param {{padrao?:*, avisar?:string, dados?:Object}} [opts]
   * @returns {{ok:boolean, valor:*, erro:?Error}}
   */
  tentar: function(contexto, fn, opts) {
    opts = opts || {};

    if (typeof fn !== 'function') {
      return { ok: false, valor: opts.padrao, erro: new Error('função ausente') };
    }

    try {
      return { ok: true, valor: fn(), erro: null };
    } catch (erro) {
      try {
        if (typeof OBS !== 'undefined' && OBS && typeof OBS.captureError === 'function') {
          OBS.captureError(erro, Object.assign({ contexto: contexto }, opts.dados || {}));
        } else if (typeof console !== 'undefined' && console.warn) {
          console.warn('[' + contexto + ']', erro && erro.message);
        }
      } catch (_e) {
        // Falha ao REGISTRAR o erro não pode derrubar o fluxo que já estava
        // tratando um erro. É o único lugar do app onde engolir é correto.
      }

      if (opts.avisar && typeof UTILS.mostrarToast === 'function') {
        UTILS.mostrarToast(opts.avisar, 'error');
      }

      return { ok: false, valor: opts.padrao, erro: erro };
    }
  },

  /**
   * É uma data utilizável?
   *
   * Checa o método, não a classe. `valor instanceof Date` devolve false para
   * uma Date vinda de outro realm (iframe, outra janela, contexto de vm), e o
   * chamador então descarta em silêncio um argumento válido. Já apareceu duas
   * vezes neste projeto — em METAS e aqui.
   *
   * @returns {boolean} true só para data válida (getTime não-NaN)
   */
  _ehData: function(valor) {
    return !!(valor
      && typeof valor.getTime === 'function'
      && !isNaN(valor.getTime()));
  },

  /**
   * Nome de uma conta/banco/cartão, aceitando os dois formatos que convivem.
   *
   * `config.bancos` e `config.cartoes` guardam strings no formato legado
   * (`['Nubank']`) e objetos no formato atual (`[{ nome, tipo }]`) — quem
   * instalou antes tem o primeiro, quem cadastrou depois tem o segundo, e a
   * mesma instalação pode ter os dois misturados.
   *
   * Cada consumidor resolvia isso por conta própria, ou não resolvia:
   * `parser.js` chamava `b.toLowerCase()` direto e derrubava a entrada rápida
   * inteira para quem tivesse cadastrado um banco.
   *
   * @returns {string} nome sem espaços nas pontas; '' quando não há nome
   */
  nomeDeConta: function(valor) {
    if (typeof valor === 'string') return valor.trim();
    if (valor && typeof valor.nome === 'string') return valor.nome.trim();
    return '';
  },

  /**
   * Data de HOJE no fuso do usuário, como YYYY-MM-DD.
   *
   * Existe porque `new Date().toISOString().split('T')[0]` devolve a data em
   * UTC: em America/Sao_Paulo (UTC-3), tudo lançado depois das 21h era gravado
   * com a data do dia seguinte. A pessoa registra o jantar e ele aparece
   * amanhã — no extrato, no orçamento do mês e no gráfico.
   *
   * @param {Date} [base] data de referência (padrão: agora)
   * @returns {string} YYYY-MM-DD
   */
  dataLocalIso: function(base) {
    // Mesma razão de addMesesClamp: `instanceof Date` não atravessa realms, e
    // aqui o efeito seria pior — a função devolveria HOJE em silêncio no lugar
    // da data pedida. Data errada sem erro é o pior tipo de falha num app
    // financeiro.
    var d = UTILS._ehData(base) ? base : new Date();
    return d.getFullYear() + '-'
      + String(d.getMonth() + 1).padStart(2, '0') + '-'
      + String(d.getDate()).padStart(2, '0');
  },

  /**
   * Dias inteiros entre hoje e uma data ISO (YYYY-MM-DD).
   * 0 = hoje · positivo = futuro · negativo = passado.
   *
   * Existe porque o mesmo erro apareceu duas vezes no projeto — em
   * contas-pagar e em assinaturas: ancorar "hoje" em 00:00 e a data alvo em
   * 12:00 e arredondar para cima empurra tudo um dia. Uma conta vencendo HOJE
   * devolvia 1 e aparecia como "próxima"; uma vencida ONTEM devolvia 0 e
   * aparecia como "hoje".
   *
   * Ancorar os dois lados ao meio-dia elimina a defasagem, e `Math.round`
   * absorve a hora a mais ou a menos na virada do horário de verão.
   */
  diasAte: function(dataIso) {
    var hoje = new Date();
    hoje.setHours(12, 0, 0, 0);
    var alvo = new Date(String(dataIso).slice(0, 10) + 'T12:00:00');
    if (isNaN(alvo.getTime())) return NaN;
    return Math.round((alvo - hoje) / 86400000);
  },

  /**
   * Executa uma ação demorada mantendo o botão em estado de carregamento.
   *
   * Existe por causa do clique duplo: exportação, importação e OCR passam de
   * um segundo, e sem retorno visual o usuário clica de novo. Em app
   * financeiro isso gera lançamento duplicado — o pior tipo de bug, porque o
   * usuário só descobre ao conferir o extrato.
   *
   * O botão volta ao normal mesmo quando a ação falha: deixá-lo travado seria
   * trocar um bug por outro.
   *
   * @param {HTMLElement} botao   elemento a bloquear (aceita null)
   * @param {Function}    acao    função síncrona ou que devolve Promise
   * @param {string}      [rotulo] texto exibido durante o carregamento
   * @returns {Promise} resolve/rejeita com o resultado de `acao`
   */
  comCarregamento: function(botao, acao, rotulo) {
    var textoOriginal = null;

    function bloquear() {
      if (!botao) return;
      botao.disabled = true;
      botao.setAttribute('aria-busy', 'true');
      botao.setAttribute('aria-disabled', 'true');
      if (rotulo) {
        textoOriginal = botao.textContent;
        botao.textContent = rotulo;
      }
    }

    function liberar() {
      if (!botao) return;
      botao.disabled = false;
      botao.setAttribute('aria-busy', 'false');
      botao.removeAttribute('aria-disabled');
      if (textoOriginal !== null) botao.textContent = textoOriginal;
    }

    bloquear();

    try {
      var resultado = acao();
      // Ação síncrona: libera já. Assíncrona: espera resolver ou falhar.
      if (resultado && typeof resultado.then === 'function') {
        return resultado.then(
          function(v) { liberar(); return v; },
          function(e) { liberar(); throw e; },
        );
      }
      liberar();
      return Promise.resolve(resultado);
    } catch (e) {
      liberar();
      return Promise.reject(e);
    }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = UTILS;
}
