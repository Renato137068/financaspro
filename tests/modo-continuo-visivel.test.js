/**
 * modo-continuo-visivel.test.js — o "Continuar lançando" fica à vista.
 *
 * Estava dentro de "Mais opções", e quem lança várias movimentações não o
 * encontrava. Esta garantia impede que ele volte a ser escondido.
 */
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

describe('Modo contínuo no formulário de lançamento', () => {
  test('o checkbox continua com o mesmo id que a lógica usa', () => {
    expect(html.match(/id="chk-continuo"/g)).toHaveLength(1);
  });

  test('não está dentro do painel recolhido de "Mais opções"', () => {
    const inicioExtras = html.indexOf('id="extras-panel"');
    const fimExtras = html.indexOf('<!-- BARRA DE PROGRESSO', inicioExtras);
    const posicao = html.indexOf('id="chk-continuo"');
    expect(inicioExtras).toBeGreaterThan(-1);
    expect(posicao > inicioExtras && posicao < fimExtras).toBe(false);
  });

  test('aparece logo antes do botão Registrar', () => {
    const posicao = html.indexOf('id="chk-continuo"');
    const registrar = html.indexOf('class="btn-primario btn-registrar"');
    expect(posicao).toBeGreaterThan(-1);
    expect(registrar).toBeGreaterThan(posicao);
    expect(registrar - posicao).toBeLessThan(900);
  });
});
