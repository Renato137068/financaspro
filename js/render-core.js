/**
 * render-core.js - Núcleo de renderização modularizada
 * Base para sistema de renderização por seções independentes
 * 
 * Design:
 * - Cada seção é um renderer independente
 * - Cache de elementos DOM
 * - Re-render seletivo (não re-renderiza tudo)
 * - Preparação para virtual DOM futuro
 *
 * ES Module (ADR 0005): os scripts clássicos o recebem como global por
 * js/esm/ponte.js.
 */

import { UTILS } from './core/utils.js';
import { APP_STORE } from './core/store.js';

const RENDER_CORE = {
  // Cache de elementos DOM para evitar querySelector repetido
  _cache: new Map(),
  _renderers: new Map(),
  _pendingRenders: new Map(), // keyed by name — garante deduplicação
  _rafId: null,
  
  // ============================================================
  // REGISTRO DE RENDERERS
  // ============================================================
  
  /**
   * Registra um renderer para uma seção
   * @param {string} name - Nome da seção (ex: 'dashboard', 'extrato')
   * @param {Object} renderer - Objeto com método render() e opcionalmente shouldRender()
   */
  register: function(name, renderer) {
    if (!renderer || typeof renderer.render !== 'function') {
      console.error('[RENDER_CORE] Renderer inválido:', name);
      return false;
    }
    
    RENDER_CORE._renderers.set(name, {
      render: renderer.render.bind(renderer),
      shouldRender: renderer.shouldRender ? renderer.shouldRender.bind(renderer) : function() { return true; },
      lastRender: 0,
      renderCount: 0
    });
    
    return true;
  },
  
  /**
   * Obtém renderer registrado
   */
  getRenderer: function(name) {
    return RENDER_CORE._renderers.get(name);
  },
  
  // ============================================================
  // CACHE DE ELEMENTOS
  // ============================================================
  
  /**
   * Obtém elemento do cache ou DOM
   * @param {string} id - ID do elemento
   * @param {boolean} refresh - Força re-busca no DOM
   * @returns {Element|null}
   */
  getElement: function(id, refresh) {
    if (!refresh && RENDER_CORE._cache.has(id)) {
      var cached = RENDER_CORE._cache.get(id);
      if (cached && document.contains(cached)) {
        return cached;
      }
    }

    var el = document.getElementById(id);
    if (el) {
      RENDER_CORE._cache.set(id, el);
    }
    return el;
  },
  
  /**
   * Invalida cache de elemento específico ou todos
   */
  invalidateCache: function(id) {
    if (id) {
      RENDER_CORE._cache.delete(id);
    } else {
      RENDER_CORE._cache.clear();
    }
  },
  
  // ============================================================
  // RENDERIZAÇÃO
  // ============================================================
  
  /**
   * Renderiza uma seção específica imediatamente
   */
  render: function(name, context) {
    var renderer = RENDER_CORE._renderers.get(name);
    if (!renderer) {
      console.warn('[RENDER_CORE] Renderer não encontrado:', name);
      return false;
    }
    
    // Verificar se deve renderizar
    if (!renderer.shouldRender(context)) {
      return false;
    }
    
    try {
      var start = performance.now();
      renderer.render(context);
      var duration = performance.now() - start;
      
      renderer.lastRender = Date.now();
      renderer.renderCount++;

      // Dashboard completo (gráficos + módulos) costuma levar 30–150 ms no
      // primeiro paint — avisar só em re-renders ou quando exceder limite alto.
      var warnAt = 16;
      if (name === 'dashboard') {
        warnAt = renderer.renderCount <= 1 ? 180 : 100;
      }
      if (duration > warnAt) {
        console.warn('[RENDER_CORE] Render lento:', name, duration.toFixed(2) + 'ms');
      }
      
      return true;
    } catch (e) {
      console.error('[RENDER_CORE] Erro renderizando:', name, e);
      if (typeof OBS !== 'undefined' && OBS.captureError) OBS.captureError(e, { contexto: 'render:' + name });
      return false;
    }
  },
  
  /**
   * Agenda renderização em batch (evita múltiplos renders).
   * Chamadas repetidas para o mesmo name dentro do mesmo frame são colapsadas.
   */
  scheduleRender: function(name, context) {
    RENDER_CORE._pendingRenders.set(name, context); // Map.set sobrescreve — deduplicação automática

    if (RENDER_CORE._rafId) return;

    var self = RENDER_CORE;
    RENDER_CORE._rafId = requestAnimationFrame(function() {
      self._flushPending();
    });
  },

  /**
   * Executa renders pendentes em batch
   */
  _flushPending: function() {
    RENDER_CORE._rafId = null;

    var self = RENDER_CORE;
    RENDER_CORE._pendingRenders.forEach(function(context, name) {
      self.render(name, context);
    });

    RENDER_CORE._pendingRenders.clear();
  },
  
  /**
   * Renderiza múltiplas seções
   */
  renderMany: function(names, context) {
    var results = {};
    var self = RENDER_CORE;
    names.forEach(function(name) {
      results[name] = self.render(name, context);
    });
    return results;
  },
  
  /**
   * Renderiza todas as seções (inicialização)
   */
  renderAll: function(context) {
    var results = {};
    var self = RENDER_CORE;
    RENDER_CORE._renderers.forEach(function(renderer, name) {
      results[name] = self.render(name, context);
    });
    return results;
  },
  
  // ============================================================
  // UTILITÁRIOS DE DOM SEGUROS
  // ============================================================
  
  /**
   * Cria elemento seguro (evita innerHTML)
   * @param {string} tag - Tag HTML
   * @param {Object} attrs - Atributos
   * @param {string|Array} content - Conteúdo (texto ou elementos filhos)
   * @returns {Element}
   */
  createElement: function(tag, attrs, content) {
    var el = document.createElement(tag);
    
    if (attrs) {
      for (var key in attrs) {
        if (key === 'textContent') {
          el.textContent = attrs[key];
        } else if (key === 'innerHTML' && !attrs.__trusted) {
          // Bloquear innerHTML não confiável
          console.warn('[RENDER_CORE] innerHTML bloqueado, use textContent ou createElement');
        } else if (key.startsWith('on') && typeof attrs[key] === 'function') {
          // Eventos
          el.addEventListener(key.substring(2).toLowerCase(), attrs[key]);
        } else {
          el.setAttribute(key, attrs[key]);
        }
      }
    }
    
    if (content) {
      if (typeof content === 'string') {
        el.textContent = content;
      } else if (Array.isArray(content)) {
        content.forEach(function(child) {
          if (typeof child === 'string') {
            el.appendChild(document.createTextNode(child));
          } else if (child instanceof Element) {
            el.appendChild(child);
          }
        });
      } else if (content instanceof Element) {
        el.appendChild(content);
      }
    }
    
    return el;
    },
  
  /**
   * Limpa conteúdo de elemento preservando o nó no DOM e no cache.
   */
  clearElement: function(el) {
    if (!el) return el;
    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }
    return el;
  },
  
  /**
   * Verifica se elemento está visível (para lazy render)
   */
  isVisible: function(el) {
    if (!el) return false;
    var rect = el.getBoundingClientRect();
    return rect.top < window.innerHeight && rect.bottom > 0;
  },
  
  // ============================================================
  // INTEGRAÇÃO COM STORE
  // ============================================================

  /**
   * Conecta o RENDER_CORE ao APP_STORE.
   * Chamado uma única vez após todos os módulos estarem prontos.
   * Qualquer mudança nos versioners de dados agenda o render correspondente.
   */
  connectToStore: function() {
    if (typeof APP_STORE === 'undefined') return;
    var self = RENDER_CORE;

    // Dados (transações, config, contas, orçamentos) → re-render do dashboard
    APP_STORE.subscribe('dados', function() {
      self.scheduleRender('dashboard');
    });

    // Filtros de UI → re-render do extrato (se registrado)
    APP_STORE.subscribe('ui.filtros', function() {
      self.scheduleRender('extrato');
    });
  },

  // ============================================================
  // DEBUG
  // ============================================================

  getStats: function() {
    var stats = {};
    RENDER_CORE._renderers.forEach(function(renderer, name) {
      stats[name] = {
        renderCount: renderer.renderCount,
        lastRender: renderer.lastRender,
        lastRenderAgo: Date.now() - renderer.lastRender
      };
    });
    return stats;
  }
};

// ============================================================
// RENDERERS BASE PARA EXTENSÃO
// ============================================================

const RENDERER_BASE = {
  // Método obrigatório: render()
  render: function(_context) {
    throw new Error('Renderer deve implementar render()');
  },

  // Método opcional: shouldRender(context)
  shouldRender: function(_context) {
    return true;
  },
  
  // Helper: Obter elemento cacheado
  getEl: function(id) {
    return RENDER_CORE.getElement(id);
  },
  
  // Helper: Criar elemento seguro
  create: function(tag, attrs, content) {
    return RENDER_CORE.createElement(tag, attrs, content);
  },
  
  // Helper: Escape HTML
  escape: function(text) {
    if (typeof UTILS !== 'undefined' && UTILS.escapeHtml) {
      return UTILS.escapeHtml(text);
    }
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },
  
  // Helper: Formatar moeda
  money: function(valor) {
    if (typeof UTILS !== 'undefined' && UTILS.formatarMoeda) {
      return UTILS.formatarMoeda(valor);
    }
    return 'R$ ' + valor.toFixed(2).replace('.', ',');
  }
};

export { RENDER_CORE, RENDERER_BASE };
