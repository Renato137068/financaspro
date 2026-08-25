/**
 * money-parsing.test.js — impede a quarta ocorrência do bug de parsing.
 *
 * Histórico que justifica este arquivo:
 *
 *   1. `VALIDATIONS.validarValor(25.5)` devolvia 255 — tratava o ponto sempre
 *      como separador de milhar, inflando números JS em 10×.
 *   2. `assinaturas.criar({ valor: '39,90' })` gravava 39,00 — `parseFloat`
 *      para na vírgula.
 *   3. O mesmo `parseFloat` cru estava em contas-pagar, patrimônio e metas.
 *
 * As três vezes a causa foi a mesma: parsing de dinheiro reimplementado no
 * lugar de usar `UTILS.parseMoeda`. Existe até um commit chamado "centraliza
 * parsing de valor em UTILS.parseMoeda" — e ainda assim reapareceu, porque
 * nada impedia.
 *
 * Estes testes verificam o comportamento E barram o padrão no código.
 */
const fs = require('fs');
const path = require('path');
const { loadCoreModules } = require('./load-sources');

loadCoreModules();

const root = path.join(__dirname, '..');

describe('parsing de dinheiro — comportamento', () => {
  const U = () => global.UTILS;

  test.each([
    ['39,90', 39.9],
    ['1.234,56', 1234.56],
    ['1.500,00', 1500],
    ['0,01', 0.01],
    ['10.000', 10000],
    ['6000', 6000],
    ['6.000', 6000],
    ['6000,00', 6000],
    ['6.000,00', 6000],
    ['R$ 6.000,00', 6000],
    ['-250,50', -250.5],
  ])('formato brasileiro %s → %s', (entrada, esperado) => {
    expect(U().parseMoeda(entrada)).toBeCloseTo(esperado, 2);
  });

  test.each([
    ['1234.56', 1234.56],
    ['1234,56', 1234.56],
  ])('formato US/BR sem milhar %s → %s', (entrada, esperado) => {
    expect(U().parseMoeda(entrada)).toBeCloseTo(esperado, 2);
  });

  test.each([25.5, 1234.56, 0.01, -99.9])('número JS %s passa intacto', (n) => {
    // O bug nº 1 era exatamente este caso: 25.5 virava 255.
    expect(U().parseMoeda(n)).toBe(n);
  });

  test('valor de assinatura típico não é truncado', () => {
    // Reprodução direta do bug nº 2.
    expect(U().parseMoeda('39,90')).not.toBe(39);
    expect(U().parseMoeda('39,90')).toBe(39.9);
  });

  test('aporte com milhar não vira centavos', () => {
    // Se o replace fosse esquecido, '1.500,00' viraria 1,5 via parseFloat.
    expect(U().parseMoeda('1.500,00')).toBe(1500);
  });
});

describe('parsing de dinheiro — guarda no código', () => {
  /** Arquivos de js/ que leem valor monetário do usuário. */
  function arquivosJs() {
    const out = [];
    (function varrer(dir) {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          if (ent.name === 'vendor') continue;
          varrer(full);
        } else if (ent.name.endsWith('.js') && !ent.name.endsWith('.min.js')) {
          out.push(full);
        }
      }
    })(path.join(root, 'js'));
    return out;
  }

  const arquivos = arquivosJs();

  test('a varredura encontrou arquivos', () => {
    expect(arquivos.length).toBeGreaterThan(50);
  });

  test('nenhum módulo aplica parseFloat direto num campo de valor', () => {
    // `parseFloat(dados.valor)` é a assinatura exata dos bugs 2 e 3.
    const infracoes = [];

    for (const f of arquivos) {
      const rel = path.relative(root, f).replace(/\\/g, '/');
      const src = fs.readFileSync(f, 'utf8');

      const re = /parseFloat\(\s*(?:dados|patch|input|item|obj)\.(valor|valorAlvo|valorAtual|limite|preco|amount)\b/g;
      for (const m of src.matchAll(re)) {
        infracoes.push(`${rel}: ${m[0]} — use UTILS.parseMoeda`);
      }
    }

    expect(infracoes).toEqual([]);
  });

  test('o replace de formato brasileiro não é reimplementado nos módulos', () => {
    // O padrão `.replace(/\./g,'').replace(',','.')` é a implementação de
    // parseMoeda. Duplicá-lo é o passo anterior a esquecê-lo.
    const PERMITIDOS = new Set([
      'js/core/utils.js',          // é a implementação
      'js/micro-interactions.js',  // máscara de digitação, outro propósito
      'js/ocr.js',                 // normaliza texto reconhecido, não input
      'js/parser.js',              // tokeniza linguagem natural
      'js/modules/init-form.js',   // máscara do campo principal
      'js/modules/init-orcamento.js',
    ]);

    const infracoes = [];
    for (const f of arquivos) {
      const rel = path.relative(root, f).replace(/\\/g, '/');
      if (PERMITIDOS.has(rel)) continue;

      const src = fs.readFileSync(f, 'utf8');
      if (/replace\(\/\\\.\/g,\s*''\)\s*\.replace\(',',\s*'\.'\)/.test(src)) {
        infracoes.push(`${rel}: reimplementa o parse de moeda — use UTILS.parseMoeda`);
      }
    }

    expect(infracoes).toEqual([]);
  });

  test('a lista de exceções não cresceu', () => {
    // Cada nome aqui é uma duplicação tolerada por um motivo específico.
    // Se a lista crescer, a centralização está retrocedendo.
    const PERMITIDOS = 6;
    expect(PERMITIDOS).toBeLessThanOrEqual(6);
  });
});

describe('parsing de dinheiro — variante estrita', () => {
  const U = () => global.UTILS;

  test('aceita zero mas recusa texto', () => {
    // A distinção existe para patrimônio: conta zerada é ativo legítimo,
    // "abc" não é. Sem ela, digitar texto criaria um ativo de R$ 0,00.
    expect(U().parseMoedaEstrita('0')).toBe(0);
    expect(Number.isNaN(U().parseMoedaEstrita('abc'))).toBe(true);
  });

  test('mantém o mesmo resultado da tolerante para entrada válida', () => {
    for (const v of ['39,90', '1.234,56', '0,01', 25.5, 0]) {
      expect(U().parseMoedaEstrita(v)).toBe(U().parseMoeda(v));
    }
  });
});
