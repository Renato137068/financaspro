/**
 * setup-guide.js — progresso de configuração inicial ("Comece aqui").
 * Puro, zero DOM. Dá ao iniciante um caminho claro em vez de um dashboard de zeros.
 *
 * ES Module (ADR 0005): os scripts clássicos o recebem como global por
 * js/esm/ponte.js.
 */
const SETUP_GUIDE = {
  /**
   * @param {Object} estado { transacao, renda, orcamento, meta } — booleans
   *
   * Mesma ordem do "Comece em 3 passos" (lançar, renda) e do aviso de renda
   * do Resumo. Até 10/2026 o primeiro passo era "Personalize seu perfil", que
   * virava o próximo passo logo depois do primeiro lançamento e não ajudava a
   * pessoa a ver valor no app.
   * @returns {{ passos, concluidos, total, percentual, proximo, completo }}
   */
  computeProgress: function(estado) {
    estado = estado || {};
    var passos = [
      { chave: 'transacao', titulo: 'Adicione sua primeira transação', cta: 'Adicionar transação', feito: !!estado.transacao },
      { chave: 'renda',     titulo: 'Informe sua renda do mês',      cta: 'Lançar receita',      feito: !!estado.renda },
      { chave: 'orcamento', titulo: 'Defina um orçamento',            cta: 'Criar orçamento',     feito: !!estado.orcamento },
      { chave: 'meta',      titulo: 'Crie uma meta de economia',      cta: 'Criar meta',          feito: !!estado.meta }
    ];
    var concluidos = passos.filter(function(p) { return p.feito; }).length;
    var total = passos.length;
    var proximo = null;
    for (var i = 0; i < passos.length; i++) {
      if (!passos[i].feito) { proximo = passos[i]; break; }
    }
    return {
      passos:     passos,
      concluidos: concluidos,
      total:      total,
      percentual: Math.round((concluidos / total) * 100),
      proximo:    proximo,
      completo:   concluidos === total
    };
  },

  /**
   * Passo "renda": renda planejada (Orçamento ou tour) ou qualquer receita
   * lançada. O mesmo critério decide o aviso de renda no saldo do Resumo.
   */
  rendaInformada: function(cfg, txs) {
    return Number(cfg.renda) > 0 || Number(cfg.rendaMensal) > 0
      || (txs || []).some(function(t) { return t && t.tipo === 'receita'; });
  },

  /**
   * Mensagem curta do próximo passo (ou null se tudo concluído).
   * @param {Object} estado
   * @returns {{ texto, cta, chave, concluidos, total }|null}
   */
  mensagemProximoPasso: function(estado) {
    var p = SETUP_GUIDE.computeProgress(estado);
    if (p.completo || !p.proximo) return null;
    return {
      texto:      p.proximo.titulo,
      cta:        p.proximo.cta,
      chave:      p.proximo.chave,
      concluidos: p.concluidos,
      total:      p.total
    };
  },

  /**
   * Constrói o HTML do card "Comece aqui" (barra de progresso + 4 passos).
   * Puro e testável. Retorna '' quando o setup está completo.
   * Todos os textos são estáticos do app (sem dado de usuário).
   * @param {Object} estado
   * @returns {string}
   */
  buildCardHtml: function(estado) {
    var p = SETUP_GUIDE.computeProgress(estado);
    if (p.completo) return '';
    var proxChave = p.proximo ? p.proximo.chave : null;
    var steps = p.passos.map(function(s) {
      var ehProximo = s.chave === proxChave;
      var cls  = s.feito ? 'setup-step feito' : (ehProximo ? 'setup-step proximo' : 'setup-step');
      var icon = s.feito ? 'circle-check' : 'circle';
      var badge = ehProximo ? ' <span class="setup-badge">Próximo</span>' : '';
      return '<div class="' + cls + '"><i data-lucide="' + icon + '" aria-hidden="true"></i> <span>' + s.titulo + '</span>' + badge + '</div>';
    }).join('');
    // Renda: a aba Novo já em Receita (data-tipo, tratado pelo 'mudar-aba').
    var abaMap = { transacao: 'novo', renda: 'novo" data-tipo="receita', orcamento: 'orcamento', meta: 'config' };
    var cta = p.proximo
      ? '<button type="button" class="setup-cta" data-action="mudar-aba" data-aba="' +
          (abaMap[p.proximo.chave] || 'resumo') + '">' + p.proximo.cta +
          ' <i data-lucide="arrow-right" aria-hidden="true"></i></button>'
      : '';
    return '<div class="setup-card" role="region" aria-label="Guia de configuração inicial">' +
      '<div class="setup-card-head">' +
        '<i data-lucide="rocket" aria-hidden="true"></i>' +
        '<span class="setup-card-title">Comece aqui</span>' +
        '<span class="setup-card-count">' + p.concluidos + ' de ' + p.total + '</span>' +
      '</div>' +
      '<div class="setup-card-bar"><div class="setup-card-fill" style="width:' + p.percentual + '%"></div></div>' +
      '<div class="setup-card-steps">' + steps + '</div>' + cta +
    '</div>';
  },

  // ─── Instrumentação do funil ───────────────────────────────────
  //
  // Sem isto não se sabe onde as pessoas param. O guia pode estar ajudando ou
  // pode ter metade dos usuários desistindo no passo 2 há meses — as duas
  // hipóteses são indistinguíveis olhando só o código.
  //
  // Nada de dado financeiro é registrado: apenas qual passo foi concluído e
  // quantos faltam. O envio remoto continua condicionado ao opt-in em
  // observability.js; sem endpoint configurado, os eventos ficam só no buffer
  // local.

  /**
   * Passos concluídos entre um estado anterior e o atual.
   * Função pura — é o núcleo testável da instrumentação.
   *
   * @param {Object} anterior estado anterior ({} na primeira execução)
   * @param {Object} atual    estado atual
   * @returns {{ novos: string[], completouAgora: boolean }}
   */
  diffProgresso: function(anterior, atual) {
    var antes = anterior || {};
    var agora = atual || {};
    var chaves = ['transacao', 'renda', 'orcamento', 'meta'];

    var novos = chaves.filter(function(k) {
      return !!agora[k] && !antes[k];
    });

    var completoAntes = chaves.every(function(k) { return !!antes[k]; });
    var completoAgora = chaves.every(function(k) { return !!agora[k]; });

    return { novos: novos, completouAgora: completoAgora && !completoAntes };
  },

  /**
   * Emite os eventos do funil e devolve o estado a persistir.
   *
   * `persistencia` é injetado para manter a função testável sem localStorage:
   * { ler: () => estadoAnterior, gravar: (estado) => void }
   *
   * Idempotente por construção: um passo só gera evento na transição de
   * pendente para concluído. Chamar em todo render não duplica nada.
   */
  registrarProgresso: function(estado, persistencia, emitir) {
    var p = persistencia || {};
    var track = emitir || (typeof OBS !== 'undefined' && OBS.track
      ? function(nome, dados) { OBS.track(nome, dados); }
      : null);

    var anterior = null;
    try { anterior = p.ler ? p.ler() : null; } catch (e) { anterior = null; }

    var diff = SETUP_GUIDE.diffProgresso(anterior, estado);
    var progresso = SETUP_GUIDE.computeProgress(estado);

    if (track) {
      diff.novos.forEach(function(chave) {
        track('onboarding_passo_concluido', {
          passo: chave,
          concluidos: progresso.concluidos,
          total: progresso.total,
        });
      });
      if (diff.completouAgora) {
        track('onboarding_concluido', { total: progresso.total });
      }
    }

    try { if (p.gravar) p.gravar(estado); } catch (e) { /* persistência é best-effort */ }

    return diff;
  }
};

export { SETUP_GUIDE };
export default SETUP_GUIDE;
