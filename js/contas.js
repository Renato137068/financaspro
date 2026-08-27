// FinançasPro — Contas e Cartões
// v11.0 — Depende de: config.js, dados.js, utils.js

var CONTAS = {
  _cache: [],

  _lucide: function(name) {
    if (typeof lucideIconHtml === 'function') return lucideIconHtml(name);
    return '<i data-lucide="' + (name || 'landmark') + '" aria-hidden="true"></i>';
  },

  init: function() {
    this._cache = DADOS.getContas();
  },

  getAll: function() { return this._cache; },

  getById: function(id) {
    for (var i = 0; i < this._cache.length; i++) {
      if (this._cache[i].id === id) return this._cache[i];
    }
    return null;
  },

  iconeLucide: function(tipo) {
    var map = {
      credito: 'credit-card', debito: 'credit-card', digital: 'smartphone',
      poupanca: 'piggy-bank', carteira: 'wallet', corrente: 'landmark'
    };
    return map[tipo] || 'landmark';
  },

  icone: function(tipo) {
    return this._lucide(this.iconeLucide(tipo));
  },

  tipoLabel: function(tipo) {
    if (tipo === 'credito') return 'Cartão Crédito';
    if (tipo === 'debito') return 'Cartão Débito';
    if (tipo === 'poupanca') return 'Poupança';
    if (tipo === 'digital') return 'Conta Digital';
    if (tipo === 'carteira') return 'Carteira';
    return 'Conta Corrente';
  },

  getNome: function(id) {
    var c = this.getById(id);
    if (!c) return '';
    return c.nome;
  },

  // ───────────────────────────────────────────────────────────────────────
  // SALDOS
  //
  // Nota sobre o modelo: transações usam NOME (`banco`) e, no write-path novo,
  // também `accountId` (UUID de fp-contas). Saldos preferem id→nome com fallback
  // ao nome — txs antigas sem id continuam válidas sem migração big-bang.
  // ───────────────────────────────────────────────────────────────────────

  /** Chave de agrupamento: nome normalizado, ou '' para lançamentos sem conta. */
  _chaveConta: function(valor) {
    return UTILS.nomeDeConta(valor);
  },

  _nomeDaTx: function(t, campoNome, campoId) {
    campoNome = campoNome || 'banco';
    campoId = campoId || 'accountId';
    if (!t) return '';
    var id = t[campoId];
    if (id) {
      var c = this.getById(id);
      if (c && c.nome) return this._chaveConta(c.nome);
      if (typeof FINANCE_CONTRACT !== 'undefined' && DADOS && DADOS.getContas) {
        var label = FINANCE_CONTRACT.accountLabel(id, DADOS.getContas());
        if (label && label !== id) return this._chaveConta(label);
      }
    }
    return this._chaveConta(t[campoNome]);
  },

  propagarRename: function(accountId, nomeAntigo, nomeNovo) {
    if (!accountId || !nomeAntigo || !nomeNovo) return { txs: 0 };
    var oldKey = this._chaveConta(nomeAntigo);
    var newKey = this._chaveConta(nomeNovo);
    if (!oldKey || !newKey || oldKey === newKey) return { txs: 0 };

    var raw = DADOS.getTransacoesRaw ? DADOS.getTransacoesRaw() : DADOS.getTransacoes();
    var n = 0;
    for (var i = 0; i < raw.length; i++) {
      var t = raw[i];
      if (!t || t.deletedAt) continue;
      var mudou = false;
      if (t.accountId === accountId || this._chaveConta(t.banco) === oldKey) {
        t.banco = nomeNovo;
        t.accountId = accountId;
        mudou = true;
      }
      if (t.contaDestinoId === accountId || this._chaveConta(t.contaDestino) === oldKey) {
        t.contaDestino = nomeNovo;
        t.contaDestinoId = accountId;
        mudou = true;
      }
      if (mudou) {
        DADOS.salvarTransacao(t);
        n++;
      }
    }

    var cfg = DADOS.getConfig();
    var ini = Object.assign({}, cfg.saldosIniciais || {});
    if (ini[oldKey] != null) {
      ini[newKey] = ini[oldKey];
      delete ini[oldKey];
    }
    var bancos = (cfg.bancos || []).map(function(b) {
      if (typeof b === 'string') {
        return CONTAS._chaveConta(b) === oldKey ? nomeNovo : b;
      }
      if (b && CONTAS._chaveConta(b.nome) === oldKey) {
        return Object.assign({}, b, { nome: nomeNovo });
      }
      return b;
    });
    DADOS.salvarConfig({ saldosIniciais: ini, bancos: bancos });
    if (typeof TRANSACOES !== 'undefined' && TRANSACOES.invalidateCache) {
      TRANSACOES.invalidateCache();
    }
    return { txs: n };
  },

  /**
   * Saldo de cada conta, derivado das transações.
   *
   * Derivado e não armazenado de propósito: um saldo guardado precisa ser
   * mantido em sincronia com lançamentos que são editados, apagados e
   * importados — é assim que aparecem divergências que ninguém consegue
   * explicar depois. Recalcular custa milissegundos e nunca diverge.
   *
   * Toda a aritmética é feita em centavos inteiros: mil lançamentos de
   * R$ 0,10 precisam somar exatamente R$ 100,00.
   *
   * Lançamentos com data FUTURA não entram: o saldo responde "quanto tem na
   * conta hoje". Uma parcela que cai mês que vem ainda não saiu do banco —
   * descontá-la aqui, além de mostrar um saldo menor que o extrato real,
   * causaria dupla contagem contra COMPROMISSOS.comprometido(), que é
   * exatamente quem cuida do que ainda vai sair.
   *
   * @param {{ate?:string|Date}} [opts] data de corte (padrão: hoje)
   * @returns {Array<{nome:string, saldoInicial:number, entradas:number,
   *                  saidas:number, saldo:number, transacoes:number,
   *                  semConta:boolean}>} ordenado do maior saldo para o menor
   */
  saldos: function(opts) {
    opts = opts || {};
    var config = (typeof DADOS !== 'undefined' && DADOS.getConfig) ? DADOS.getConfig() : {};
    var txs = (typeof DADOS !== 'undefined' && DADOS.getTransacoes) ? DADOS.getTransacoes() : [];
    var iniciais = config.saldosIniciais || {};
    var mapa = {};

    var ate = opts.ate
      ? (typeof opts.ate === 'string' ? opts.ate.slice(0, 10) : UTILS.dataLocalIso(opts.ate))
      : UTILS.dataLocalIso();

    function garantir(nome) {
      if (!mapa[nome]) {
        mapa[nome] = {
          nome: nome,
          saldoInicialCent: UTILS.paraCentavos(iniciais[nome] || 0),
          entradasCent: 0,
          saidasCent: 0,
          transacoes: 0,
          semConta: nome === ''
        };
      }
      return mapa[nome];
    }

    // Contas cadastradas entram mesmo sem lançamento: uma conta recém-criada
    // que não aparece na lista parece que não foi salva.
    (config.bancos || []).forEach(function(b) {
      var nome = CONTAS._chaveConta(b);
      if (nome) garantir(nome);
    });

    // Conta com saldo inicial definido também existe, mesmo que ainda não tenha
    // lançamento nenhum — foi o próprio usuário que informou aquele dinheiro.
    Object.keys(iniciais).forEach(function(nome) {
      var chave = CONTAS._chaveConta(nome);
      if (chave) garantir(chave);
    });

    // Contas que só existem nas transações também entram — dinheiro lançado
    // num banco removido da lista não pode desaparecer do total.
    txs.forEach(function(t) {
      if (!t) return;
      // Lançamento futuro ainda não afetou a conta.
      if (String(t.data || '').slice(0, 10) > ate) return;

      // Compra no crédito não sai da conta no dia da compra: ela entra numa
      // fatura, e é o pagamento da fatura que debita. Enquanto isso o dinheiro
      // continua no banco — quem cuida dele é COMPROMISSOS.
      //
      // O critério é o cartão estar CADASTRADO. Lançamentos antigos com
      // `cartao: 'Crédito'` sem cadastro correspondente seguem debitando como
      // antes: tratá-los como fatura invisível esconderia gasto real, e adivinhar
      // é pior do que preservar o comportamento conhecido.
      if (t.tipo === CONFIG.TIPO_DESPESA
          && typeof CARTOES !== 'undefined'
          && CARTOES.obter(t.cartao)) {
        return;
      }

      var reg = garantir(CONTAS._nomeDaTx(t, 'banco', 'accountId'));
      var cent = UTILS.paraCentavos(t.valor);

      if (t.tipo === CONFIG.TIPO_RECEITA) {
        reg.entradasCent += cent;
      } else if (t.tipo === CONFIG.TIPO_DESPESA) {
        reg.saidasCent += cent;
      } else if (t.tipo === CONFIG.TIPO_TRANSFERENCIA) {
        // Sai de uma conta e entra na outra. É o único lugar do app que precisa
        // conhecer transferência: os demais agregadores filtram por receita ou
        // despesa e a ignoram de graça. Aqui não dá para ignorar — é
        // exatamente o saldo por conta que a transferência muda.
        var destino = CONTAS._nomeDaTx(t, 'contaDestino', 'contaDestinoId');
        reg.saidasCent += cent;
        if (destino) garantir(destino).entradasCent += cent;
      }

      reg.transacoes++;
    });

    return Object.keys(mapa).map(function(nome) {
      var r = mapa[nome];
      var saldoCent = r.saldoInicialCent + r.entradasCent - r.saidasCent;
      return {
        nome: r.nome,
        saldoInicial: r.saldoInicialCent / 100,
        entradas: r.entradasCent / 100,
        saidas: r.saidasCent / 100,
        saldo: saldoCent / 100,
        transacoes: r.transacoes,
        semConta: r.semConta
      };
    }).sort(function(a, b) { return b.saldo - a.saldo; });
  },

  /** Soma de todas as contas — a resposta para "quanto eu tenho?". */
  saldoTotal: function(opts) {
    var cent = this.saldos(opts).reduce(function(acc, c) {
      return acc + UTILS.paraCentavos(c.saldo);
    }, 0);
    return cent / 100;
  },

  /** Define o saldo inicial de uma conta (o que havia antes de usar o app). */
  definirSaldoInicial: function(nome, valor) {
    var chave = this._chaveConta(nome);
    if (!chave) return null;
    var config = DADOS.getConfig();
    var iniciais = Object.assign({}, config.saldosIniciais || {});
    iniciais[chave] = UTILS.parseMoeda(valor) || 0;
    DADOS.salvarConfig({ saldosIniciais: iniciais });
    return iniciais[chave];
  },

  salvar: function(dados) {
    if (typeof DADOS.upsertConta === 'function') {
      return DADOS.upsertConta(dados);
    }
    var lista = DADOS.getContas();
    if (dados.id) {
      for (var i = 0; i < lista.length; i++) {
        if (lista[i].id === dados.id) { lista[i] = dados; break; }
      }
    } else {
      dados.id = UTILS.gerarId();
      lista.push(dados);
    }
    DADOS.salvarContas(lista);
    this._cache = lista;
    return dados;
  },

  deletar: function(id) {
    if (typeof DADOS.deletarConta === 'function') {
      DADOS.deletarConta(id);
      this._cache = DADOS.getContas();
      return;
    }
    var lista = DADOS.getContas().filter(function(c) { return c.id !== id; });
    DADOS.salvarContas(lista);
    this._cache = lista;
  },

  renderSelect: function(selectId) {
    var sel = document.getElementById(selectId);
    if (!sel) return;
    var val = sel.value;
    sel.innerHTML = '<option value="">— Sem conta —</option>' +
      this._cache.map(function(c) {
        return '<option value="' + UTILS.escapeHtml(c.id) + '">' +
          UTILS.escapeHtml(c.nome) + ' (' + CONTAS.tipoLabel(c.tipo) + ')</option>';
      }).join('');
    if (val) sel.value = val;
  },

  /**
   * Select do form unificado (#novo-banco): fp-contas (value=id) + nomes legados
   * de config.bancos que ainda não existem no cadastro.
   */
  renderBancoSelect: function(selectId) {
    var sel = document.getElementById(selectId);
    if (!sel) return;
    var val = sel.value;
    var contas = this._cache.length ? this._cache : (typeof DADOS !== 'undefined' ? DADOS.getContas() : []);
    var config = typeof DADOS !== 'undefined' && DADOS.getConfig ? DADOS.getConfig() : {};
    var bancosLegado = config.bancos || [];
    var nomesVistos = {};
    var opts = ['<option value="">Sem banco</option>'];
    var self = this;

    contas.forEach(function(c) {
      if (!c || !c.nome) return;
      nomesVistos[c.nome.toLowerCase()] = true;
      opts.push('<option value="' + UTILS.escapeHtml(c.id) + '">' +
        UTILS.escapeHtml(c.nome) + ' (' + self.tipoLabel(c.tipo) + ')</option>');
    });

    bancosLegado.forEach(function(b) {
      var nome = typeof b === 'string' ? b : (b.nome || b);
      if (!nome) return;
      if (nomesVistos[nome.toLowerCase()]) return;
      nomesVistos[nome.toLowerCase()] = true;
      opts.push('<option value="' + UTILS.escapeHtml(nome) + '">' + UTILS.escapeHtml(nome) + '</option>');
    });

    sel.innerHTML = opts.join('');
    if (val) {
      var resolved = this.resolveBancoSelectValue(val);
      if (resolved) sel.value = resolved;
    }
  },

  /** Restaura seleção por UUID, nome ou rótulo legado. */
  resolveBancoSelectValue: function(ref) {
    if (!ref) return '';
    var s = String(ref).trim();
    if (typeof FINANCE_CONTRACT !== 'undefined' && FINANCE_CONTRACT.isUuid(s)) return s;
    var contas = this._cache.length ? this._cache : (typeof DADOS !== 'undefined' ? DADOS.getContas() : []);
    if (typeof FINANCE_CONTRACT !== 'undefined') {
      var id = FINANCE_CONTRACT.resolveAccountId(s, contas);
      if (id) return id;
    }
    for (var i = 0; i < contas.length; i++) {
      if (contas[i] && contas[i].nome && contas[i].nome.toLowerCase() === s.toLowerCase()) {
        return contas[i].id;
      }
    }
    return s;
  },

  /** Compara duas refs de conta (id, nome ou legado). */
  mesmaConta: function(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    var contas = this._cache.length ? this._cache : (typeof DADOS !== 'undefined' ? DADOS.getContas() : []);
    if (typeof FINANCE_CONTRACT !== 'undefined') {
      var idA = FINANCE_CONTRACT.resolveAccountId(a, contas);
      var idB = FINANCE_CONTRACT.resolveAccountId(b, contas);
      if (idA && idB) return idA === idB;
    }
    return UTILS.nomeDeConta(a) === UTILS.nomeDeConta(b);
  },

  _listenerAttached: false,

  /**
   * Renderiza os saldos por conta no dashboard.
   *
   * Separado de renderLista() de propósito: aquela desenha o cadastro de contas
   * com id (`fp-contas`), que hoje não tem tela nem vínculo com transação. Esta
   * mostra o saldo real, calculado sobre o campo que as transações realmente
   * usam. Misturar as duas num mesmo container faria uma sobrescrever a outra.
   */
  renderSaldos: function() {
    var el = document.getElementById('contas-saldos-lista');
    var secao = document.getElementById('secao-contas-saldos');
    var totalEl = document.getElementById('contas-saldo-total');
    if (!el) return;

    var contas = this.saldos();

    // Sem conta nenhuma a seção não aparece: um card vazio dizendo "nenhuma
    // conta" só ocupa espaço num dashboard que já tem cards demais.
    if (contas.length === 0) {
      if (secao) secao.style.display = 'none';
      return;
    }
    if (secao) secao.style.display = '';

    if (totalEl) {
      totalEl.textContent = UTILS.formatarMoeda(this.saldoTotal());
      totalEl.classList.toggle('negativo', this.saldoTotal() < 0);
    }

    var self = this;
    el.innerHTML = contas.map(function(c) {
      var nome = c.semConta ? 'Sem conta definida' : c.nome;
      var negativo = c.saldo < 0 ? ' negativo' : '';
      return '<div class="conta-saldo-item">' +
        '<span class="conta-saldo-icon" aria-hidden="true">' +
          self._lucide(c.semConta ? 'circle-help' : 'landmark') +
        '</span>' +
        '<div class="conta-saldo-info">' +
          '<strong class="conta-saldo-nome">' + UTILS.escapeHtml(nome) + '</strong>' +
          '<small class="conta-saldo-meta">' + c.transacoes +
            (c.transacoes === 1 ? ' lançamento' : ' lançamentos') + '</small>' +
        '</div>' +
        '<span class="conta-saldo-valor' + negativo + '">' +
          UTILS.escapeHtml(UTILS.formatarMoeda(c.saldo)) +
        '</span>' +
      '</div>';
    }).join('');

    if (typeof renderLucideIcons === 'function') renderLucideIcons(el);
    this._bindTransferencia();
  },

  _transferenciaBound: false,

  _bindTransferencia: function() {
    if (this._transferenciaBound) return;
    var btn = document.querySelector('[data-action="conta-transferir"]');
    if (!btn) return;
    this._transferenciaBound = true;
    btn.addEventListener('click', function() { CONTAS.abrirFormTransferencia(); });
  },

  /** Nomes de conta conhecidos, para os selects do formulário. */
  _nomesDeContas: function() {
    return this.saldos()
      .filter(function(c) { return !c.semConta; })
      .map(function(c) { return c.nome; });
  },

  /**
   * Formulário de transferência entre contas.
   *
   * Fica aqui, na seção de contas, e não no formulário de lançamento: é onde a
   * pessoa está olhando quando pensa "preciso mover isso de lugar". Colocar um
   * terceiro tipo no toggle receita/despesa também obrigaria a esconder
   * categoria, parcelamento e recorrência — mais estado num formulário que já
   * é o mais complexo do app.
   */
  abrirFormTransferencia: function() {
    var nomes = this._nomesDeContas();

    if (nomes.length < 2) {
      UTILS.mostrarToast('Cadastre pelo menos duas contas para transferir', 'warning');
      return;
    }

    var opcoes = function(selecionada) {
      return nomes.map(function(n) {
        var sel = n === selecionada ? ' selected' : '';
        return '<option value="' + UTILS.escapeHtml(n) + '"' + sel + '>'
          + UTILS.escapeHtml(n) + '</option>';
      }).join('');
    };

    var html =
      '<div class="transfer-form">' +
        '<label class="form-label" for="transf-origem">De</label>' +
        '<select id="transf-origem" class="form-input">' + opcoes(nomes[0]) + '</select>' +
        '<label class="form-label" for="transf-destino">Para</label>' +
        '<select id="transf-destino" class="form-input">' + opcoes(nomes[1]) + '</select>' +
        '<label class="form-label" for="transf-valor">Valor (R$)</label>' +
        '<input type="text" id="transf-valor" class="form-input" placeholder="0,00" inputmode="decimal">' +
        '<label class="form-label" for="transf-data">Data</label>' +
        '<input type="date" id="transf-data" class="form-input" value="' + UTILS.dataLocalIso() + '">' +
        '<p class="transfer-nota">Transferências não entram em receitas, despesas nem no orçamento — o dinheiro apenas muda de conta.</p>' +
      '</div>';

    if (typeof INIT_MODALS === 'undefined' || !INIT_MODALS.fpAlert) return;

    INIT_MODALS.fpAlert(html, { trustedHtml: true, title: 'Transferir entre contas' });
    setTimeout(function() {
      var ov = document.querySelector('.modal-overlay');
      if (!ov) return;
      var ok = ov.querySelector('.modal-btn');
      if (!ok) return;
      ok.textContent = 'Transferir';
      ok.onclick = function() { CONTAS._salvarTransferencia(ov); };
    }, 80);
  },

  _salvarTransferencia: function(overlay) {
    try {
      TRANSACOES.criarTransferencia({
        origem: document.getElementById('transf-origem').value,
        destino: document.getElementById('transf-destino').value,
        valor: document.getElementById('transf-valor').value,
        data: document.getElementById('transf-data').value
      });
      overlay.remove();
      UTILS.mostrarToast('Transferência registrada', 'success');
      if (typeof atualizarDashboard === 'function') atualizarDashboard();
    } catch (err) {
      // A mensagem vem das validações de criarTransferencia e já está em
      // linguagem de usuário ("Origem e destino não podem ser a mesma conta").
      UTILS.mostrarToast(err.message || 'Não foi possível transferir', 'error');
    }
  },

  renderLista: function() {
    var el = document.getElementById('contas-lista');
    if (!el) return;
    if (this._cache.length === 0) {
      el.innerHTML = '<p style="color:var(--text-light);font-size:13px;padding:8px 0">Nenhuma conta cadastrada</p>';
      return;
    }
    var self = this;
    el.innerHTML = this._cache.map(function(c) {
      var ico = self.icone(c.tipo);
      var tag = self.tipoLabel(c.tipo);
      var idEsc = UTILS.escapeHtml(c.id);
      return '<div class="conta-item">' +
        '<div class="conta-info">' +
          '<span class="conta-item-icon" aria-hidden="true">' + ico + '</span>' +
          '<div>' +
            '<strong>' + UTILS.escapeHtml(c.nome) + '</strong>' +
            '<small style="display:block;color:var(--text-light)">' + tag + '</small>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;gap:4px">' +
          '<button class="btn-icon" data-conta-action="editar" data-id="' + idEsc + '" aria-label="Editar">' + self._lucide('pencil') + '</button>' +
          '<button class="btn-icon" style="color:var(--danger)" data-conta-action="deletar" data-id="' + idEsc + '" aria-label="Excluir">' + self._lucide('trash-2') + '</button>' +
        '</div>' +
      '</div>';
    }).join('');

    if (typeof renderLucideIcons === 'function') renderLucideIcons(el);

    if (!this._listenerAttached) {
      this._listenerAttached = true;
      el.addEventListener('click', function(ev) {
        var btn = ev.target.closest('[data-conta-action]');
        if (!btn) return;
        var id = btn.dataset.id;
        var act = btn.dataset.contaAction;
        if (act === 'editar') CONTAS.abrirModal(id);
        else if (act === 'deletar') CONTAS.confirmarDeletar(id);
      });
    }
  },

  abrirModal: function(id) {
    var c = id ? this.getById(id) : null;
    var old = document.getElementById('modal-conta-ov');
    if (old) old.remove();
    var ov = document.createElement('div');
    ov.id = 'modal-conta-ov';
    ov.className = 'modal-overlay';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.innerHTML =
      '<div class="modal-box">' +
        '<h3 style="margin:0 0 16px;font-size:16px">' + (id ? 'Editar' : 'Nova') + ' Conta / Cartão</h3>' +
        '<div class="form-group">' +
          '<label>Tipo</label>' +
          '<select id="mc-tipo" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:var(--radius-sm)">' +
            '<option value="corrente"' + (c && c.tipo==='corrente' ? ' selected':'') + '>Conta Corrente</option>' +
            '<option value="poupanca"' + (c && c.tipo==='poupanca' ? ' selected':'') + '>Poupança</option>' +
            '<option value="digital"' + (c && c.tipo==='digital' ? ' selected':'') + '>Conta Digital</option>' +
            '<option value="carteira"' + (c && c.tipo==='carteira' ? ' selected':'') + '>Carteira</option>' +
            '<option value="credito"' + (c && c.tipo==='credito' ? ' selected':'') + '>Cartão de Crédito</option>' +
            '<option value="debito"' + (c && c.tipo==='debito' ? ' selected':'') + '>Cartão de Débito</option>' +
          '</select>' +
        '</div>' +
        '<div class="form-group">' +
          '<label>Nome *</label>' +
          '<input type="text" id="mc-nome" placeholder="Ex: Nubank, Inter, Visa..." value="' +
            (c ? UTILS.escapeHtml(c.nome) : '') + '" style="width:100%">' +
        '</div>' +
        '<div class="modal-actions">' +
          '<button class="btn-cancelar" data-modal-action="cancelar">Cancelar</button>' +
          '<button class="btn-confirmar-primary" data-modal-action="salvar" data-id="' + UTILS.escapeHtml(id||'') + '">Salvar</button>' +
        '</div>' +
      '</div>';
    ov.setAttribute('aria-label', (id ? 'Editar' : 'Nova') + ' conta ou cartão');
    document.body.appendChild(ov);
    if (typeof FocusTrap !== 'undefined') {
      CONTAS._focusTrap = new FocusTrap(ov);
      CONTAS._focusTrap.activate();
    }
    var inp = document.getElementById('mc-nome');
    if (inp) { inp.focus(); inp.select(); }
    ov.addEventListener('click', function(e) {
      if (e.target === ov) { CONTAS.fecharModal(); return; }
      var btn = e.target.closest('[data-modal-action]');
      if (!btn) return;
      var act = btn.dataset.modalAction;
      if (act === 'cancelar') CONTAS.fecharModal();
      else if (act === 'salvar') CONTAS.salvarModal(btn.dataset.id || '');
    });
    document.addEventListener('keydown', function h(e) {
      if (e.key === 'Escape') { CONTAS.fecharModal(); document.removeEventListener('keydown', h); }
    });
  },

  fecharModal: function() {
    if (CONTAS._focusTrap) { CONTAS._focusTrap.deactivate(); CONTAS._focusTrap = null; }
    var ov = document.getElementById('modal-conta-ov');
    if (ov) ov.remove();
  },

  salvarModal: function(id) {
    var nomeEl = document.getElementById('mc-nome');
    var tipoEl = document.getElementById('mc-tipo');
    if (!nomeEl || !nomeEl.value.trim()) {
      UTILS.mostrarToast('Informe o nome da conta', 'error');
      return;
    }
    var dados = { nome: nomeEl.value.trim(), tipo: tipoEl ? tipoEl.value : 'corrente' };
    var old = id ? this.getById(id) : null;
    var nomeAntigo = old ? old.nome : null;
    if (id) dados.id = id;
    var salvo = this.salvar(dados);
    if (id && nomeAntigo && nomeAntigo !== dados.nome) {
      var r = this.propagarRename(salvo.id || id, nomeAntigo, dados.nome);
      if (r.txs > 0 && typeof this.renderSaldos === 'function') this.renderSaldos();
    }
    this.fecharModal();
    this.renderLista();
    this.renderSelect('novo-conta');
    UTILS.mostrarToast('Conta salva', 'success');
  },

  confirmarDeletar: function(id) {
    var c = this.getById(id);
    if (!c) return;
    fpConfirm('Remover "' + c.nome + '"?', function() {
      CONTAS.deletar(id);
      CONTAS.renderLista();
      CONTAS.renderSelect('novo-conta');
      UTILS.mostrarToast('Conta removida', 'info');
    });
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONTAS;
}
