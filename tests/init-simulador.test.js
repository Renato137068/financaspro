/**
 * init-simulador.test.js — UI da calculadora: lê o formulário, chama o
 * SIMULADOR real e desenha o resultado. Exercita os três modos no DOM (jsdom).
 * @jest-environment jsdom
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');

function carregar() {
  const simSrc = fs.readFileSync(path.join(root, 'js/simulador.js'), 'utf8');
  // Mesma conversão do harness load-sources: `const X =` no topo de um módulo
  // vm vira binding léxico e não encosta no global do contexto. `var` encosta.
  const initSrc = fs.readFileSync(path.join(root, 'js/modules/init-simulador.js'), 'utf8')
    .replace(/\bconst INIT_SIMULADOR =/, 'var INIT_SIMULADOR =');

  window.renderLucideIcons = function() {};

  metasCriadas = [];
  abasMudadas = [];

  const sandbox = {
    window: window,
    document: document,
    console: { log: function() {}, warn: function() {}, error: function() {} },
    Math: Math, Number: Number, JSON: JSON, Date: Date,
    parseFloat: parseFloat, parseInt: parseInt, isFinite: isFinite,
    Object: Object, Array: Array, String: String,
    UTILS: {
      parseMoeda: function(v) {
        if (typeof v === 'number') return v;
        var s = String(v).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
        var n = parseFloat(s);
        return isFinite(n) ? n : 0;
      },
      formatarMoeda: function(v) { return 'R$ ' + Number(v).toFixed(2); },
      escapeHtml: function(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); },
      mostrarToast: function() {},
      dataLocalIso: function() { return '2026-09-21'; },
      addMesesClamp: function(iso, m) {
        var p = String(iso).slice(0, 10).split('-');
        var d = new Date(Number(p[0]), Number(p[1]) - 1 + Number(m), Number(p[2]));
        var mm = String(d.getMonth() + 1).padStart(2, '0');
        var dd = String(d.getDate()).padStart(2, '0');
        return d.getFullYear() + '-' + mm + '-' + dd;
      },
    },
    METAS: {
      criar: function(dados) {
        if (metasQuota) { var err = new Error('Limite'); err.code = 'quota'; throw err; }
        metasCriadas.push(dados);
        return dados;
      },
    },
    BILLING: { onPaymentRequired: function(o) { billingChamado = o; } },
    mudarAba: function(aba, opts) { abasMudadas.push({ aba: aba, opts: opts }); },
  };
  vm.createContext(sandbox);
  vm.runInContext(simSrc, sandbox, { filename: path.join(root, 'js/simulador.js') });
  vm.runInContext(initSrc, sandbox, { filename: path.join(root, 'js/modules/init-simulador.js') });
  return sandbox.INIT_SIMULADOR;
}

var metasCriadas = [];
var abasMudadas = [];
var metasQuota = false;
var billingChamado = null;

function montarPanel() {
  document.body.innerHTML = '<div id="aba-config-simulador" class="aba ativo"><div id="simulador-panel"></div></div>';
}

function set(id, valor) {
  var el = document.getElementById(id);
  el.value = valor;
}

function clicar(sel) {
  var btn = document.querySelector(sel);
  btn.dispatchEvent(new window.Event('click', { bubbles: true }));
}

var INIT;
beforeAll(function() { INIT = carregar(); INIT.init(); });
beforeEach(function() {
  metasCriadas = [];
  abasMudadas = [];
  metasQuota = false;
  billingChamado = null;
  montarPanel();
  INIT._modo = 'parcelado';
  INIT.render();
});

describe('INIT_SIMULADOR — render', function() {
  test('render desenha as quatro abas e o form de parcelado por padrão', function() {
    var panel = document.getElementById('simulador-panel');
    expect(panel.querySelectorAll('.sim-tab').length).toBe(4);
    expect(document.getElementById('sim-p-vista')).toBeTruthy();
    expect(document.getElementById('sim-p-parcela')).toBeTruthy();
  });

  test('clicar numa aba troca o modo e o formulário', function() {
    clicar('[data-action="sim-modo"][data-modo="poupar"]');
    expect(INIT._modo).toBe('poupar');
    expect(document.getElementById('sim-j-meses')).toBeTruthy();
    expect(document.getElementById('sim-p-vista')).toBeFalsy();
  });
});

describe('INIT_SIMULADOR — comparar parcelado', function() {
  test('entrada incompleta mostra aviso', function() {
    set('sim-p-vista', '1000');
    clicar('[data-action="sim-calc-parcelado"]');
    expect(document.getElementById('sim-resultado').querySelector('.sim-aviso')).toBeTruthy();
  });

  test('com juros embutidos e sem rendimento: veredito à vista', function() {
    set('sim-p-vista', '1000');
    set('sim-p-num', '12');
    set('sim-p-parcela', '100');
    clicar('[data-action="sim-calc-parcelado"]');
    var out = document.getElementById('sim-resultado');
    expect(out.querySelector('.sim-veredito--vista')).toBeTruthy();
    expect(out.textContent).toMatch(/à vista/i);
    expect(out.textContent).toMatch(/ao mês/);
  });

  test('parcelado sem juros exibe "sem juros"', function() {
    set('sim-p-vista', '1000');
    set('sim-p-num', '10');
    set('sim-p-parcela', '100');
    clicar('[data-action="sim-calc-parcelado"]');
    expect(document.getElementById('sim-resultado').textContent).toMatch(/sem juros/i);
  });

  test('sem juros + rendimento informado: veredito parcelar', function() {
    set('sim-p-vista', '1200');
    set('sim-p-num', '12');
    set('sim-p-parcela', '100');
    set('sim-p-rende', '1');
    clicar('[data-action="sim-calc-parcelado"]');
    var out = document.getElementById('sim-resultado');
    expect(out.querySelector('.sim-veredito--parcelado')).toBeTruthy();
    expect(out.textContent).toMatch(/parcelar/i);
  });
});

describe('INIT_SIMULADOR — poupar', function() {
  test('juros compostos mostra montante e juros ganhos', function() {
    clicar('[data-action="sim-modo"][data-modo="poupar"]');
    set('sim-j-inicial', '1000');
    set('sim-j-aporte', '100');
    set('sim-j-taxa', '1');
    set('sim-j-meses', '12');
    clicar('[data-action="sim-calc-juros"]');
    var out = document.getElementById('sim-resultado');
    expect(out.textContent).toMatch(/Juros ganhos/i);
    expect(out.textContent).toMatch(/12 meses/);
  });

  test('sem valor nem aporte mostra aviso', function() {
    clicar('[data-action="sim-modo"][data-modo="poupar"]');
    set('sim-j-taxa', '1');
    set('sim-j-meses', '12');
    clicar('[data-action="sim-calc-juros"]');
    expect(document.getElementById('sim-resultado').querySelector('.sim-aviso')).toBeTruthy();
  });
});

describe('INIT_SIMULADOR — meta (quanto guardar)', function() {
  test('calcula o aporte mensal e mostra o resultado', function() {
    clicar('[data-action="sim-modo"][data-modo="meta"]');
    expect(INIT._modo).toBe('meta');
    set('sim-m-objetivo', '12000');
    set('sim-m-meses', '12');
    clicar('[data-action="sim-calc-meta"]');
    var out = document.getElementById('sim-resultado');
    expect(out.textContent).toMatch(/por mês/i);
    expect(out.textContent).toMatch(/Guardar por mês/i);
    // sem juros e sem inicial: 12000 / 12 = 1000
    expect(out.textContent).toMatch(/1000/);
  });

  test('inicial que já cobre a meta mostra "você já chega lá"', function() {
    clicar('[data-action="sim-modo"][data-modo="meta"]');
    set('sim-m-objetivo', '1000');
    set('sim-m-meses', '12');
    set('sim-m-inicial', '1000');
    set('sim-m-taxa', '2');
    clicar('[data-action="sim-calc-meta"]');
    expect(document.getElementById('sim-resultado').textContent).toMatch(/já chega lá/i);
  });

  test('meta ausente mostra aviso', function() {
    clicar('[data-action="sim-modo"][data-modo="meta"]');
    set('sim-m-meses', '12');
    clicar('[data-action="sim-calc-meta"]');
    expect(document.getElementById('sim-resultado').querySelector('.sim-aviso')).toBeTruthy();
  });

  test('resultado válido oferece o botão de criar meta', function() {
    clicar('[data-action="sim-modo"][data-modo="meta"]');
    set('sim-m-objetivo', '12000');
    set('sim-m-meses', '12');
    clicar('[data-action="sim-calc-meta"]');
    expect(document.querySelector('[data-action="sim-criar-meta"]')).toBeTruthy();
  });

  test('criar meta grava com objetivo/prazo/valorAtual e navega para as metas', function() {
    clicar('[data-action="sim-modo"][data-modo="meta"]');
    set('sim-m-objetivo', '12000');
    set('sim-m-meses', '12');
    set('sim-m-inicial', '2000');
    clicar('[data-action="sim-calc-meta"]');
    set('sim-m-nome', 'Viagem');
    clicar('[data-action="sim-criar-meta"]');

    expect(metasCriadas.length).toBe(1);
    var m = metasCriadas[0];
    expect(m.titulo).toBe('Viagem');
    expect(m.valorAlvo).toBe(12000);
    expect(m.valorAtual).toBe(2000);
    expect(m.icone).toBe('target');
    expect(m.prazo).toBe('2027-09-21'); // hoje (2026-09-21) + 12 meses
    expect(abasMudadas).toEqual([{ aba: 'orcamento', opts: { orcSub: 'metas' } }]);
  });

  test('sem nome usa um título padrão', function() {
    clicar('[data-action="sim-modo"][data-modo="meta"]');
    set('sim-m-objetivo', '1000');
    set('sim-m-meses', '10');
    clicar('[data-action="sim-calc-meta"]');
    clicar('[data-action="sim-criar-meta"]');
    expect(metasCriadas[0].titulo).toBe('Minha meta');
  });

  test('cota do plano gratuito aciona o paywall e não navega', function() {
    metasQuota = true;
    clicar('[data-action="sim-modo"][data-modo="meta"]');
    set('sim-m-objetivo', '1000');
    set('sim-m-meses', '10');
    clicar('[data-action="sim-calc-meta"]');
    clicar('[data-action="sim-criar-meta"]');
    expect(metasCriadas.length).toBe(0);
    expect(billingChamado).toBeTruthy();
    expect(abasMudadas.length).toBe(0);
  });
});

describe('INIT_SIMULADOR — financiamento', function() {
  test('Price mostra parcela, total pago e juros', function() {
    clicar('[data-action="sim-modo"][data-modo="financiamento"]');
    set('sim-f-valor', '10000');
    set('sim-f-entrada', '2000');
    set('sim-f-taxa', '1,5');
    set('sim-f-num', '12');
    clicar('[data-action="sim-calc-financiamento"]');
    var out = document.getElementById('sim-resultado');
    expect(out.textContent).toMatch(/Total de juros/i);
    expect(out.textContent).toMatch(/Valor financiado/i);
    expect(out.querySelector('.sim-veredito')).toBeTruthy();
  });

  test('Enter dentro de um campo dispara o cálculo do modo ativo', function() {
    clicar('[data-action="sim-modo"][data-modo="financiamento"]');
    set('sim-f-valor', '5000');
    set('sim-f-taxa', '1');
    set('sim-f-num', '10');
    var campo = document.getElementById('sim-f-valor');
    campo.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(document.getElementById('sim-resultado').textContent).toMatch(/Total pago/i);
  });
});
