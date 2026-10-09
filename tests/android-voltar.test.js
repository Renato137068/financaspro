/**
 * android-voltar.test.js — o botão voltar do Android não fecha o app à toa.
 *
 * Origem: auditoria de conformidade com o Android (2026-10-09). Sem o plugin
 * @capacitor/app, o evento 'backbutton' nunca disparava e o voltar fechava o
 * app de qualquer lugar, com formulário ou janela aberta.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'js', 'capacitor-init.js'), 'utf8');

function montar(html) {
  document.body.innerHTML = html;
  const chamadas = { minimizar: 0, abas: [] };
  window.Capacitor = {
    isNativePlatform: () => true,
    Plugins: { App: { minimizeApp: () => { chamadas.minimizar++; return Promise.resolve(); } } },
  };
  window.mudarAba = (aba) => {
    chamadas.abas.push(aba);
    document.querySelectorAll('.aba').forEach((el) => el.classList.toggle('ativo', el.id === 'aba-' + aba));
  };
  window.__fpHandleAndroidBack = undefined;
  // eslint-disable-next-line no-new-func
  new Function(src)();
  return chamadas;
}

function voltar() {
  const ev = new Event('backbutton', { cancelable: true });
  document.dispatchEvent(ev);
  return ev;
}

afterEach(() => {
  delete window.Capacitor;
  delete window.mudarAba;
  delete window.__fpVoltarAndroid;
});

describe('voltar do Android', () => {
  test('o plugin App está instalado no projeto Android', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(pkg.dependencies['@capacitor/app']).toBeTruthy();
    const settings = fs.readFileSync(path.join(root, 'android', 'capacitor.settings.gradle'), 'utf8');
    expect(settings).toMatch(/':capacitor-app'/);
    const build = fs.readFileSync(path.join(root, 'android', 'app', 'capacitor.build.gradle'), 'utf8');
    expect(build).toMatch(/project\(':capacitor-app'\)/);
  });

  test('com janela aberta, fecha a janela (Esc) e não sai do app', () => {
    const c = montar('<div id="aba-resumo" class="aba ativo"></div><div class="modal-overlay">x</div>');
    let esc = 0;
    document.addEventListener('keydown', function h(e) { if (e.key === 'Escape') esc++; });
    const ev = voltar();
    expect(ev.defaultPrevented).toBe(true);
    expect(esc).toBe(1);
    expect(c.minimizar).toBe(0);
  });

  test('sub-tela do Perfil volta um nível', () => {
    const c = montar('<div id="aba-resumo" class="aba"></div><div id="aba-config-dados" class="aba ativo"></div>');
    window.__fpHandleAndroidBack = () => true;
    expect(window.__fpVoltarAndroid()).toBe('subtela');
    expect(c.minimizar).toBe(0);
  });

  test('outra aba volta ao Resumo; no Resumo, minimiza', () => {
    const c = montar('<div id="aba-resumo" class="aba"></div><div id="aba-extrato" class="aba ativo"></div>');
    voltar();
    expect(c.abas).toEqual(['resumo']);
    expect(c.minimizar).toBe(0);
    voltar();
    expect(c.minimizar).toBe(1);
  });

  test('na tela de entrar (não fecha), voltar minimiza', () => {
    const c = montar('<div id="aba-resumo" class="aba ativo"></div>'
      + '<div id="auth-overlay" class="auth-overlay" style="display:flex" role="dialog" aria-modal="true"></div>');
    voltar();
    expect(c.minimizar).toBe(1);
  });

  test('tela de entrar escondida não conta como janela aberta', () => {
    const c = montar('<div id="aba-extrato" class="aba ativo"></div><div id="aba-resumo" class="aba"></div>'
      + '<div id="auth-overlay" class="auth-overlay" style="display:none" role="dialog" aria-modal="true"></div>');
    voltar();
    expect(c.abas).toEqual(['resumo']);
  });

  test('fora do app nativo não faz nada', () => {
    document.body.innerHTML = '';
    window.Capacitor = { isNativePlatform: () => false };
    // eslint-disable-next-line no-new-func
    new Function(src)();
    expect(window.__fpVoltarAndroid).toBeUndefined();
  });
});
