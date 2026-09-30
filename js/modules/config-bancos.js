/**
 * config-bancos.js — bancos, cartões e categorias do Perfil.
 *
 * As sub-telas de gerenciamento: listar, adicionar, editar e remover bancos e
 * cartões (com limite e fechamento), e as categorias personalizadas por tipo.
 *
 * Saiu de init-config.js (1.746 linhas). Os métodos continuam sendo de
 * INIT_CONFIG: este mixin importa o INIT_CONFIG e se copia para ele com
 * Object.assign ao carregar (o import tem um sentido só, como no
 * FORM_SUGESTOES). Os métodos usam `this` como o INIT_CONFIG.
 *
 * ES Module (ADR 0005): chega sob demanda no chunk 'config'
 * (js/esm/chunks/config.js, via LAZY.load), que o importa.
 */

import { INIT_CONFIG } from './init-config.js';
import { UTILS } from '../core/utils.js';
import { CARTOES } from '../cartoes.js';
import { INIT_MODALS } from './init-modals.js';
import { BILLING } from '../billing.js';
import { DADOS } from '../core/dados.js';

const CONFIG_BANCOS = {
  /**
   * Abre aba de gerenciamento de bancos
   */
  abrirConfigBancos: function() {
    console.warn('[INIT_CONFIG] Abrindo gerenciamento de bancos');
    
    // Esconder todas as abas e mostrar aba gerenciar-bancos
    var abas = document.querySelectorAll('.aba');
    for (var i = 0; i < abas.length; i++) {
      abas[i].classList.remove('ativo');
      abas[i].setAttribute('aria-hidden', 'true');
    }
    
    var abaBancos = document.getElementById('aba-gerenciar-bancos');
    if (!abaBancos) {
      console.error('[INIT_CONFIG] Elemento aba-gerenciar-bancos não encontrado');
      return;
    }
    
    abaBancos.classList.add('ativo');
    abaBancos.removeAttribute('aria-hidden');
    
    // Renderizar listas
    INIT_CONFIG._renderizarListaBancos();
    INIT_CONFIG._renderizarListaCartoes();
  },

  /**
   * Renderiza lista de bancos cadastrados
   */
  _renderizarListaBancos: function() {
    var config = DADOS.getConfig();
    var bancos = config.bancos || [];
    var listaEl = document.getElementById('bancos-list');
    
    if (!listaEl) return;
    
    if (bancos.length === 0) {
      listaEl.innerHTML = '<div class="bancos-empty">' +
        '<div class="bancos-empty-icon" aria-hidden="true"><i data-lucide="landmark"></i></div>' +
        '<p>Nenhum banco cadastrado</p>' +
        '<p class="bancos-empty-hint">Adicione seu primeiro banco acima</p>' +
        '</div>';
      if (typeof renderLucideIcons === 'function') renderLucideIcons(listaEl);
      return;
    }
    
    var html = '';
    bancos.forEach(function(banco, index) {
      var iconLucide = 'landmark';
      if (banco.tipo === 'Conta Poupança') iconLucide = 'piggy-bank';
      if (banco.tipo === 'Dinheiro') iconLucide = 'wallet';
      
      html += '<div class="banco-item" data-index="' + index + '" data-tipo="banco">' +
        '<div class="banco-item-info">' +
          '<div class="banco-item-icon" aria-hidden="true"><i data-lucide="' + iconLucide + '"></i></div>' +
          '<div class="banco-item-details">' +
            '<div class="banco-item-nome">' + UTILS.escapeHtml(banco.nome) + '</div>' +
            '<div class="banco-item-tipo">' + UTILS.escapeHtml(banco.tipo) + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="banco-item-actions">' +
          '<button type="button" class="btn-remover-banco" data-index="' + index + '" data-tipo="banco" aria-label="Remover ' + UTILS.escapeHtml(banco.nome) + '">' +
          '<i data-lucide="trash-2" aria-hidden="true"></i> Remover' +
          '</button>' +
        '</div>' +
        '</div>';
    });
    
    listaEl.innerHTML = html;
    if (typeof renderLucideIcons === 'function') renderLucideIcons(listaEl);
  },

  /**
   * Renderiza lista de cartões cadastrados
   */
  _renderizarListaCartoes: function() {
    var config = DADOS.getConfig();
    var cartoes = config.cartoes || [];
    var listaEl = document.getElementById('cartoes-list');
    
    if (!listaEl) return;
    
    if (cartoes.length === 0) {
      listaEl.innerHTML = '<div class="bancos-empty">' +
        '<div class="bancos-empty-icon" aria-hidden="true"><i data-lucide="credit-card"></i></div>' +
        '<p>Nenhum cartão cadastrado</p>' +
        '<p class="bancos-empty-hint">Adicione seu primeiro cartão acima</p>' +
        '</div>';
      if (typeof renderLucideIcons === 'function') renderLucideIcons(listaEl);
      return;
    }
    
    var html = '';
    cartoes.forEach(function(cartao, index) {
      var info = (typeof CARTOES !== 'undefined' && CARTOES.obter)
        ? CARTOES.obter(cartao.nome) : null;
      var semCiclo = info && !info.temCiclo;
      var melhor = (info && info.temCiclo && CARTOES.melhorDiaCompra)
        ? CARTOES.melhorDiaCompra(cartao.nome) : null;
      html += '<div class="banco-item' + (semCiclo ? ' banco-item--aviso' : '') + '" data-index="' + index + '" data-tipo="cartao">' +
        '<div class="banco-item-info">' +
          '<div class="banco-item-icon" aria-hidden="true"><i data-lucide="credit-card"></i></div>' +
          '<div class="banco-item-details">' +
            '<div class="banco-item-nome">' + UTILS.escapeHtml(cartao.nome) +
              (semCiclo ? ' <span class="banco-item-badge-aviso">Sem ciclo</span>' : '') +
            '</div>' +
            '<div class="banco-item-tipo">' + UTILS.escapeHtml(cartao.bandeira) + (cartao.limite ? ' • Limite: R$ ' + parseFloat(cartao.limite).toLocaleString('pt-BR', {minimumFractionDigits:2}) : '') +
              (semCiclo ? ' · Informe fechamento e vencimento para calcular faturas' : '') +
            '</div>' +
            (melhor
              ? '<div class="banco-item-tipo cartao-melhor-dia"><i data-lucide="lightbulb" aria-hidden="true"></i> Melhor dia de compra: dia ' +
                  melhor.melhorDia + ' · ' + melhor.diasSemJuros + ' dias sem juros</div>'
              : '') +
          '</div>' +
        '</div>' +
        '<div class="banco-item-actions">' +
          '<button type="button" class="btn-editar-cartao" data-index="' + index + '" aria-label="Editar ' + UTILS.escapeHtml(cartao.nome) + '">' +
          '<i data-lucide="pencil" aria-hidden="true"></i> Editar' +
          '</button>' +
          '<button type="button" class="btn-remover-banco" data-index="' + index + '" data-tipo="cartao" aria-label="Remover ' + UTILS.escapeHtml(cartao.nome) + '">' +
          '<i data-lucide="trash-2" aria-hidden="true"></i> Remover' +
          '</button>' +
        '</div>' +
        '</div>';
    });
    
    listaEl.innerHTML = html;
    if (typeof renderLucideIcons === 'function') renderLucideIcons(listaEl);
  },

  /**
   * Adiciona banco
   */
  adicionarBanco: function(nome, tipo) {
    var validacao = INIT_CONFIG._validateBancoNome(nome);
    if (!validacao.valid) {
      UTILS.mostrarToast(validacao.message, 'error');
      return;
    }
    if (typeof BILLING !== 'undefined' && !BILLING.guardQuota('account', 1)) return;
    
    var config = DADOS.getConfig();
    var bancos = config.bancos || [];
    bancos.push({ nome: validacao.value, tipo: tipo });
    DADOS.salvarConfig({ bancos: bancos });
    
    // Limpar formulário
    document.getElementById('banco-nome').value = '';
    document.getElementById('banco-tipo').value = 'Conta Corrente';
    
    // Re-renderizar lista
    INIT_CONFIG._renderizarListaBancos();
    INIT_CONFIG._updateDynamicValues();
    UTILS.mostrarToast('Banco salvo', 'success');
  },

  /**
   * Remove banco
   */
  removerBanco: function(index) {
    INIT_MODALS.confirm('Deseja remover este banco?', function() {
      var config = DADOS.getConfig();
      var bancos = config.bancos || [];
      bancos.splice(index, 1);
      DADOS.salvarConfig({ bancos: bancos });
      INIT_CONFIG._renderizarListaBancos();
      INIT_CONFIG._updateDynamicValues();
      UTILS.mostrarToast('Banco removido', 'success');
    });
  },

  /**
   * Adiciona cartão
   */
  adicionarCartao: function(nome, bandeira, limite, fechamento, vencimento) {
    var validacao = INIT_CONFIG._validateBancoNome(nome);
    if (!validacao.valid) {
      UTILS.mostrarToast(validacao.message, 'error');
      return;
    }
    if (typeof BILLING !== 'undefined' && !BILLING.guardQuota('account', 1)) return;
    
    var config = DADOS.getConfig();
    var cartoes = config.cartoes || [];
    // fechamento e vencimento são o que dá CICLO ao cartão: sem eles o app
    // não sabe em qual fatura a compra cai, e CARTOES trata o cadastro como
    // "sem ciclo" em vez de inventar datas.
    var dia = function(v) {
      var n = parseInt(v, 10);
      return (isFinite(n) && n >= 1 && n <= 31) ? n : null;
    };

    cartoes.push({
      nome: validacao.value,
      bandeira: bandeira,
      limite: limite ? UTILS.parseMoeda(limite) : null,
      fechamento: dia(fechamento),
      vencimento: dia(vencimento)
    });
    DADOS.salvarConfig({ cartoes: cartoes });
    
    // Limpar formulário
    document.getElementById('cartao-nome').value = '';
    document.getElementById('cartao-bandeira').value = 'Visa';
    document.getElementById('cartao-limite').value = '';
    var fechEl = document.getElementById('cartao-fechamento');
    if (fechEl) fechEl.value = '';
    var vencEl = document.getElementById('cartao-vencimento');
    if (vencEl) vencEl.value = '';
    
    // Re-renderizar lista
    INIT_CONFIG._renderizarListaCartoes();
    INIT_CONFIG._updateDynamicValues();
    UTILS.mostrarToast('Cartão salvo', 'success');
  },

  /**
   * Remove cartão
   */
  removerCartao: function(index) {
    INIT_MODALS.confirm('Deseja remover este cartão?', function() {
      var config = DADOS.getConfig();
      var cartoes = config.cartoes || [];
      cartoes.splice(index, 1);
      DADOS.salvarConfig({ cartoes: cartoes });
      INIT_CONFIG._renderizarListaCartoes();
      INIT_CONFIG._updateDynamicValues();
      UTILS.mostrarToast('Cartão removido', 'success');
    });
  },

  /**
   * Edita um cartão (bandeira, limite, fechamento e vencimento).
   *
   * O NOME fica somente leitura de propósito: faturas pagas e transações são
   * indexadas pelo nome do cartão; renomear aqui as órfãs, silenciosamente.
   * Corrigir o limite ou os dias de ciclo — o caso real — não exige renomear.
   */
  editarCartao: function(index) {
    var config = DADOS.getConfig();
    var cartoes = (config.cartoes || []).slice();
    var cartao = cartoes[index];
    if (!cartao) return;

    var bandeiras = ['Visa', 'Mastercard', 'Elo', 'American Express', 'Hipercard', 'Outro'];
    var bandOpts = bandeiras.map(function(b) {
      return '<option value="' + b + '"' + (cartao.bandeira === b ? ' selected' : '') + '>' + b + '</option>';
    }).join('');
    var limiteVal = (cartao.limite != null && cartao.limite !== '') ? String(cartao.limite).replace('.', ',') : '';

    var html =
      '<div class="meta-form">' +
        '<label class="form-label" for="cartao-edit-nome">Nome</label>' +
        '<input type="text" id="cartao-edit-nome" class="form-input" value="' + UTILS.escapeHtml(cartao.nome || '') + '" disabled>' +
        '<p class="form-hint">O nome não muda aqui: faturas e lançamentos são ligados a ele.</p>' +
        '<label class="form-label" for="cartao-edit-bandeira">Bandeira</label>' +
        '<select id="cartao-edit-bandeira" class="form-input">' + bandOpts + '</select>' +
        '<label class="form-label" for="cartao-edit-limite">Limite (R$)</label>' +
        '<input type="text" id="cartao-edit-limite" class="form-input campo-moeda" inputmode="decimal" autocomplete="off" placeholder="0,00" value="' + UTILS.escapeHtml(limiteVal) + '">' +
        '<p class="campo-moeda-preview" id="cartao-edit-limite-preview" hidden></p>' +
        '<label class="form-label" for="cartao-edit-fech">Dia de fechamento</label>' +
        '<input type="number" id="cartao-edit-fech" class="form-input" min="1" max="31" value="' + (cartao.fechamento || '') + '">' +
        '<label class="form-label" for="cartao-edit-venc">Dia de vencimento</label>' +
        '<input type="number" id="cartao-edit-venc" class="form-input" min="1" max="31" value="' + (cartao.vencimento || '') + '">' +
      '</div>';

    INIT_MODALS.fpAlert(html, {
      trustedHtml: true,
      title: 'Editar cartão',
      okLabel: 'Salvar',
      onOk: function(ov) { INIT_CONFIG._salvarEdicaoCartao(ov, index); return false; }
    });
    setTimeout(function() {
      if (UTILS.bindCampoMoeda) {
        UTILS.bindCampoMoeda(document.getElementById('cartao-edit-limite'), { previewId: 'cartao-edit-limite-preview' });
      }
    }, 0);
  },

  _salvarEdicaoCartao: function(overlay, index) {
    var config = DADOS.getConfig();
    var cartoes = (config.cartoes || []).slice();
    if (!cartoes[index]) { overlay.remove(); return; }

    var dia = function(v) {
      var n = parseInt(v, 10);
      return (isFinite(n) && n >= 1 && n <= 31) ? n : null;
    };
    var limite = document.getElementById('cartao-edit-limite').value;

    cartoes[index] = Object.assign({}, cartoes[index], {
      bandeira: document.getElementById('cartao-edit-bandeira').value,
      limite: limite ? UTILS.parseMoeda(limite) : null,
      fechamento: dia(document.getElementById('cartao-edit-fech').value),
      vencimento: dia(document.getElementById('cartao-edit-venc').value)
    });
    DADOS.salvarConfig({ cartoes: cartoes });
    overlay.remove();
    INIT_CONFIG._renderizarListaCartoes();
    INIT_CONFIG._updateDynamicValues();
    UTILS.mostrarToast('Cartão atualizado', 'success');
  },

  /**
   * Abre gerenciador de categorias
   */
  abrirGerenciarCategorias: function(tipo) {
    var config = DADOS.getConfig();
    var customCats = config.categoriasCustom || {};
    var cats = customCats[tipo] || [];
    
    var html = '<h3><i data-lucide="tag" aria-hidden="true"></i> Gerenciar Categorias - ' + (tipo === 'receita' ? 'Receitas' : 'Despesas') + '</h3>' +
      '<div class="perfil-modal-toolbar">' +
      '<button type="button" id="add-cat-btn" class="perfil-modal-btn-primary"><i data-lucide="plus" aria-hidden="true"></i> Adicionar Categoria</button>' +
      '</div>' +
      '<div id="cats-list" class="perfil-modal-list">';
    
    cats.forEach(function(cat, index) {
      html += '<div class="cat-item perfil-modal-item" data-index="' + index + '">' +
        '<div class="perfil-modal-item-main">' +
          '<span class="perfil-modal-item-icon" aria-hidden="true"><i data-lucide="sparkles"></i></span>' +
          '<div>' +
            '<div class="perfil-modal-item-title">' + UTILS.escapeHtml(cat) + '</div>' +
          '</div>' +
        '</div>' +
        '<button type="button" class="btn-remover-cat perfil-modal-btn-danger" data-index="' + index + '">Remover</button>' +
      '</div>';
    });
    
    if (cats.length === 0) {
      html += '<div class="perfil-modal-empty">Nenhuma categoria personalizada</div>';
    }
    
    html += '</div>';
    
    INIT_MODALS.fpAlert(html, { trustedHtml: true, title: 'Gerenciar categorias' });
    
    setTimeout(function() {
      var overlay = document.querySelector('.modal-overlay');
      if (!overlay) return;
      if (typeof renderLucideIcons === 'function') renderLucideIcons(overlay);
      
      // Botão adicionar
      var addBtn = document.getElementById('add-cat-btn');
      if (addBtn) {
        addBtn.onclick = function() {
          INIT_CONFIG.adicionarCategoria(tipo);
        };
      }
      
      // Botões remover
      overlay.addEventListener('click', function(e) {
        var btn = e.target.closest('.btn-remover-cat');
        if (btn) {
          var index = parseInt(btn.dataset.index);
          INIT_CONFIG.removerCategoria(tipo, index);
        }
      });
      
      var okBtn = overlay.querySelector('.modal-btn');
      if (okBtn) {
        okBtn.textContent = 'Fechar';
      }
    }, 100);
  },

  /**
   * Adiciona categoria personalizada
   */
  adicionarCategoria: function(tipo) {
    var html = '<h3><i data-lucide="plus" aria-hidden="true"></i> Adicionar Categoria</h3>' +
      '<div class="perfil-modal-form">' +
      '<div>' +
      '<label class="perfil-modal-label" for="cat-nome">Nome da Categoria</label>' +
      '<input type="text" id="cat-nome" class="perfil-modal-input" placeholder="Ex: Streaming" maxlength="30">' +
      '</div>' +
      '</div>';
    
    INIT_MODALS.fpAlert(html, { trustedHtml: true, title: 'Adicionar categoria' });
    
    setTimeout(function() {
      var overlay = document.querySelector('.modal-overlay');
      if (!overlay) return;
      if (typeof renderLucideIcons === 'function') renderLucideIcons(overlay);
      
      var okBtn = overlay.querySelector('.modal-btn');
      if (okBtn) {
        okBtn.textContent = 'Adicionar';
        okBtn.onclick = function() {
          var nome = document.getElementById('cat-nome').value;
          
          var validacao = INIT_CONFIG._validateCategoriaNome(nome);
          if (!validacao.valid) {
            UTILS.mostrarToast(validacao.message, 'error');
            return;
          }
          
          var config = DADOS.getConfig();
          var customCats = config.categoriasCustom || {};
          if (!customCats[tipo]) customCats[tipo] = [];
          
          if (customCats[tipo].includes(validacao.value)) {
            UTILS.mostrarToast('Já existe uma categoria com esse nome', 'warning');
            return;
          }
          
          customCats[tipo].push(validacao.value);
          DADOS.salvarConfig({ categoriasCustom: customCats });
          
          overlay.remove();
          INIT_CONFIG.abrirGerenciarCategorias(tipo); // Reabrir para atualizar lista
          UTILS.mostrarToast('Categoria salva', 'success');
        };
      }
    }, 100);
  },

  /**
   * Remove categoria personalizada
   */
  removerCategoria: function(tipo, index) {
    INIT_MODALS.confirm('Remover esta categoria?', function() {
      var config = DADOS.getConfig();
      var customCats = config.categoriasCustom || {};
      if (customCats[tipo]) {
        customCats[tipo].splice(index, 1);
        DADOS.salvarConfig({ categoriasCustom: customCats });
      }
      
      // Reabrir modal para atualizar lista
      var overlay = document.querySelector('.modal-overlay');
      if (overlay) overlay.remove();
      INIT_CONFIG.abrirGerenciarCategorias(tipo);
      
      UTILS.mostrarToast('Categoria removida', 'success');
    });
  },
};

Object.assign(INIT_CONFIG, CONFIG_BANCOS);

export { CONFIG_BANCOS };
export default CONFIG_BANCOS;
