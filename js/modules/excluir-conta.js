/**
 * excluir-conta.js — excluir a conta na nuvem, a partir do Perfil.
 *
 * Saiu de init-navigation.js, que vai no primeiro acesso: o fluxo é raro e
 * cabe no chunk 'config', o mesmo do botão. INIT_NAVIGATION.excluirConta
 * carrega o chunk e chama EXCLUIR_CONTA.iniciar().
 *
 * ES Module (ADR 0005): chega sob demanda no chunk 'config'
 * (js/esm/chunks/config.js, via LAZY.load), que o publica em window.
 */

import { UTILS } from '../core/utils.js';
import { DADOS } from '../core/dados.js';
import { INIT_MODALS } from './init-modals.js';
import { BILLING } from '../billing.js';
import { authLimparAoSair } from '../authController.js';
import { INIT_CONFIG } from './init-config.js';

const EXCLUIR_CONTA = {
  /**
   * Exclui a conta na nuvem — LGPD art. 18, VI e exigencia do Google Play.
   *
   * A API ja fazia o trabalho pesado (anonimiza o log de auditoria na mesma
   * transacao em que apaga o usuario). Faltava o caminho dentro do app: sem ele
   * o unico jeito era pedir por e-mail, e o Play recusa apps com criacao de
   * conta que nao oferecem exclusao in-app.
   *
   * Dupla confirmacao de proposito: e destrutivo, definitivo e nao tem desfazer.
   * Os dados locais ficam — apagar tudo de uma vez surpreenderia quem so queria
   * sair da nuvem e continuar usando offline. Quem quiser os dois usa tambem
   * "Apagar todos os dados".
   */
  iniciar: function() {
    if (typeof DADOS === 'undefined' || !DADOS._nuvemAtiva || !DADOS._nuvemAtiva()) {
      if (typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
        UTILS.mostrarToast('Faça login na nuvem para excluir a conta.', 'warning');
      }
      return;
    }

    var sessao = DADOS.getSessao ? DADOS.getSessao() : null;
    if (!sessao || !sessao.user) {
      if (typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
        UTILS.mostrarToast('Faça login na nuvem para excluir a conta.', 'warning');
      }
      return;
    }

    var confirmar = (typeof INIT_MODALS !== 'undefined' && INIT_MODALS.confirm)
      ? INIT_MODALS.confirm.bind(INIT_MODALS)
      : function(msg, ok) { if (window.confirm(msg)) ok(); };

    confirmar(
      EXCLUIR_CONTA._avisoAssinatura()
      + 'Excluir sua conta apaga da nuvem seus lançamentos, contas, orçamentos e o cadastro. '
      + 'Não há como desfazer. Os dados salvos neste aparelho continuam aqui.',
      function() {
        confirmar('Confirma a exclusão definitiva da conta?', function() {
          var email = sessao.user.email;
          EXCLUIR_CONTA.pedirSenha('Digite sua senha para confirmar a exclusão da conta:', function(senha) {
            var promessa = (typeof SUPA_AUTH !== 'undefined' && SUPA_AUTH.reauthWithPassword && SUPA_AUTH.deleteAccount)
              ? SUPA_AUTH.reauthWithPassword(email, senha).then(function() {
                return SUPA_AUTH.deleteAccount();
              })
              : Promise.reject(new Error('Supabase indisponível'));

            promessa
              .then(function() {
                if (typeof authLimparAoSair === 'function') {
                  authLimparAoSair();
                } else {
                  DADOS.encerrarSessao();
                }
                if (typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
                  UTILS.mostrarToast('Conta excluída', 'info');
                }
                if (typeof INIT_CONFIG !== 'undefined' && INIT_CONFIG.refreshPerfil) {
                  INIT_CONFIG.refreshPerfil();
                }
              })
              .catch(function() {
                if (typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
                  UTILS.mostrarToast('Não foi possível excluir agora. Tente de novo.', 'error');
                }
              });
          });
        });
      },
    );
  },

  /**
   * Excluir a conta apaga a assinatura no nosso banco, mas não na loja: quem
   * tem o Pro pago continuaria sendo cobrado pelo Google (ou pelo Stripe) sem
   * ter mais conta. Volta o aviso que abre a confirmação, ou '' quando não há
   * cobrança a interromper (Free, Pro de boas-vindas, já cancelada).
   */
  _avisoAssinatura: function() {
    if (typeof BILLING === 'undefined' || !BILLING._cache) return '';
    var sub = BILLING._cache.subscription;
    if (!sub || sub.cancelAtPeriodEnd) return '';
    if (BILLING.isWelcomeTrial && BILLING.isWelcomeTrial(sub)) return '';
    if (!BILLING._activeStatus || !BILLING._activeStatus(sub.status, sub)) return '';
    if (BILLING.isPlayManaged && BILLING.isPlayManaged(sub)) {
      return 'Você tem o Pro ativo pela Google Play. Excluir a conta não cancela a cobrança: '
        + 'cancele antes na Play Store, em Pagamentos e assinaturas. ';
    }
    return 'Você tem o Pro ativo. Excluir a conta não cancela a cobrança: '
      + 'cancele antes em Perfil, Plano e assinatura. ';
  },

  /**
   * Pede a senha num campo de senha de verdade. O window.prompt que se usava
   * antes mostra o que se digita às claras, na tela e em gravações dela.
   * onOk recebe a senha; cancelar ou mandar vazio não chama nada.
   */
  pedirSenha: function(msg, onOk) {
    var old = document.querySelector('.modal-overlay');
    if (old) old.remove();

    var ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-labelledby', 'senha-title');
    ov.innerHTML = '<form class="modal-box" id="form-pedir-senha" novalidate>' +
      '<label id="senha-title" for="input-pedir-senha">' + UTILS.escapeHtml(msg) + '</label>' +
      '<input type="password" id="input-pedir-senha" class="form-input" autocomplete="current-password" required>' +
      '<div class="modal-actions">' +
      '<button class="btn-cancelar" type="button" id="ms-cancelar">Cancelar</button>' +
      '<button class="btn-confirmar-danger" type="submit" id="ms-ok">Confirmar</button>' +
      '</div></form>';
    document.body.appendChild(ov);

    var form = ov.querySelector('#form-pedir-senha');
    var input = ov.querySelector('#input-pedir-senha');
    var focusTrap = null;
    if (typeof FocusTrap !== 'undefined' && FocusTrap) {
      focusTrap = new FocusTrap(ov);
      focusTrap.activate(input);
    } else {
      input.focus();
    }

    function fechar() {
      if (focusTrap) focusTrap.deactivate();
      document.removeEventListener('keydown', aoTeclar);
      ov.remove();
    }
    function aoTeclar(e) { if (e.key === 'Escape') fechar(); }

    form.addEventListener('submit', function(e) {
      e.preventDefault();
      var senha = input.value;
      if (!senha) { input.focus(); return; }
      fechar();
      onOk(senha);
    });
    ov.querySelector('#ms-cancelar').addEventListener('click', fechar);
    ov.addEventListener('click', function(e) { if (e.target === ov) fechar(); });
    document.addEventListener('keydown', aoTeclar);
  },
};

export { EXCLUIR_CONTA };
export default EXCLUIR_CONTA;
