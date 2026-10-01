/**
 * ui-app.cjs — gestos de usuário sobre o app do app-jsdom.
 *
 * As telas sob demanda chegam com o chunk (LAZY.load); os testes delas
 * navegam como o usuário, clicam e preenchem os modais do INIT_MODALS. Estes
 * atalhos evitam repetir o boilerplate de eventos em cada suíte.
 */

function gestos(app) {
  const w = app.window;
  const d = app.document;

  function clicar(alvo) {
    const el = typeof alvo === 'string' ? d.querySelector(alvo) : alvo;
    if (!el) throw new Error('nada para clicar: ' + alvo);
    el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
    return el;
  }

  function preencher(id, valor) {
    const el = d.getElementById(id);
    if (!el) throw new Error('campo não existe: #' + id);
    el.value = valor;
    el.dispatchEvent(new w.Event('input', { bubbles: true }));
    el.dispatchEvent(new w.Event('change', { bubbles: true }));
    return el;
  }

  const modal = () => d.querySelector('.modal-overlay');
  /** Botão principal de um fpAlert (Salvar, Registrar, Ativar...). */
  const okModal = () => clicar('.modal-overlay .modal-btn');
  /** Botão de confirmar de um fpConfirm. */
  const confirmar = () => clicar('.modal-overlay #mo');
  const cancelar = () => clicar('.modal-overlay #mc');

  /** Último toast mostrado (texto), ou ''. */
  function toast() {
    const t = [...d.querySelectorAll('.toast, [role="status"].toast, .fp-toast')].pop();
    return t ? t.textContent.trim() : '';
  }

  return { w, d, clicar, preencher, modal, okModal, confirmar, cancelar, toast };
}

/** Promise que resolve na próxima volta do laço (efeitos de setTimeout 0). */
const tique = (ms) => new Promise((r) => setTimeout(r, ms || 0));

module.exports = { gestos, tique };
