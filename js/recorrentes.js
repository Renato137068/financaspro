/**
 * recorrentes.js — materializa lançamentos recorrentes no cliente.
 * v11.0 — Depende de: config.js, dados.js, utils.js, transacoes.js
 *
 * O princípio declarado do projeto é "o app sempre funciona, auth é
 * complementar". A recorrência contradizia isso: era gravada no localStorage e
 * materializada APENAS pelo worker BullMQ do backend. Sem Redis, worker rodando
 * e usuário autenticado, quem cadastrava "Aluguel mensal" nunca via o
 * lançamento aparecer. A configuração existia; o efeito, não.
 *
 * ─── O RISCO ────────────────────────────────────────────────────────────────
 * A parte perigosa de resolver isso é a DUPLICAÇÃO. Se cliente e worker
 * gerarem o mesmo lançamento, o usuário vê o aluguel cobrado duas vezes — e
 * num app financeiro isso é pior do que não gerar nada.
 *
 * Duas travas:
 *
 *   1. MODO LOCAL APENAS. Havendo sessão na nuvem, o worker é o dono do
 *      processo e este módulo não encosta. Não é uma otimização: é a fronteira
 *      que impede dois produtores de escreverem a mesma coisa.
 *
 *   2. CHAVE DE IDEMPOTÊNCIA `recorrenteId + competência`. A verificação é
 *      feita contra as transações existentes, não contra um contador — assim
 *      um lançamento apagado de propósito pelo usuário não é recriado na
 *      próxima abertura, o que seria desfazer uma decisão dele.
 */
var RECORRENTES = {

  /** Teto de meses recuperados numa execução. */
  MAX_RETROATIVO: 12,

  _agora: function(valor) {
    return UTILS._ehData(valor) ? valor : new Date();
  },

  /**
   * O cliente só materializa em modo local.
   *
   * `DADOS._modoLocal` existe como ponto de injeção para teste; em produção a
   * decisão vem de `_apiAtiva()` — havendo API configurada, há sessão na nuvem
   * e o worker assume.
   */
  _ehModoLocal: function() {
    if (typeof DADOS === 'undefined') return false;
    if (typeof DADOS._modoLocal === 'boolean') return DADOS._modoLocal;
    // Supabase ainda não tem worker de recorrência — o cliente materializa.
    if (typeof DADOS._supabaseAtivo === 'function' && DADOS._supabaseAtivo()) return true;
    return typeof DADOS._apiAtiva === 'function' ? !DADOS._apiAtiva() : true;
  },

  _addDias: function(dataIso, dias) {
    var d = new Date(String(dataIso).slice(0, 10) + 'T12:00:00');
    if (isNaN(d.getTime())) return null;
    d.setDate(d.getDate() + dias);
    return UTILS.dataLocalIso(d);
  },

  /**
   * Chave de idempotência: mensal usa YYYY-MM; demais frequências usam a data.
   */
  _competencia: function(dataIso, frequencia) {
    var iso = String(dataIso || '').slice(0, 10);
    if (frequencia && frequencia !== 'mensal') return iso;
    return iso.slice(0, 7);
  },

  /**
   * Esta competência já foi processada?
   *
   * A verificação é DUPLA de propósito, e cada metade cobre a falha da outra:
   *
   *   MARCADOR (`config.recorrentesProcessadas`) — registra o que já foi
   *   gerado. É ele que respeita a decisão do usuário: quem apagou o aluguel
   *   de agosto de propósito não pode vê-lo voltar na próxima abertura. Só com
   *   varredura de transações, apagar significaria recriar.
   *
   *   TRANSAÇÃO EXISTENTE — rede de proteção para quando o marcador se perde
   *   (importação de backup antigo, limpeza de config). Sem ela, perder o
   *   marcador duplicaria meses inteiros de lançamentos.
   */
  _jaProcessada: function(transacoes, processadas, recorrenteId, competencia) {
    if (processadas[recorrenteId + '|' + competencia]) return true;

    for (var i = 0; i < transacoes.length; i++) {
      var t = transacoes[i];
      if (!t) continue;
      if (t.recorrenteId === recorrenteId && t.competencia === competencia) return true;
    }
    return false;
  },

  _marcarProcessada: function(recorrenteId, competencia) {
    var config = DADOS.getConfig();
    var mapa = Object.assign({}, config.recorrentesProcessadas || {});
    mapa[recorrenteId + '|' + competencia] = UTILS.dataLocalIso();
    DADOS.salvarConfig({ recorrentesProcessadas: mapa });
  },

  /**
   * Competências devidas de uma recorrente até hoje.
   *
   * Suporta mensal, semanal, quinzenal e anual. Frequências desconhecidas são
   * ignoradas em vez de gerar lançamento torto.
   *
   * @returns {Array<{competencia:string, data:string}>} da mais antiga à mais nova
   */
  _competenciasDevidas: function(rec, hoje) {
    if (!rec || !rec.dataInicio || rec.ativo === false) return [];

    var freq = rec.frequencia || 'mensal';
    var suportadas = { mensal: true, semanal: true, quinzenal: true, anual: true };
    if (!suportadas[freq]) return [];

    var inicio = String(rec.dataInicio).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio)) return [];

    var hojeIso = UTILS.dataLocalIso(hoje);
    var fim = rec.dataFim ? String(rec.dataFim).slice(0, 10) : null;
    var self = this;
    var devidas = [];
    var i;
    var data;

    if (freq === 'mensal' || freq === 'anual') {
      var passoMeses = freq === 'anual' ? 12 : 1;
      for (i = 0; i < 600; i++) {
        data = UTILS.addMesesClamp(inicio, i * passoMeses);
        if (!data) break;
        if (data > hojeIso) break;
        if (fim && data > fim) break;
        devidas.push({ competencia: self._competencia(data, freq), data: data });
      }
    } else {
      var intervalo = freq === 'semanal' ? 7 : 14;
      for (i = 0; i < 520; i++) {
        data = self._addDias(inicio, i * intervalo);
        if (!data) break;
        if (data > hojeIso) break;
        if (fim && data > fim) break;
        devidas.push({ competencia: self._competencia(data, freq), data: data });
      }
    }

    if (devidas.length > this.MAX_RETROATIVO) {
      devidas = devidas.slice(devidas.length - this.MAX_RETROATIVO);
    }
    return devidas;
  },

  /**
   * Materializa o que está devido.
   *
   * @param {Date} [hoje] injetável para teste
   * @returns {Array} transações criadas (vazio quando não há nada a fazer)
   */
  processar: function(hoje) {
    if (!this._ehModoLocal()) return [];
    if (typeof DADOS === 'undefined' || typeof TRANSACOES === 'undefined') return [];

    var ref = this._agora(hoje);
    var recs = DADOS.getRecorrentes ? DADOS.getRecorrentes() : [];
    if (!recs.length) return [];

    var criadas = [];
    var self = this;

    recs.forEach(function(rec) {
      if (!rec || !rec.id) return;

      var valor = UTILS.parseMoeda(rec.valor);
      if (!valor || valor <= 0) return;

      var devidas = self._competenciasDevidas(rec, ref);
      if (!devidas.length) return;

      devidas.forEach(function(d) {
        // Relê a cada iteração: o que foi criado neste mesmo laço precisa
        // entrar na verificação, senão duas competências iguais (dado
        // corrompido) gerariam duplicata.
        var txs = DADOS.getTransacoes();
        var processadas = DADOS.getConfig().recorrentesProcessadas || {};
        if (self._jaProcessada(txs, processadas, rec.id, d.competencia)) return;

        var tx;
        try {
          tx = TRANSACOES.criar(
            rec.tipo || CONFIG.TIPO_DESPESA,
            valor,
            rec.categoria || 'outro',
            d.data,
            rec.descricao || 'Recorrente',
            rec.banco || '',
            rec.cartao || '',
            { accountId: rec.accountId || undefined }
          );
        } catch (e) {
          // Uma recorrente inválida não pode impedir as outras de rodarem.
          if (typeof OBS !== 'undefined' && OBS.captureError) {
            OBS.captureError(e, { contexto: 'RECORRENTES.processar', recorrenteId: rec.id });
          }
          return;
        }

        // Marca a origem: é o que torna a operação idempotente e permite ao
        // usuário entender de onde o lançamento veio.
        tx.recorrenteId = rec.id;
        tx.competencia = d.competencia;
        tx.recorrente = true;
        DADOS.salvarTransacao(tx);
        TRANSACOES._cache = DADOS.getTransacoes();

        self._marcarProcessada(rec.id, d.competencia);
        criadas.push(tx);
      });
    });

    return criadas;
  },

  /**
   * Roda na abertura do app e avisa o usuário quando gerou algo.
   *
   * O aviso não é enfeite: lançamentos que aparecem sozinhos no extrato, sem
   * nenhuma explicação, parecem erro do app.
   */
  processarNaAbertura: function() {
    var criadas = this.processar();
    if (!criadas.length) return criadas;

    if (typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
      UTILS.mostrarToast(
        criadas.length === 1
          ? '1 lançamento recorrente adicionado'
          : criadas.length + ' lançamentos recorrentes adicionados',
        'info',
      );
    }
    if (typeof atualizarDashboard === 'function') atualizarDashboard();
    return criadas;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = RECORRENTES;
}
