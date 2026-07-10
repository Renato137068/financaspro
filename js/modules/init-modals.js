/**
 * init-modals.js - Sistema de modais e diálogos
 * Extraído do init.js para modularização
 * Responsabilidades: fpAlert, fpConfirm, modais de configuração
 * @requires js/utilities/focus-trap.js
 */

// Load focus trap utility (already defined in focus-trap.js)
// FocusTrap is available globally, no need to redeclare

const INIT_MODALS = {
  /**
   * Inicializa sistema de modais
   */
  init: function() {
    // Nenhuma inicialização necessária no momento
    // Funções são chamadas sob demanda
  },

  /**
   * Exibe um modal de alerta simples
   * @param {string} htmlContent - Conteúdo HTML do modal
   */
  alert: function(htmlContent) {
    this.fpAlert(htmlContent);
  },

  /**
   * Exibe um modal de confirmação
   * @param {string} msg - Mensagem de confirmação
   * @param {Function} onOk - Callback para confirmação
   * @param {Function} onNo - Callback para cancelamento
   */
  confirm: function(msg, onOk, onNo) {
    this.fpConfirm(msg, onOk, onNo);
  },

  /**
   * Cria e exibe um modal de alerta
   * @param {string} htmlContent - Conteúdo HTML do modal
   */
  fpAlert: function(htmlContent, options) {
    options = options || {};
    var body = options.trustedHtml
      ? htmlContent
      : '<p>' + (typeof UTILS !== 'undefined' ? UTILS.escapeHtml(htmlContent) : htmlContent) + '</p>';
    var old = document.querySelector('.modal-overlay');
    if (old) old.remove();
    
    var ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.setAttribute('role','dialog');
    ov.setAttribute('aria-modal','true');
    ov.setAttribute('aria-labelledby','modal-title');
    var title = options.title || 'Aviso';
    var titleHtml = '<h3 id="modal-title" class="sr-only">' +
      (typeof UTILS !== 'undefined' ? UTILS.escapeHtml(title) : title) + '</h3>';
    ov.innerHTML = '<div class="modal-box">' + titleHtml + body +
      '<div class="modal-actions"><button class="modal-btn btn-principal" type="button">OK</button></div></div>';
    
    document.body.appendChild(ov);
    
    var btn = ov.querySelector('.modal-btn');
    btn.focus();
    
    // Initialize focus trap if available
    var focusTrap = null;
    if (FocusTrap) {
      focusTrap = new FocusTrap(ov);
      focusTrap.activate();
    }
    
    // Event listeners
    btn.addEventListener('click', function() { 
      if (focusTrap) focusTrap.deactivate();
      ov.remove(); 
    });
    ov.addEventListener('click', function(e) { 
      if (e.target === ov) { 
        if (focusTrap) focusTrap.deactivate();
        ov.remove(); 
      } 
    });
    
    // Keyboard support
    document.addEventListener('keydown', function h(e) {
      if (e.key === 'Escape') { 
        if (focusTrap) focusTrap.deactivate();
        ov.remove(); 
        document.removeEventListener('keydown', h); 
      }
    });
  },

  /**
   * Cria e exibe um modal de confirmação
   * @param {string} msg - Mensagem de confirmação
   * @param {Function} onOk - Callback para confirmação
   * @param {Function} onNo - Callback para cancelamento
   */
  /**
   * Detecta intenção destrutiva a partir da mensagem para escolher a cor
   * do botão de confirmação (vermelho = risco; verde = ação segura).
   */
  _isDestrutivo: function(msg) {
    return /\b(exclu|remov|apag|delet|descart|cancelar a|encerrar|limpar|zerar|resetar|redefinir)/i
      .test(msg || '');
  },

  fpConfirm: function(msg, onOk, onNo, options) {
    options = options || {};
    var old = document.querySelector('.modal-overlay');
    if (old) old.remove();

    var destrutivo = (typeof options.danger === 'boolean')
      ? options.danger
      : this._isDestrutivo(msg);
    var okClass = destrutivo ? 'btn-confirmar-danger' : 'btn-confirmar-primary';
    var okLabel = options.okLabel || 'Confirmar';

    var ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.setAttribute('role','dialog');
    ov.setAttribute('aria-modal','true');
    ov.setAttribute('aria-labelledby','confirm-title');
    ov.innerHTML = '<div class="modal-box"><p id="confirm-title">' + UTILS.escapeHtml(msg) + '</p>' +
      '<div class="modal-actions">' +
      '<button class="btn-cancelar" type="button" id="mc">Cancelar</button>' +
      '<button class="' + okClass + '" type="button" id="mo">' + UTILS.escapeHtml(okLabel) + '</button>' +
      '</div></div>';
    
    document.body.appendChild(ov);
    
    var bo = ov.querySelector('#mo');
    var bc = ov.querySelector('#mc');
    bo.focus();
    
    // Initialize focus trap if available
    var focusTrap = null;
    if (FocusTrap) {
      focusTrap = new FocusTrap(ov);
      focusTrap.activate();
    }
    
    // Event listeners
    bo.addEventListener('click', function() { 
      if (focusTrap) focusTrap.deactivate();
      ov.remove(); 
      if (onOk) onOk(); 
    });
    
    bc.addEventListener('click', function() { 
      if (focusTrap) focusTrap.deactivate();
      ov.remove(); 
      if (onNo) onNo(); 
    });
    
    ov.addEventListener('click', function(e) { 
      if (e.target === ov) { 
        if (focusTrap) focusTrap.deactivate();
        ov.remove(); 
        if (onNo) onNo(); 
      } 
    });
    
    // Keyboard support
    document.addEventListener('keydown', function h(e) {
      if (e.key === 'Escape') { 
        if (focusTrap) focusTrap.deactivate();
        ov.remove(); 
        if (onNo) onNo(); 
        document.removeEventListener('keydown', h); 
      }
    });
  },

  /**
   * Abre modal de feedback
   */
  abrirFeedback: function() {
    var html = '<h3>Enviar Feedback</h3>' +
      '<select id="feedback-tipo" style="width:100%;margin-bottom:12px;padding:8px;border:1px solid var(--border);border-radius:var(--radius-sm);">' +
      '<option value="bug">Reportar bug</option>' +
      '<option value="sugestao">Sugestão</option>' +
      '<option value="elogio">Elogio</option>' +
      '<option value="outro">Outro</option>' +
      '</select>' +
      '<textarea id="feedback-msg" placeholder="Descreva em detalhes..." style="width:100%;min-height:120px;margin-bottom:12px;padding:8px;border:1px solid var(--border);border-radius:var(--radius-sm);resize:vertical;"></textarea>' +
      '<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">' +
      '<i data-lucide="alert-triangle" aria-hidden="true"></i> Se for bug, inclua: o que fez, o que esperava, o que aconteceu.' +
      '</div>';
    
    this.fpAlert(html, { trustedHtml: true, title: 'Enviar feedback' });
    
    setTimeout(function() {
      var overlay = document.querySelector('.modal-overlay');
      if (!overlay) return;
      if (typeof renderLucideIcons === 'function') renderLucideIcons(overlay);
      
      var okBtn = overlay.querySelector('.modal-btn');
      if (okBtn) {
        okBtn.textContent = 'Enviar';
        okBtn.onclick = function() {
          var msg = document.getElementById('feedback-msg').value.trim();
          if (!msg) { 
            UTILS.mostrarToast('Escreva algo', 'error'); 
            return; 
          }
          
          // Mostrar estado de envio
          okBtn.textContent = 'Enviando...';
          okBtn.disabled = true;
          
          setTimeout(function() {
            var config = DADOS.getConfig();
            var feedbacks = config.feedbacks || [];
            var tipo = document.getElementById('feedback-tipo').value;
            feedbacks.push({
              tipo: tipo,
              msg: msg,
              data: new Date().toISOString()
            });
            DADOS.salvarConfig({ feedbacks: feedbacks });

            var ver = (typeof CONFIG !== 'undefined' && CONFIG.VERSION) ? CONFIG.VERSION : '11.0.0';
            var corpo = 'Tipo: ' + tipo + '\nVersão: ' + ver + '\n\n' + msg;
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(corpo).catch(function() { /* ignore */ });
            }

            okBtn.textContent = 'Salvo!';
            okBtn.style.background = '#10b981';
            okBtn.style.color = 'white';

            setTimeout(function() {
              overlay.remove();
              UTILS.mostrarToast('Feedback salvo. Você também pode enviar por e-mail.', 'success');
              var mail = 'mailto:?subject=' + encodeURIComponent('Feedback FinançasPro') +
                '&body=' + encodeURIComponent(corpo);
              try { window.open(mail, '_blank'); } catch (_e) { /* ignore */ }
            }, 800);
          }, 300);
        };
      }
    }, 100);
  },

  /**
   * Abre modal de changelog
   */
  abrirChangelog: function() {
    var html = '<h3>Novidades</h3>' +
      '<div style="max-height:350px;overflow-y:auto;padding-right:8px;">' +
      '<div style="margin-bottom:16px;"><strong>v11.0.0</strong><br>' +
      '<i data-lucide="calendar-clock" aria-hidden="true"></i> Contas a pagar e calendário<br>' +
      '<i data-lucide="shield" aria-hidden="true"></i> PIN de segurança<br>' +
      '<i data-lucide="bell" aria-hidden="true"></i> Lembrete diário com notificação<br>' +
      '<i data-lucide="bar-chart" aria-hidden="true"></i> Insights e previsão financeira<br>' +
      '<i data-lucide="target" aria-hidden="true"></i> Orçamento 50/30/20<br>' +
      '<i data-lucide="scan" aria-hidden="true"></i> OCR de comprovantes<br>' +
      '<i data-lucide="layers" aria-hidden="true"></i> Código modular (INIT_*)</div>' +
      '<div style="margin-bottom:16px;"><strong>v10.0.0</strong><br>' +
      '<i data-lucide="zap" aria-hidden="true"></i> Performance 3x mais rápido<br>' +
      '<i data-lucide="smartphone" aria-hidden="true"></i> UI redesenhada<br>' +
      '<i data-lucide="hard-drive" aria-hidden="true"></i> Backup automático</div>' +
      '<div style="margin-bottom:16px;"><strong>v9.0.0</strong><br>' +
      '<i data-lucide="bot" aria-hidden="true"></i> Auto-categorização IA<br>' +
      '<i data-lucide="trending-up" aria-hidden="true"></i> Relatórios avançados<br>' +
      '<i data-lucide="bell" aria-hidden="true"></i> Alertas inteligentes</div>' +
      '</div>' +
      '<div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border);font-size:12px;color:var(--text-muted);">' +
      'Roadmap: sync multi-device, API pública, widgets<br>' +
      'Envie feedback: Config → Enviar Feedback' +
      '</div>';
    
    this.fpAlert(html, { trustedHtml: true, title: 'Novidades' });
    
    setTimeout(function() {
      var overlay = document.querySelector('.modal-overlay');
      if (overlay && typeof renderLucideIcons === 'function') renderLucideIcons(overlay);
    }, 100);
  }
};

// Export para compatibilidade
if (typeof module !== 'undefined' && module.exports) {
  module.exports = INIT_MODALS;
}
