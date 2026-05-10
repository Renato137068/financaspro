/**
 * dom-safe.js - Utilitários seguros para manipulação de DOM
 * Substitui innerHTML/outerHTML por métodos seguros contra XSS
 * 
 * Prioridade:
 * - Campos de formulário
 * - Inputs dinâmicos  
 * - Listas de transações
 * - Qualquer lugar com dados do usuário
 */

const DOM_SAFE = {
  // ============================================================
  // CRIAÇÃO SEGURA DE ELEMENTOS
  // ============================================================
  
  /**
   * Cria elemento com atributos e filhos de forma segura
   * @param {string} tag - Tag HTML
   * @param {Object} options - { attrs, text, html, children, events }
   * @returns {Element}
   */
  create: function(tag, options) {
    options = options || {};
    var el = document.createElement(tag);
    
    // Atributos
    if (options.attrs) {
      for (var key in options.attrs) {
        if (key === 'className') {
          el.className = options.attrs[key];
        } else if (key === 'textContent') {
          el.textContent = options.attrs[key];
        } else if (key === 'innerHTML') {
          // Bloquear - usar textContent ou children
          console.warn('[DOM_SAFE] innerHTML bloqueado em create()');
        } else {
          el.setAttribute(key, options.attrs[key]);
        }
      }
    }
    
    // Texto simples (seguro)
    if (options.text) {
      el.textContent = options.text;
    }
    
    // Eventos
    if (options.events) {
      for (var event in options.events) {
        el.addEventListener(event, options.events[event]);
      }
    }
    
    // Filhos
    if (options.children) {
      this.appendChildren(el, options.children);
    }
    
    return el;
  },
  
  /**
   * Adiciona filhos a um elemento
   * @param {Element} parent
   * @param {Array} children - Elementos ou strings
   */
  appendChildren: function(parent, children) {
    var self = this;
    children.forEach(function(child) {
      if (typeof child === 'string') {
        parent.appendChild(document.createTextNode(child));
      } else if (child instanceof Element) {
        parent.appendChild(child);
      } else if (child && typeof child.render === 'function') {
        parent.appendChild(child.render());
      }
    });
  },
  
  // ============================================================
  // LISTAS E TEMPLATES
  // ============================================================
  
  /**
   * Cria lista de elementos a partir de dados
   * @param {Array} items - Dados
   * @param {Function} renderItem - (item, index) => Element
   * @param {Object} options - { emptyMessage, containerTag, containerClass }
   * @returns {Element}
   */
  createList: function(items, renderItem, options) {
    options = options || {};
    var container = this.create(options.containerTag || 'div', {
      attrs: { className: options.containerClass || 'safe-list' }
    });
    
    if (!items || items.length === 0) {
      if (options.emptyMessage) {
        container.appendChild(this.create('div', {
          attrs: { className: 'empty-state' },
          text: options.emptyMessage
        }));
      }
      return container;
    }
    
    var self = this;
    items.forEach(function(item, index) {
      var el = renderItem.call(self, item, index);
      if (el instanceof Element) {
        container.appendChild(el);
      }
    });
    
    return container;
  },
  
  /**
   * Limpa elemento de forma segura (remove listeners)
   * @param {Element} el
   */
  clear: function(el) {
    if (!el || !el.parentNode) return;
    
    // Clonar sem filhos e substituir
    var clone = el.cloneNode(false);
    el.parentNode.replaceChild(clone, el);
    return clone;
  },
  
  // ============================================================
  // FORMULÁRIOS SEGUROS
  // ============================================================
  
  /**
   * Cria input seguro
   * @param {Object} options - { type, name, value, placeholder, required, attrs }
   * @returns {HTMLInputElement}
   */
  createInput: function(options) {
    options = options || {};
    var input = document.createElement('input');
    
    input.type = options.type || 'text';
    if (options.name) input.name = options.name;
    if (options.id) input.id = options.id;
    if (options.value !== undefined) input.value = options.value;
    if (options.placeholder) input.placeholder = options.placeholder;
    if (options.required) input.required = true;
    if (options.readOnly) input.readOnly = true;
    if (options.disabled) input.disabled = true;
    
    // Atributos extras
    if (options.attrs) {
      for (var key in options.attrs) {
        input.setAttribute(key, options.attrs[key]);
      }
    }
    
    return input;
  },
  
  /**
   * Cria select com options
   * @param {Object} options - { name, value, options: [{value, text}] }
   * @returns {HTMLSelectElement}
   */
  createSelect: function(options) {
    options = options || {};
    var select = document.createElement('select');
    
    if (options.name) select.name = options.name;
    if (options.id) select.id = options.id;
    
    // Option vazia
    if (options.emptyOption) {
      var emptyOpt = document.createElement('option');
      emptyOpt.value = '';
      emptyOpt.textContent = options.emptyOption;
      select.appendChild(emptyOpt);
    }
    
    // Options
    if (options.options) {
      options.options.forEach(function(opt) {
        var option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.text;
        if (opt.selected || opt.value === options.value) {
          option.selected = true;
        }
        select.appendChild(option);
      });
    }
    
    return select;
  },
  
  /**
   * Cria grupo de formulário (label + input)
   * @param {Object} options
   * @returns {Element}
   */
  createFormGroup: function(options) {
    var group = this.create('div', { attrs: { className: 'form-group' } });
    
    if (options.label) {
      var label = this.create('label', {
        attrs: { htmlFor: options.id },
        text: options.label
      });
      group.appendChild(label);
    }
    
    var input;
    if (options.type === 'select') {
      input = this.createSelect(options);
    } else if (options.type === 'textarea') {
      input = document.createElement('textarea');
      input.rows = options.rows || 3;
      if (options.placeholder) input.placeholder = options.placeholder;
      if (options.value) input.value = options.value;
    } else {
      input = this.createInput(options);
    }
    
    if (options.id) input.id = options.id;
    group.appendChild(input);
    
    return group;
  },
  
  // ============================================================
  // COMPONENTES ESPECÍFICOS
  // ============================================================
  
  /**
   * Cria card de transação seguro
   * @param {Object} transacao
   * @returns {Element}
   */
  createTransacaoCard: function(transacao) {
    var isReceita = transacao.tipo === 'receita';
    var classe = isReceita ? 'transacao-receita' : 'transacao-despesa';
    var icone = isReceita ? '💚' : '❤️';
    var prefixo = isReceita ? '+' : '-';
    
    var card = this.create('div', {
      attrs: {
        className: 'transacao-card ' + classe,
        'data-id': transacao.id
      }
    });
    
    // Icone
    var iconEl = this.create('span', {
      attrs: { className: 'transacao-icone' },
      text: icone
    });
    card.appendChild(iconEl);
    
    // Info
    var info = this.create('div', { attrs: { className: 'transacao-info' } });
    
    var desc = this.create('div', {
      attrs: { className: 'transacao-descricao' },
      text: transacao.descricao || transacao.categoria
    });
    info.appendChild(desc);
    
    var meta = this.create('div', {
      attrs: { className: 'transacao-meta' },
      text: transacao.categoria + ' · ' + transacao.data
    });
    info.appendChild(meta);
    
    card.appendChild(info);
    
    // Valor
    var valor = this.create('div', {
      attrs: { className: 'transacao-valor ' + classe },
      text: prefixo + ' R$ ' + (transacao.valor || 0).toFixed(2).replace('.', ',')
    });
    card.appendChild(valor);
    
    return card;
  },
  
  /**
   * Cria chip de categoria seguro
   * @param {Object} options
   * @returns {Element}
   */
  createCategoriaChip: function(options) {
    var chip = this.create('button', {
      attrs: {
        type: 'button',
        className: 'categoria-chip ' + (options.ativo ? 'ativo' : ''),
        'data-categoria': options.categoria,
        'data-tipo': options.tipo || 'despesa',
        'data-action': options.action || 'selecionar-categoria'
      },
      text: options.emoji + ' ' + options.label
    });
    
    return chip;
  },
  
  /**
   * Cria barra de progresso segura
   * @param {Object} options
   * @returns {Element}
   */
  createProgressBar: function(options) {
    var container = this.create('div', {
      attrs: { className: 'progress-bar-container' }
    });
    
    // Label
    if (options.label) {
      var label = this.create('div', {
        attrs: { className: 'progress-bar-label' },
        text: options.label
      });
      container.appendChild(label);
    }
    
    // Barra
    var barra = this.create('div', {
      attrs: { className: 'progress-bar' }
    });
    
    var fill = this.create('div', {
      attrs: {
        className: 'progress-bar-fill progress-bar-' + (options.status || 'normal'),
        style: 'width: ' + Math.min(options.percentual || 0, 100) + '%'
      }
    });
    barra.appendChild(fill);
    container.appendChild(barra);
    
    // Valores
    if (options.valores) {
      var valores = this.create('div', {
        attrs: { className: 'progress-bar-valores' },
        text: options.valores
      });
      container.appendChild(valores);
    }
    
    return container;
  }
};

// ============================================================
// PATCH PARA COMPATIBILIDADE
// Substitui innerHTML em elementos críticos
// ============================================================

const DOM_SAFE_PATCH = {
  patched: new Set(),
  
  /**
   * Aplica patches seguros em elementos críticos
   */
  apply: function() {
    this.patchAutocomplete();
    this.patchTransacaoList();
    console.log('[DOM_SAFE_PATCH] Patches aplicados');
  },
  
  /**
   * Patch para lista de autocomplete
   */
  patchAutocomplete: function() {
    // Substituir renderização de autocomplete em init-form.js
    if (typeof INIT_FORM !== 'undefined' && INIT_FORM._renderAutocompleteOriginal) return;
    
    // Guardar referência original
    if (typeof INIT_FORM !== 'undefined') {
      INIT_FORM._renderAutocompleteOriginal = INIT_FORM.renderAutocomplete;
      
      INIT_FORM.renderAutocomplete = function(sugestoes) {
        var list = document.getElementById('autocomplete-list');
        if (!list) return;
        
        // Limpar via DOM_SAFE
        var newList = DOM_SAFE.clear(list);
        
        if (!sugestoes || sugestoes.length === 0) {
          newList.style.display = 'none';
          return;
        }
        
        // Criar items seguros
        sugestesoes.slice(0, 5).forEach(function(s) {
          var item = DOM_SAFE.create('div', {
            attrs: {
              className: 'autocomplete-item',
              'data-value': s
            },
            text: s
          });
          
          item.addEventListener('click', function() {
            var input = document.getElementById('novo-descricao');
            if (input) input.value = s;
            newList.style.display = 'none';
          });
          
          newList.appendChild(item);
        });
        
        newList.style.display = 'block';
      };
    }
  },
  
  /**
   * Patch para lista de transações
   */
  patchTransacaoList: function() {
    // Será implementado quando render-extrato.js for criado
  }
};

// Auto-apply patches
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      DOM_SAFE_PATCH.apply();
    });
  } else {
    DOM_SAFE_PATCH.apply();
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DOM_SAFE: DOM_SAFE, DOM_SAFE_PATCH: DOM_SAFE_PATCH };
}
