/**
 * form-alterar-categoria.test.js — P1.2: caminho visível para trocar categoria
 * @jest-environment node
 */
const fs = require('fs');
const path = require('path');

const formSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'modules', 'init-form.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'features', 'form-novo.css'), 'utf8');

describe('P1.2 — Alterar categoria visível em qualquer confiança', function() {
  test('renderDeteccaoInteligente sempre inclui o botão Alterar categoria', function() {
    expect(formSrc).toMatch(/id="ia-alterar-categoria"/);
    expect(formSrc).toMatch(/Alterar categoria/);
    expect(formSrc).toMatch(/mostrarGridCategoria/);
    // Não esvazia actions em alta/média — o botão fica em todos os níveis
    const bloco = formSrc.match(/if \(actions\) \{[\s\S]*?if \(typeof renderLucideIcons/);
    expect(bloco).toBeTruthy();
    expect(bloco[0]).toMatch(/ia-alterar-categoria/);
    expect(bloco[0]).not.toMatch(/actions\.innerHTML = '';/);
  });

  test('escolha manual marca _manualSet e registra correção no APRENDIZADO', function() {
    const gridSetup = formSrc.match(/setupCategoriaGrid:\s*function[\s\S]*?esconderGridCategoria:\s*function/);
    expect(gridSetup).toBeTruthy();
    expect(gridSetup[0]).toMatch(/_manualSet\s*=\s*true/);
    expect(gridSetup[0]).toMatch(/APRENDIZADO\.registrarCorrecao/);
  });

  test('estilo do botão Alterar categoria existe', function() {
    expect(css).toMatch(/\.ia-alterar-cat-btn/);
  });
});
