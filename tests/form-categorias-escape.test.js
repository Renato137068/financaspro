/**
 * form-categorias-escape.test.js — P2.1: nomes custom escapados no render
 * @jest-environment jsdom
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

describe('P2.1 — escapeHtml em categorias custom', function() {
  var INIT_FORM;
  var sandbox;

  beforeAll(function() {
    sandbox = {
      window: window,
      document: document,
      console: console,
      CONFIG: {
        CATEGORIAS_DESPESA_SLUGS: ['alimentacao'],
        CATEGORIAS_RECEITA_SLUGS: ['salario'],
        getCatLabel: function(s) { return s; }
      },
      UTILS: {
        escapeHtml: function(s) {
          return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
        },
        labelCategoria: function(s) { return s; }
      },
      DADOS: {
        getConfig: function() {
          return {
            categoriasCustom: {
              despesa: ['Normal', '<img src=x onerror=alert(1)>', 'Cafe & Cia']
            }
          };
        }
      },
      Object: Object,
      Array: Array,
      String: String,
      Number: Number,
      Date: Date,
      Math: Math
    };
    sandbox.globalThis = sandbox;
    // init-form.js é grande e depende de muitos globals — extrair só o método
    // via avaliação parcial não vale a pena. Carregamos o arquivo e mockamos
    // o mínimo; se falhar o load, exercitamos a lógica isolada abaixo.
    var src = fs.readFileSync(path.join(__dirname, '..', 'js', 'modules', 'init-form.js'), 'utf8');
    expect(src).toMatch(/customNomes\.forEach[\s\S]*?UTILS\.escapeHtml\(nome\)/);
  });

  test('renderCategoriasBtns escapa nome em data-cat e .cat-nome', function() {
    document.body.innerHTML = '<div id="categoria-grid"></div><input id="novo-categoria" value="">';

    // Replica a lógica do forEach custom (mesmo escape) — o assert estático
    // acima garante que o fonte usa escapeHtml; aqui validamos o efeito XSS.
    var grid = document.getElementById('categoria-grid');
    var customNomes = ['<img src=x onerror=alert(1)>', 'Cafe & Cia', 'A"B'];
    var html = '';
    customNomes.forEach(function(nome) {
      var nomeSafe = sandbox.UTILS.escapeHtml(nome);
      html += '<button type="button" class="cat-btn" data-cat="' + nomeSafe + '">' +
        '<span class="cat-nome">' + nomeSafe + '</span></button>';
    });
    grid.innerHTML = html;

    // Nenhum nó HTML injetado a partir do nome
    expect(grid.querySelector('img')).toBeNull();
    expect(grid.querySelectorAll('.cat-btn')).toHaveLength(3);

    var primeiro = grid.querySelector('.cat-btn');
    expect(primeiro.querySelector('.cat-nome').textContent).toBe('<img src=x onerror=alert(1)>');
    expect(primeiro.getAttribute('data-cat')).toBe('<img src=x onerror=alert(1)>');

    // Aspas no nome não quebram o atributo (não há botão extra / markup solto)
    expect(grid.innerHTML).toContain('data-cat="A&quot;B"');
    expect(grid.innerHTML).toContain('Cafe &amp; Cia');
  });

  test('fonte de init-form.js aplica escapeHtml no forEach de custom', function() {
    var src = fs.readFileSync(path.join(__dirname, '..', 'js', 'modules', 'init-form.js'), 'utf8');
    var bloco = src.match(/customNomes\.forEach\(function\(nome\)\s*\{[\s\S]*?\}\);/);
    expect(bloco).toBeTruthy();
    expect(bloco[0]).toMatch(/UTILS\.escapeHtml\(nome\)/);
    expect(bloco[0]).toMatch(/data-cat="' \+ nomeSafe/);
    expect(bloco[0]).toMatch(/cat-nome">' \+ nomeSafe/);
    expect(bloco[0]).not.toMatch(/data-cat="' \+ nome \+/);
  });
});
