/**
 * categoria-visual.test.js — ícone e cor de categoria, fora do Extrato.
 */
const { carregarScript } = require('./helpers/carregar-script.cjs');

const CV = carregarScript('js/core/categoria-visual.js');

describe('CATEGORIA_VISUAL', () => {
  test('slug, label com acento e caixa diferente resolvem o mesmo ícone', () => {
    expect(CV.nomeIcone('alimentacao')).toBe('utensils');
    expect(CV.nomeIcone('Alimentação')).toBe('utensils');
    expect(CV.nomeIcone('TRANSPORTE')).toBe('car');
  });

  test('categoria desconhecida, vazia ou nula cai no padrão', () => {
    expect(CV.nomeIcone('categoria-inventada')).toBe('pin');
    expect(CV.nomeIcone('')).toBe('pin');
    expect(CV.nomeIcone(null)).toBe('pin');
    expect(CV.cor(undefined)).toBe('#98a39d');
    expect(CV.cor('categoria-inventada')).toBe('#98a39d');
  });

  test('cor por categoria', () => {
    expect(CV.cor('salario')).toBe('#2f9c6d');
    expect(CV.cor('Saúde')).toBe('#ec4899');
  });

  test('icone usa lucideIconHtml quando existe; senão, o <i data-lucide>', () => {
    delete global.lucideIconHtml;
    expect(CV.icone('pet')).toBe('<i data-lucide="paw" aria-hidden="true"></i>');
    global.lucideIconHtml = (n) => '<svg data-n="' + n + '"></svg>';
    try {
      expect(CV.icone('pet')).toBe('<svg data-n="paw"></svg>');
    } finally {
      delete global.lucideIconHtml;
    }
  });
});
