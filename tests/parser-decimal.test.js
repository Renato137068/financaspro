/**
 * parser-decimal.test.js — trava o bug do separador decimal brasileiro.
 *
 * `texto.toLowerCase().split(/[\s,]+/)` tratava a vírgula como separador de
 * tokens. "Uber 32,90" virava ['uber','32','90']; os dois números casavam com
 * /^\d+$/ e o ÚLTIMO sobrescrevia o valor. Resultado: R$ 90,00.
 *
 * Não é um arredondamento infeliz — é o valor errado, gravado em silêncio, na
 * funcionalidade que o produto vende como principal. "Mercado 149,90" virava
 * R$ 90,00 e "ifood 45,00" virava R$ 0,00.
 *
 * Os casos abaixo são os do relatório de auditoria, mais os formatos que um
 * usuário brasileiro digita de verdade (milhar com ponto, "R$" colado, valores
 * sem centavos).
 */
const { loadCoreModules } = require('./load-sources');

beforeAll(() => { loadCoreModules(); });

describe('PARSER.extrair — valor monetário', () => {
  test('os casos exatos que a auditoria reproduziu', () => {
    expect(PARSER.extrair('Uber 32,90').valor).toBe(32.9);
    expect(PARSER.extrair('Mercado 149,90').valor).toBe(149.9);
    expect(PARSER.extrair('Cafe 7,50').valor).toBe(7.5);
    expect(PARSER.extrair('padaria 8,75').valor).toBe(8.75);
  });

  test('vírgula e ponto decimal são equivalentes', () => {
    expect(PARSER.extrair('Uber 32,90').valor).toBe(PARSER.extrair('Uber 32.90').valor);
  });

  test('separador de milhar não vira dois valores', () => {
    expect(PARSER.extrair('aluguel 1.250,00').valor).toBe(1250);
    expect(PARSER.extrair('notebook 3.499,90').valor).toBe(3499.9);
    expect(PARSER.extrair('carro 45.000').valor).toBe(45000);
  });

  test('valor inteiro sem centavos continua funcionando', () => {
    expect(PARSER.extrair('mercado 50').valor).toBe(50);
  });

  test('prefixo R$ é aceito colado ou separado', () => {
    expect(PARSER.extrair('uber R$32,90').valor).toBe(32.9);
    expect(PARSER.extrair('uber R$ 32,90').valor).toBe(32.9);
  });

  test('o valor não é engolido por outros tokens da frase', () => {
    const r = PARSER.extrair('ifood 45,00 nubank');
    expect(r.valor).toBe(45);
    expect(r.banco).toBe('nubank');
  });

  test('sem número, valor fica null e não vira 0', () => {
    expect(PARSER.extrair('almoço com cliente').valor).toBeNull();
  });

  test('a descrição não absorve o número', () => {
    const r = PARSER.extrair('Uber 32,90');
    expect(r.desc).toBe('uber');
    expect(r.desc).not.toMatch(/\d/);
  });

  test('descrição de várias palavras é preservada', () => {
    const r = PARSER.extrair('mercado do bairro 89,90');
    expect(r.valor).toBe(89.9);
    expect(r.desc).toContain('mercado');
    expect(r.desc).toContain('bairro');
  });

  test('centavos com um dígito são lidos como décimos', () => {
    // "7,5" é R$ 7,50 — não R$ 7,05 nem R$ 5,00.
    expect(PARSER.extrair('cafe 7,5').valor).toBe(7.5);
  });

  test('frase com valor no meio funciona igual', () => {
    expect(PARSER.extrair('paguei 32,90 no uber').valor).toBe(32.9);
  });
});

describe('PARSER.parseData — data local, sem escorregar de fuso', () => {
  // O bug: `new Date().toISOString().split('T')[0]` devolve a data em UTC.
  // Em America/Sao_Paulo (UTC-3), qualquer lançamento após as 21h era gravado
  // com a data do dia SEGUINTE. O usuário lança o jantar e ele aparece amanhã.

  function hojeLocal() {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  test('"hoje" é a data local do usuário', () => {
    expect(PARSER.parseData('hoje')).toBe(hojeLocal());
  });

  test('"ontem" é exatamente um dia antes de "hoje"', () => {
    const hoje = PARSER.parseData('hoje');
    const ontem = PARSER.parseData('ontem');
    const diff = (new Date(hoje + 'T12:00:00') - new Date(ontem + 'T12:00:00')) / 86400000;
    expect(diff).toBe(1);
  });

  test('"anteontem" são dois dias', () => {
    const hoje = PARSER.parseData('hoje');
    const ante = PARSER.parseData('anteontem');
    const diff = (new Date(hoje + 'T12:00:00') - new Date(ante + 'T12:00:00')) / 86400000;
    expect(diff).toBe(2);
  });

  test('toda data devolvida tem o formato YYYY-MM-DD', () => {
    ['hoje', 'ontem', 'anteontem', 'segunda', 'sexta'].forEach((termo) => {
      const d = PARSER.parseData(termo);
      if (d !== null) expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  test('dia da semana aponta sempre para o passado', () => {
    const hoje = PARSER.parseData('hoje');
    ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'].forEach((dia) => {
      const d = PARSER.parseData(dia);
      expect(d).not.toBeNull();
      expect(d <= hoje).toBe(true);
    });
  });

  test('termo desconhecido devolve null', () => {
    expect(PARSER.parseData('quinta-feira-santa')).toBeNull();
    expect(PARSER.parseData('')).toBeNull();
  });
});
