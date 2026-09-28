/**
 * fp-alert-persistencia.test.js — onOk do modal lê os campos ANTES de fechar
 *
 * O bug: addEventListener('click', fechar) + ok.onclick = salvar → fechar
 * rodava primeiro, apagava o DOM, e o save lia null.
 */
/**
 * @jest-environment jsdom
 */
const path = require('path');
const vm = require('vm');
const { rodarNoContexto } = require('./helpers/esm-como-script.cjs');

beforeAll(function() {
  var sandbox = {
    document: document,
    window: window,
    console: console,
    UTILS: {
      escapeHtml: function(s) { return String(s); },
      mostrarToast: function() {}
    },
    CONFIG: undefined,
    FocusTrap: undefined
  };
  sandbox.globalThis = sandbox;
  var ctx = vm.createContext(sandbox);
  // ES Module: UTILS e CONFIG do sandbox substituem os imports.
  global.INIT_MODALS = rodarNoContexto(ctx, path.join(__dirname, '..', 'js', 'modules', 'init-modals.js')).INIT_MODALS;
});

afterEach(function() {
  document.body.innerHTML = '';
});

describe('INIT_MODALS.fpAlert — onOk com formulário', function() {
  test('onOk consegue ler o valor digitado e persistir', function() {
    var salvo = null;
    global.INIT_MODALS.fpAlert(
      '<input id="meta-titulo" value="Viagem" />' +
      '<input id="meta-valor" value="6000" />',
      {
        trustedHtml: true,
        title: 'Nova meta',
        okLabel: 'Criar meta',
        onOk: function(ov) {
          salvo = {
            titulo: document.getElementById('meta-titulo').value,
            valor: document.getElementById('meta-valor').value
          };
          ov.remove();
          return false;
        }
      }
    );

    var btn = document.querySelector('.modal-btn');
    expect(btn.textContent).toBe('Criar meta');
    btn.click();

    expect(salvo).toEqual({ titulo: 'Viagem', valor: '6000' });
    expect(document.querySelector('.modal-overlay')).toBeNull();
  });

  test('onOk retornando false mantém o modal aberto (validação)', function() {
    global.INIT_MODALS.fpAlert('<p>x</p>', {
      trustedHtml: true,
      onOk: function() { return false; }
    });
    document.querySelector('.modal-btn').click();
    expect(document.querySelector('.modal-overlay')).not.toBeNull();
  });

  test('onclick legado substitui o close default e salva', function() {
    var salvo = false;
    global.INIT_MODALS.fpAlert(
      '<input id="x" value="ok" />',
      { trustedHtml: true, title: 't' }
    );
    var ov = document.querySelector('.modal-overlay');
    var btn = ov.querySelector('.modal-btn');
    btn.onclick = function() {
      expect(document.getElementById('x').value).toBe('ok');
      salvo = true;
      ov.remove();
    };
    btn.click();
    expect(salvo).toBe(true);
  });
});
