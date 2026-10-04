/**
 * extrato/lista.js — a lista: agrupamento por dia, rolagem virtual, paginação, item, anexos, marcadores e estados vazio/carregando.
 *
 * Parte de INIT_EXTRATO (js/modules/init-extrato.js, que importa todas as
 * partes): cada uma acrescenta seus métodos ao mesmo objeto, criado em
 * extrato/base.js. Os métodos continuam se chamando por INIT_EXTRATO.x.
 */

import { INIT_EXTRATO, _extratoCent } from './base.js';
import { CONFIG } from '../../core/config.js';
import { UTILS } from '../../core/utils.js';
import { UI } from '../../components/ui.js';
import { INIT_NAVIGATION } from '../init-navigation.js';
import { DADOS } from '../../core/dados.js';

Object.assign(INIT_EXTRATO, {

  /**
   * Renderiza a lista de transações com agrupamento por data
   */
  renderExtratoLista: function(txs) {
    var container = document.getElementById('lista-transacoes');
    if (!container) return;
    
    if (txs.length === 0) {
      INIT_EXTRATO._virtualAtivo = false;
      INIT_EXTRATO._limparSpacersVirtuais();
      container.innerHTML = INIT_EXTRATO._renderEmptyState();
      INIT_EXTRATO._atualizarContadorExtrato(0, 0);
      return;
    }

    // Agrupar transações por período temporal
    var grupos = INIT_EXTRATO._agruparTransacoesPorPeriodo(txs);
    
    // Reset paginação quando mudam os filtros
    INIT_EXTRATO.state.virtualScroll.totalItems = txs.length;
    INIT_EXTRATO.state.virtualScroll.currentPage = 0;
    INIT_EXTRATO._virtualLastStart = -1;

    if (INIT_EXTRATO._usaVirtualizacao(txs)) {
      INIT_EXTRATO._virtualAtivo = true;
      INIT_EXTRATO._renderGruposVirtual(txs);
      return;
    }

    INIT_EXTRATO._virtualAtivo = false;
    INIT_EXTRATO._limparSpacersVirtuais();

    // Renderizar grupos
    INIT_EXTRATO._renderGrupos(grupos, txs);
  },

  _usaVirtualizacao: function(txs) {
    var limiar = INIT_EXTRATO.state.virtualScroll.virtualThreshold || 100;
    return Array.isArray(txs) && txs.length >= limiar;
  },

  _limparSpacersVirtuais: function() {
    var top = document.getElementById('extrato-virtual-spacer-top');
    var bot = document.getElementById('extrato-virtual-spacer-bottom');
    if (top) top.style.height = '0px';
    if (bot) bot.style.height = '0px';
  },

  _atualizarSpacersVirtuais: function(start, rendered, total) {
    var vs = INIT_EXTRATO.state.virtualScroll;
    var h = vs.estimatedItemHeight || 76;
    var top = document.getElementById('extrato-virtual-spacer-top');
    var bot = document.getElementById('extrato-virtual-spacer-bottom');
    if (top) top.style.height = (start * h) + 'px';
    if (bot) bot.style.height = Math.max(0, (total - start - rendered) * h) + 'px';
  },

  _calcularJanelaVirtual: function(total) {
    var vs = INIT_EXTRATO.state.virtualScroll;
    var win = vs.windowSize || 60;
    var h = vs.estimatedItemHeight || 76;
    var overscan = vs.overscan || 8;
    var viewport = document.getElementById('extrato-lista-viewport');
    var start = 0;

    if (viewport && typeof window !== 'undefined') {
      var anchor = viewport.getBoundingClientRect().top + window.pageYOffset;
      var scrollPast = Math.max(0, window.pageYOffset + 96 - anchor);
      start = Math.floor(scrollPast / h) - overscan;
    }

    start = Math.max(0, Math.min(start, Math.max(0, total - 1)));
    var count = Math.min(win + overscan * 2, total - start);
    return { start: start, count: Math.max(count, 0) };
  },

  _bindVirtualScroll: function() {
    if (INIT_EXTRATO._virtualScrollBound || typeof window === 'undefined') return;
    INIT_EXTRATO._virtualScrollBound = true;
    var self = INIT_EXTRATO;
    var timer;
    window.addEventListener('scroll', function() {
      if (!self._virtualAtivo || !self._listaTxsAtual) return;
      clearTimeout(timer);
      timer = setTimeout(function() {
        self._renderGruposVirtual(self._listaTxsAtual, true);
      }, 80);
    }, { passive: true });
  },

  _renderGruposVirtual: function(txs, fromScroll) {
    var container = document.getElementById('lista-transacoes');
    if (!container) return;

    var grupos = INIT_EXTRATO._agruparTransacoesPorPeriodo(txs);
    var gruposOrdenados = INIT_EXTRATO._ordenarGrupos(grupos);
    INIT_EXTRATO._gruposOrdenadosAtual = gruposOrdenados;
    INIT_EXTRATO._listaTxsAtual = txs;
    INIT_EXTRATO._bindListaTransacoesClick();

    var janela = INIT_EXTRATO._calcularJanelaVirtual(txs.length);
    if (fromScroll && janela.start === INIT_EXTRATO._virtualLastStart) return;
    INIT_EXTRATO._virtualLastStart = janela.start;

    var slice = INIT_EXTRATO._renderGruposHtml(gruposOrdenados, janela.start, janela.count);
    container.innerHTML = slice.html;
    INIT_EXTRATO._atualizarSpacersVirtuais(janela.start, slice.rendered, txs.length);

    var exibidos = janela.start + slice.rendered;
    var el = document.getElementById('extrato-lista-meta');
    if (el && txs.length) {
      el.hidden = false;
      el.textContent = 'Exibindo itens ' + (janela.start + 1) + '–' + exibidos
        + ' de ' + txs.length + ' (rolagem virtual)';
    }

    if (typeof renderLucideIconsNow === 'function') renderLucideIconsNow(container);
  },

  /**
   * Agrupa transações por período temporal (HOJE, ONTEM, ESTA SEMANA, MÊS)
   */
  _agruparTransacoesPorPeriodo: function(txs) {
    var grupos = {};
    var hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    var ontem = new Date(hoje);
    ontem.setDate(ontem.getDate() - 1);
    var inicioSemana = new Date(hoje);
    inicioSemana.setDate(hoje.getDate() - hoje.getDay());

    txs.forEach(function(t) {
      var dataTx = new Date(t.data + 'T00:00:00');
      dataTx.setHours(0, 0, 0, 0);
      var grupo = '';

      if (dataTx.getTime() === hoje.getTime()) {
        grupo = 'HOJE';
      } else if (dataTx.getTime() === ontem.getTime()) {
        grupo = 'ONTEM';
      } else if (dataTx >= inicioSemana && dataTx < hoje) {
        grupo = 'ESTA SEMANA';
      } else if (dataTx.getMonth() === hoje.getMonth() && dataTx.getFullYear() === hoje.getFullYear()) {
        // Mesmo mês corrente que já aparece no cabeçalho do Extrato — evita
        // repetir "Setembro 2026" como rótulo de grupo (nit da auditoria UI/UX).
        grupo = 'MAIS CEDO NO MÊS';
      } else {
        var nomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
        grupo = nomes[dataTx.getMonth()].toUpperCase() + ' ' + dataTx.getFullYear();
      }

      if (!grupos[grupo]) grupos[grupo] = [];
      grupos[grupo].push(t);
    });

    return grupos;
  },

  /**
   * Ordena grupos temporais (HOJE, ONTEM, ESTA SEMANA, depois meses).
   */
  _ordenarGrupos: function(grupos) {
    var ordemGrupos = ['HOJE', 'ONTEM', 'ESTA SEMANA', 'MAIS CEDO NO MÊS'];
    var gruposOrdenados = {};
    ordemGrupos.forEach(function(g) {
      if (grupos[g]) gruposOrdenados[g] = grupos[g];
    });
    Object.keys(grupos).filter(function(g) {
      return ordemGrupos.indexOf(g) === -1;
    }).sort(function(a, b) {
      return new Date(b) - new Date(a);
    }).forEach(function(g) {
      gruposOrdenados[g] = grupos[g];
    });
    return gruposOrdenados;
  },

  /**
   * Gera HTML de grupos a partir de um offset global (paginação).
   * @returns {{ html: string, rendered: number }}
   */
  _renderGruposHtml: function(gruposOrdenados, startItem, maxItems) {
    var html = '';
    var skipped = 0;
    var rendered = 0;
    var grupoKeys = Object.keys(gruposOrdenados);
    var self = INIT_EXTRATO;

    for (var i = 0; i < grupoKeys.length; i++) {
      if (rendered >= maxItems) break;
      var grupo = grupoKeys[i];
      var grupoTxs = gruposOrdenados[grupo];

      var subtotalC = 0;
      grupoTxs.forEach(function(t) {
        subtotalC += t.tipo === CONFIG.TIPO_RECEITA ? _extratoCent(t.valor) : -_extratoCent(t.valor);
      });
      var subtotal = subtotalC / 100;

      var itemsHtml = '';
      var renderedThisGroup = 0;
      for (var j = 0; j < grupoTxs.length; j++) {
        if (skipped < startItem) {
          skipped++;
          continue;
        }
        if (rendered >= maxItems) break;
        itemsHtml += self._renderTransacaoItem(grupoTxs[j]);
        rendered++;
        renderedThisGroup++;
      }

      if (!itemsHtml) continue;

      // O subtotal é sempre do DIA INTEIRO (é o número que importa). Quando a
      // rolagem virtual corta o grupo e só parte das linhas aparece, o subtotal
      // não bate com a soma visível — então deixamos explícito que ele é do dia,
      // para o número não parecer "errado".
      var parcial = renderedThisGroup < grupoTxs.length;
      var subLabel = 'Saldo do dia ' + grupo + ': ' + UTILS.formatarMoeda(subtotal)
        + (parcial ? ' (dia inteiro; exibindo ' + renderedThisGroup + ' de ' + grupoTxs.length + ' lançamentos)' : '');

      html += '<div class="ext-grupo" role="group" aria-label="' + UTILS.escapeHtml(grupo) + '">';
      html += '<div class="ext-grupo-header">';
      html += '<span class="ext-grupo-data">' + grupo + '</span>';
      html += '<span class="ext-grupo-subtotal ' + (subtotal >= 0 ? 'positivo' : 'negativo') +
        (parcial ? ' ext-grupo-subtotal--parcial' : '') + '" aria-label="' + UTILS.escapeHtml(subLabel) + '">' +
        (subtotal >= 0 ? '+' : '') + UTILS.formatarMoeda(subtotal) +
        (parcial ? '<span class="ext-grupo-subtotal-hint" aria-hidden="true"> · dia inteiro</span>' : '') +
        '</span>';
      html += '</div>';
      html += '<div class="ext-grupo-list" role="list">';
      html += itemsHtml;
      html += '</div></div>';
    }

    return { html: html, rendered: rendered };
  },

  _atualizarContadorExtrato: function(total, mostrados) {
    var el = document.getElementById('extrato-lista-meta');
    if (!el) return;
    if (!total) {
      el.textContent = '';
      el.hidden = true;
      return;
    }
    var maxRendered = INIT_EXTRATO._maxRenderedExtrato();
    var exibidos = Math.min(mostrados, total, maxRendered);
    el.hidden = false;
    if (total > maxRendered && exibidos >= maxRendered) {
      el.textContent = 'Mostrando ' + exibidos + ' de ' + total
        + ' transações (limite de exibição — use filtros)';
    } else {
      el.textContent = 'Mostrando ' + exibidos + ' de ' + total + ' transações';
    }
  },

  _maxRenderedExtrato: function() {
    return INIT_EXTRATO.state.virtualScroll.maxRendered || 500;
  },

  _desconectarScrollMaisObserver: function() {
    if (INIT_EXTRATO._scrollMaisObserver) {
      INIT_EXTRATO._scrollMaisObserver.disconnect();
      INIT_EXTRATO._scrollMaisObserver = null;
    }
  },

  _vincularScrollMaisObserver: function(txs) {
    var self = INIT_EXTRATO;
    INIT_EXTRATO._desconectarScrollMaisObserver();
    if (typeof IntersectionObserver === 'undefined') return;
    var btn = document.getElementById('btn-carregar-mais');
    if (!btn) return;
    INIT_EXTRATO._scrollMaisObserver = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) self._carregarMais(txs);
      });
    }, { root: null, rootMargin: '160px', threshold: 0 });
    INIT_EXTRATO._scrollMaisObserver.observe(btn);
  },

  _appendControlesPaginacao: function(html, txs, totalShown) {
    var maxRendered = INIT_EXTRATO._maxRenderedExtrato();
    if (totalShown < txs.length && totalShown < maxRendered) {
      var restantes = Math.min(txs.length, maxRendered) - totalShown;
      html += '<button type="button" class="btn-carregar-mais" id="btn-carregar-mais">Carregar mais ('
        + restantes + ')</button>';
    } else if (txs.length > maxRendered && totalShown >= maxRendered) {
      html += '<p class="extrato-lista-limite" role="status">Mostrando os primeiros ' + maxRendered
        + ' de ' + txs.length + ' transações. Use filtros ou exporte o período para refinar.</p>';
    }
    return html;
  },

  /**
   * Renderiza grupos de transações (primeira página ou re-render completo).
   */
  _renderGrupos: function(grupos, txs) {
    var container = document.getElementById('lista-transacoes');
    if (!container) return;

    INIT_EXTRATO._listaTxsAtual = txs;
    INIT_EXTRATO._bindListaTransacoesClick();

    var gruposOrdenados = INIT_EXTRATO._ordenarGrupos(grupos);
    INIT_EXTRATO._gruposOrdenadosAtual = gruposOrdenados;

    var pageSize = INIT_EXTRATO.state.virtualScroll.pageSize;
    var maxRendered = INIT_EXTRATO._maxRenderedExtrato();
    var startItem = INIT_EXTRATO.state.virtualScroll.currentPage * pageSize;
    var limit = Math.min(pageSize, Math.max(0, maxRendered - startItem));
    var slice = INIT_EXTRATO._renderGruposHtml(gruposOrdenados, startItem, limit || pageSize);
    var html = slice.html;
    var totalShown = startItem + slice.rendered;

    html = INIT_EXTRATO._appendControlesPaginacao(html, txs, totalShown);

    container.innerHTML = html;
    INIT_EXTRATO._atualizarContadorExtrato(txs.length, totalShown);
    INIT_EXTRATO._vincularScrollMaisObserver(txs);

    if (typeof renderLucideIconsNow === 'function') renderLucideIconsNow(container);
  },

  /**
   * Renderiza um item de transação
   */
  /**
   * Botão de ver os comprovantes. Era só um selo decorativo (aria-hidden) e o
   * _anexoBtnHtml não era chamado: quem anexava um comprovante não tinha onde
   * abri-lo. O botão não depende do chunk 'anexos' estar carregado — o clique
   * o carrega (_verAnexos).
   */
  _anexoBtnHtml: function(t) {
    if (!t.anexoCount) return '';
    var n = Number(t.anexoCount) || 0;
    return '<button type="button" class="btn-anexo ext-tx-anexo-badge" data-transacao-id="' +
      UTILS.escapeHtml(String(t.id)) + '" title="Ver comprovante" aria-label="Ver comprovante (' + n + ')">' +
      '<i data-lucide="paperclip" aria-hidden="true"></i></button>';
  },

  _verAnexos: function(transacaoId) {
    var abrir = function() {
      if (typeof INIT_ANEXOS !== 'undefined') INIT_ANEXOS.abrirVisualizador(transacaoId);
    };
    if (typeof INIT_NAVIGATION !== 'undefined' && INIT_NAVIGATION.carregarChunkAnexos) {
      INIT_NAVIGATION.carregarChunkAnexos(abrir);
    } else {
      abrir();
    }
  },

  /** Chips das tags de uma transação, clicáveis para filtrar. */
  _tagsHtml: function(t) {
    if (!Array.isArray(t.tags) || !t.tags.length) return '';
    var ativa = INIT_EXTRATO.state.filtroTag;
    return t.tags.map(function(tg) {
      var on = tg === ativa ? ' ext-tx-tag--ativa' : '';
      return '<button type="button" class="ext-tx-tag' + on + '" data-tag-filter="' +
        UTILS.escapeHtml(tg) + '" aria-pressed="' + (tg === ativa ? 'true' : 'false') +
        '">#' + UTILS.escapeHtml(tg) + '</button>';
    }).join('');
  },

  _renderTransacaoItem: function(t) {
    var data = new Date(t.data + 'T00:00:00');
    var dataStr = data.toLocaleDateString('pt-BR');
    var catIcon = INIT_EXTRATO.getCatIcon(t.categoria);
    var catCor = INIT_EXTRATO.getCatCor(t.categoria);
    var isChecked = INIT_EXTRATO.state.selecionados.indexOf(String(t.id)) > -1 ? 'checked' : '';
    // Descrição vem guardada escapada; decodifica para exibir/rotular sem escape
    // duplo. As saídas abaixo continuam passando por escapeHtml, então seguras.
    var desc = UTILS.desescapeHtml(t.descricao || t.categoria);

    return '<div class="ext-tx" role="listitem" tabindex="0" data-id="' + UTILS.escapeHtml(String(t.id)) + '" aria-label="Transação: ' + UTILS.escapeHtml(desc) + '">' +
      '<input type="checkbox" class="tx-checkbox" data-tx-id="' + UTILS.escapeHtml(String(t.id)) + '" ' + isChecked +
        ' aria-label="Selecionar: ' + UTILS.escapeHtml(desc) + '">' +
      '<div class="ext-tx-icon" style="background: ' + catCor + '20; color: ' + catCor + '">' + catIcon + '</div>' +
      '<div class="ext-tx-info">' +
        '<div class="ext-tx-desc">' + UTILS.escapeHtml(desc) + '</div>' +
        '<div class="ext-tx-meta">' +
          '<span class="ext-tx-meta-tag">' + UTILS.escapeHtml(CONFIG.getCatLabel(t.categoria)) + '</span>' +
          '<span>' + dataStr + '</span>' +
          INIT_EXTRATO._anexoBtnHtml(t) +
          INIT_EXTRATO._tagsHtml(t) +
        '</div>' +
      '</div>' +
      '<div class="ext-tx-valor ' + UTILS.escapeHtml(t.tipo) + '">' +
        (t.tipo === CONFIG.TIPO_RECEITA ? '+' : '-') + UTILS.formatarMoeda(t.valor) +
      '</div>' +
    '</div>';
  },

  /**
   * Renderiza o estado vazio
   */
  _renderEmptyState: function() {
    var totalReal = (typeof DADOS !== 'undefined' && DADOS.getTransacoes) ? DADOS.getTransacoes().length : 0;
    var filtrosAtivos = INIT_EXTRATO.state.filtroTipo !== 'todos' || INIT_EXTRATO.state.filtroCat
      || INIT_EXTRATO.state.busca
      || INIT_EXTRATO.state.buscaAvancada.valorMin != null
      || INIT_EXTRATO.state.buscaAvancada.valorMax != null
      || INIT_EXTRATO.state.buscaAvancada.dataInicio
      || INIT_EXTRATO.state.buscaAvancada.dataFim;
    var opts = totalReal === 0
      ? {
          lucide: 'wallet',
          titulo: 'Seu extrato começa aqui',
          subtitulo: 'Adicione sua primeira transação para ver tudo organizado por dia.',
          aba: 'novo',
          ctaTexto: 'Adicionar primeira transação',
          animado: true,
        }
      : {
          lucide: 'search-x',
          titulo: 'Nenhuma movimentação encontrada',
          subtitulo: filtrosAtivos
            ? 'Nenhum lançamento combina com os filtros atuais.'
            : 'Tente selecionar outro intervalo de período.',
          aba: filtrosAtivos ? null : 'novo',
          ctaTexto: filtrosAtivos ? null : 'Registrar transação',
          animado: true,
        };
    if (typeof UI !== 'undefined' && UI.EmptyState && typeof UI.EmptyState.render === 'function') {
      var el = UI.EmptyState.render(opts);
      if (el) {
        el.setAttribute('role', 'status');
        if (filtrosAtivos && totalReal > 0) {
          var btnLimpar = document.createElement('button');
          btnLimpar.type = 'button';
          btnLimpar.className = 'btn-empty-cta btn-empty-cta--secundario';
          btnLimpar.id = 'extrato-empty-limpar-filtros';
          btnLimpar.innerHTML = '<i data-lucide="rotate-ccw" aria-hidden="true"></i> Limpar filtros';
          btnLimpar.addEventListener('click', function() { INIT_EXTRATO.limparFiltros(); });
          el.appendChild(btnLimpar);
          if (typeof renderLucideIcons === 'function') renderLucideIcons(el);
        }
        return el.outerHTML;
      }
    }
    var html = '<div class="empty-state" role="status">' +
      '<div class="empty-state-title">' + opts.titulo + '</div>' +
      '<div class="empty-state-message">' + opts.subtitulo + '</div>';
    if (filtrosAtivos && totalReal > 0) {
      html += '<button type="button" class="btn-empty-cta btn-empty-cta--secundario" id="extrato-empty-limpar-filtros">' +
        'Limpar filtros</button>';
    } else if (opts.aba) {
      html += '<button type="button" class="btn-empty-cta" data-mudar-aba="' + opts.aba + '">' +
        (opts.ctaTexto || 'Começar') + '</button>';
    }
    html += '</div>';
    return html;
  },

  /**
   * Carrega mais itens na lista (virtual scrolling)
   */
  _carregarMais: function(txs) {
    var maxRendered = INIT_EXTRATO._maxRenderedExtrato();
    var pageSize = INIT_EXTRATO.state.virtualScroll.pageSize;
    var proximoStart = (INIT_EXTRATO.state.virtualScroll.currentPage + 1) * pageSize;
    if (proximoStart >= maxRendered) return;

    INIT_EXTRATO.state.virtualScroll.currentPage++;
    var container = document.getElementById('lista-transacoes');
    if (!container) return;

    var btnCarregarMais = document.getElementById('btn-carregar-mais');
    if (btnCarregarMais) btnCarregarMais.remove();

    var startItem = INIT_EXTRATO.state.virtualScroll.currentPage * pageSize;
    var limit = Math.min(pageSize, Math.max(0, maxRendered - startItem));
    var gruposOrdenados = INIT_EXTRATO._gruposOrdenadosAtual || {};
    var slice = INIT_EXTRATO._renderGruposHtml(gruposOrdenados, startItem, limit || pageSize);
    var html = slice.html;
    var totalShown = startItem + slice.rendered;

    html = INIT_EXTRATO._appendControlesPaginacao(html, txs, totalShown);

    container.insertAdjacentHTML('beforeend', html);
    INIT_EXTRATO._atualizarContadorExtrato(txs.length, totalShown);
    INIT_EXTRATO._vincularScrollMaisObserver(txs);
    if (typeof renderLucideIconsNow === 'function') renderLucideIconsNow(container);
  },

  /**
   * Renderiza skeleton loading
   */
  _renderSkeleton: function() {
    var skeleton = '<div class="skeleton-loading">';
    for (var i = 0; i < 5; i++) {
      skeleton += '<div class="skeleton-item">' +
        '<div class="skeleton-icon"></div>' +
        '<div class="skeleton-content">' +
          '<div class="skeleton-header">' +
            '<div class="skeleton-line skeleton-category"></div>' +
            '<div class="skeleton-line skeleton-date"></div>' +
          '</div>' +
          '<div class="skeleton-line skeleton-description"></div>' +
          '<div class="skeleton-line skeleton-meta"></div>' +
        '</div>' +
        '<div class="skeleton-valor"></div>' +
      '</div>';
    }
    skeleton += '</div>';
    return skeleton;
  },
});
