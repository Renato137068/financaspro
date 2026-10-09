/**
 * lucide-init-pendentes.test.js — os ícones só são desenhados uma vez.
 *
 * O createIcons do lucide troca todo [data-lucide] da raiz, inclusive os que
 * já viraram <svg>. Como o app chama renderLucideIcons a cada tela, cada
 * chamada refazia todos os ícones da página (no boot, 384 SVGs para 84
 * ícones). O lucide-init passa só os pendentes: <i> ainda não convertidos e
 * <svg> cujo data-lucide mudou depois de desenhados.
 *
 * Usa a biblioteca real (js/vendor/lucide.min.js, a mesma do fallback).
 */
const fs = require('fs');
const path = require('path');
const { carregarScript } = require('./helpers/carregar-script.cjs');

const ROOT = path.join(__dirname, '..');

function carregarLucide() {
  const src = fs.readFileSync(path.join(ROOT, 'js/vendor/lucide.min.js'), 'utf8');
  // UMD: com `exports` e `module` à vista, ele preenche o objeto de exports.
  const mod = { exports: {} };
  new Function('exports', 'module', src)(mod.exports, mod);
  window.lucide = mod.exports;
}

describe('lucide-init — só desenha ícones pendentes', function() {
  beforeAll(function() {
    delete window.lucide;
    carregarLucide();
    expect(typeof window.lucide.createIcons).toBe('function');
    carregarScript('js/lucide-init.js');
  });

  beforeEach(function() {
    document.head.innerHTML = '';
    document.body.innerHTML =
      '<button id="b1"><i data-lucide="eye"></i></button>' +
      '<span id="b2"><i data-lucide="arrow-up" class="extra"></i></span>' +
      '<p id="b3"><i data-lucide="check" aria-label="Feito"></i></p>';
  });

  test('converte os <i> e não recria os <svg> nas chamadas seguintes', function() {
    window.renderLucideIconsNow();
    var svgs = Array.from(document.querySelectorAll('svg[data-lucide]'));
    expect(svgs).toHaveLength(3);
    expect(document.querySelector('i[data-lucide]')).toBeNull();

    window.renderLucideIconsNow();
    window.renderLucideIconsNow();
    var depois = Array.from(document.querySelectorAll('svg[data-lucide]'));
    depois.forEach(function(svg, i) { expect(svg).toBe(svgs[i]); });
  });

  test('mantém classe, aria e não deixa a marca de pendente para trás', function() {
    window.renderLucideIconsNow();
    var seta = document.querySelector('#b2 svg');
    expect(seta.getAttribute('data-lucide')).toBe('arrow-up');
    expect(seta.classList.contains('lucide-arrow-up')).toBe(true);
    expect(seta.classList.contains('extra')).toBe(true);
    expect(seta.getAttribute('aria-hidden')).toBe('true');
    expect(document.querySelector('#b3 svg').getAttribute('aria-label')).toBe('Feito');
    expect(document.querySelector('[data-icone-pendente]')).toBeNull();
  });

  test('ícone novo na página é desenhado sem refazer os antigos', function() {
    window.renderLucideIconsNow();
    var antigo = document.querySelector('#b1 svg');
    document.body.insertAdjacentHTML('beforeend', '<div id="b4"><i data-lucide="plus"></i></div>');
    window.renderLucideIconsNow();
    expect(document.querySelector('#b1 svg')).toBe(antigo);
    expect(document.querySelector('#b4 svg').getAttribute('data-lucide')).toBe('plus');
  });

  test('trocar o data-lucide de um <svg> desenhado redesenha só ele', function() {
    window.renderLucideIconsNow();
    var olho = document.querySelector('#b1 svg');
    var seta = document.querySelector('#b2 svg');
    // Como fazem a seta da ordenação do Extrato e o olho da senha.
    seta.setAttribute('data-lucide', 'arrow-down');
    window.renderLucideIconsNow();

    var nova = document.querySelector('#b2 svg');
    expect(nova).not.toBe(seta);
    expect(nova.getAttribute('data-lucide')).toBe('arrow-down');
    expect(nova.classList.contains('lucide-arrow-down')).toBe(true);
    expect(document.querySelector('#b1 svg')).toBe(olho);

    // E volta: o nome desenhado acompanha a última troca.
    nova.setAttribute('data-lucide', 'arrow-up');
    window.renderLucideIconsNow();
    expect(document.querySelector('#b2 svg').getAttribute('data-lucide')).toBe('arrow-up');
    expect(document.querySelector('#b2 svg')).not.toBe(nova);
  });

  test('ícone desconhecido fica como <i> e pede a biblioteca completa', function() {
    var aviso = jest.spyOn(console, 'warn').mockImplementation(function() {});
    document.body.insertAdjacentHTML('beforeend', '<i id="x" data-lucide="nao-existe-mesmo"></i>');
    window.renderLucideIconsNow();
    aviso.mockRestore();
    var x = document.getElementById('x');
    expect(x.nodeName).toBe('I');
    expect(x.hasAttribute('data-icone-pendente')).toBe(false);
    expect(document.getElementById('lucide-full-lib')).not.toBeNull();
  });
});
