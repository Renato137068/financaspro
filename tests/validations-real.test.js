/**
 * validations-real.test.js — exercita js/core/validations.js REAL.
 *
 * Por que este arquivo existe: `validations.test.js` reimplementa o objeto
 * VALIDATIONS inline e testa a cópia. Isso valida o raciocínio, mas não protege
 * o código de produção — uma regressão no arquivo real passaria verde. Aqui o
 * módulo é carregado de verdade, no mesmo padrão dos demais `*-real.test.js`.
 *
 * Foco nos ramos: o relatório de cobertura apontava 35% de branches, ou seja,
 * quase toda guarda de early return estava sem teste — justamente no módulo
 * que decide se um lançamento financeiro entra ou não.
 */
const { loadCoreModules, resetFixtures, semGlobalNoSandbox } = require('./load-sources');

loadCoreModules();

beforeEach(function() {
  resetFixtures();
});

describe('VALIDATIONS.sanitizarTexto (real)', function() {
  test('remove espaços das pontas', function() {
    expect(global.VALIDATIONS.sanitizarTexto('  café  ')).toBe('café');
  });

  test('escapa HTML — a descrição vai parar em innerHTML', function() {
    const out = global.VALIDATIONS.sanitizarTexto('<script>alert(1)</script>');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;');
  });

  test('escapa aspas usadas para quebrar atributo', function() {
    const out = global.VALIDATIONS.sanitizarTexto('" onerror="x');
    expect(out).not.toContain('"');
  });

  test('converte não-string sem lançar', function() {
    expect(global.VALIDATIONS.sanitizarTexto(42)).toBe('42');
    expect(global.VALIDATIONS.sanitizarTexto(null)).toBe('null');
    expect(global.VALIDATIONS.sanitizarTexto(undefined)).toBe('undefined');
  });
});

describe('VALIDATIONS.validarDescricao (real)', function() {
  test('descrição comum é aceita e devolvida sanitizada', function() {
    const out = global.VALIDATIONS.validarDescricao('  Mercado  ');
    expect(out).toEqual({ valido: true, valor: 'Mercado' });
  });

  test('string vazia é recusada', function() {
    expect(global.VALIDATIONS.validarDescricao('').valido).toBe(false);
  });

  test('só espaços é recusado (ramo do trim)', function() {
    const out = global.VALIDATIONS.validarDescricao('     ');
    expect(out.valido).toBe(false);
    expect(out.erro).toMatch(/obrigat/i);
  });

  test('exatamente 100 caracteres é aceito (limite inclusivo)', function() {
    const out = global.VALIDATIONS.validarDescricao('a'.repeat(100));
    expect(out.valido).toBe(true);
  });

  test('101 caracteres é recusado', function() {
    const out = global.VALIDATIONS.validarDescricao('a'.repeat(101));
    expect(out.valido).toBe(false);
    expect(out.erro).toMatch(/100/);
  });

  test('texto escapado que ultrapassa 100 depois do escape é recusado', function() {
    // 30 caracteres "<" viram 120 depois de escapados — o limite se aplica ao
    // texto já sanitizado, que é o que de fato será armazenado.
    const out = global.VALIDATIONS.validarDescricao('<'.repeat(30));
    expect(out.valido).toBe(false);
  });
});

describe('VALIDATIONS.validarValor (real)', function() {
  test('número simples', function() {
    expect(global.VALIDATIONS.validarValor(25.5)).toEqual({ valido: true, valor: 25.5 });
  });

  test('formato brasileiro com milhar e vírgula', function() {
    expect(global.VALIDATIONS.validarValor('1.234,56').valor).toBe(1234.56);
  });

  test('vírgula sem milhar', function() {
    expect(global.VALIDATIONS.validarValor('99,90').valor).toBe(99.9);
  });

  test('milhar sem decimal', function() {
    expect(global.VALIDATIONS.validarValor('10.000').valor).toBe(10000);
  });

  test('zero é recusado (ramo num <= 0)', function() {
    const out = global.VALIDATIONS.validarValor(0);
    expect(out.valido).toBe(false);
    expect(out.erro).toMatch(/maior que 0/);
  });

  test('negativo é recusado', function() {
    expect(global.VALIDATIONS.validarValor(-10).valido).toBe(false);
    expect(global.VALIDATIONS.validarValor('-10,50').valido).toBe(false);
  });

  test('texto não numérico é recusado (ramo isNaN)', function() {
    expect(global.VALIDATIONS.validarValor('abc').valido).toBe(false);
    expect(global.VALIDATIONS.validarValor('').valido).toBe(false);
    expect(global.VALIDATIONS.validarValor(null).valido).toBe(false);
    expect(global.VALIDATIONS.validarValor(undefined).valido).toBe(false);
  });

  test('valor muito pequeno mas positivo é aceito', function() {
    expect(global.VALIDATIONS.validarValor('0,01').valor).toBe(0.01);
  });
});

describe('VALIDATIONS.validarData (real)', function() {
  test('ISO é aceita', function() {
    expect(global.VALIDATIONS.validarData('2026-08-09').valido).toBe(true);
  });

  test('devolve o valor original, não o objeto Date', function() {
    // O consumidor grava a string; converter aqui mudaria o contrato.
    expect(global.VALIDATIONS.validarData('2026-08-09').valor).toBe('2026-08-09');
  });

  test('data inválida é recusada (ramo isNaN)', function() {
    expect(global.VALIDATIONS.validarData('não é data').valido).toBe(false);
    expect(global.VALIDATIONS.validarData('').valido).toBe(false);
    expect(global.VALIDATIONS.validarData(undefined).valido).toBe(false);
  });

  test('dia inexistente em ISO é recusado', function() {
    expect(global.VALIDATIONS.validarData('2026-02-31').valido).toBe(false);
    expect(global.VALIDATIONS.validarData('2026-02-30').valido).toBe(false);
  });
});

describe('VALIDATIONS.validarCategoria (real)', function() {
  const RECEITA = global.CONFIG.TIPO_RECEITA;
  const DESPESA = global.CONFIG.TIPO_DESPESA;

  test('categoria de despesa válida', function() {
    const cat = global.CONFIG.CATEGORIAS_DESPESA[0];
    expect(global.VALIDATIONS.validarCategoria(cat, DESPESA).valido).toBe(true);
  });

  test('categoria de receita válida', function() {
    const cat = global.CONFIG.CATEGORIAS_RECEITA[0];
    expect(global.VALIDATIONS.validarCategoria(cat, RECEITA).valido).toBe(true);
  });

  test('categoria ausente é recusada (ramo !categoria)', function() {
    expect(global.VALIDATIONS.validarCategoria('', DESPESA).valido).toBe(false);
    expect(global.VALIDATIONS.validarCategoria(null, DESPESA).valido).toBe(false);
    expect(global.VALIDATIONS.validarCategoria(undefined, DESPESA).valido).toBe(false);
  });

  test('categoria inexistente é recusada (ramo indexOf === -1)', function() {
    const out = global.VALIDATIONS.validarCategoria('categoria-inventada', DESPESA);
    expect(out.valido).toBe(false);
    expect(out.erro).toMatch(/inválida/i);
  });

  test('categoria de receita não vale para despesa', function() {
    // Cruzar as listas é o erro clássico deste módulo: "salário" como despesa
    // inverteria o sinal do lançamento no resumo do mês.
    const soReceita = global.CONFIG.CATEGORIAS_RECEITA
      .find(c => global.CONFIG.CATEGORIAS_DESPESA.indexOf(c) === -1);

    expect(soReceita).toBeDefined();
    expect(global.VALIDATIONS.validarCategoria(soReceita, DESPESA).valido).toBe(false);
  });

  test('tipo desconhecido recai na lista de despesa (ramo do ternário)', function() {
    const catDespesa = global.CONFIG.CATEGORIAS_DESPESA[0];
    expect(global.VALIDATIONS.validarCategoria(catDespesa, 'tipo-inventado').valido).toBe(true);
  });
});

describe('VALIDATIONS.validarTransacaoCompleta (real)', function() {
  function transacaoValida(over) {
    return Object.assign({
      descricao: 'Mercado',
      valor: '150,00',
      data: '2026-08-09',
      categoria: global.CONFIG.CATEGORIAS_DESPESA[0],
      tipo: global.CONFIG.TIPO_DESPESA,
    }, over || {});
  }

  test('transação completa e válida', function() {
    expect(global.VALIDATIONS.validarTransacaoCompleta(transacaoValida())).toEqual({ valido: true });
  });

  test('para na descrição — primeiro erro encontrado é o devolvido', function() {
    // A ordem importa para a mensagem que o usuário vê: reportar "categoria
    // inválida" quando a descrição está vazia confundiria mais do que ajuda.
    const out = global.VALIDATIONS.validarTransacaoCompleta(
      transacaoValida({ descricao: '', valor: -5, categoria: 'inventada' }),
    );
    expect(out.valido).toBe(false);
    expect(out.erro).toMatch(/Descrição/);
  });

  test('para no valor quando a descrição está ok', function() {
    const out = global.VALIDATIONS.validarTransacaoCompleta(
      transacaoValida({ valor: 0, categoria: 'inventada' }),
    );
    expect(out.erro).toMatch(/maior que 0/);
  });

  test('para na data quando descrição e valor estão ok', function() {
    const out = global.VALIDATIONS.validarTransacaoCompleta(
      transacaoValida({ data: 'ontem', categoria: 'inventada' }),
    );
    expect(out.erro).toMatch(/Data/);
  });

  test('chega até a categoria quando o resto está ok', function() {
    const out = global.VALIDATIONS.validarTransacaoCompleta(
      transacaoValida({ categoria: 'inventada' }),
    );
    expect(out.erro).toMatch(/Categoria|categoria/);
  });

  test('sucesso não devolve o valor convertido — só o veredito', function() {
    // Documenta o contrato atual: quem chama precisa converter por conta.
    const out = global.VALIDATIONS.validarTransacaoCompleta(transacaoValida());
    expect(out.valor).toBeUndefined();
  });

  test('receita com categoria de receita passa', function() {
    const out = global.VALIDATIONS.validarTransacaoCompleta(transacaoValida({
      tipo: global.CONFIG.TIPO_RECEITA,
      categoria: global.CONFIG.CATEGORIAS_RECEITA[0],
    }));
    expect(out.valido).toBe(true);
  });
});

/**
 * Os dois ramos que faltavam: o teto de valor e a data que não é ISO nem
 * parseável. São exatamente as bordas por onde entra lixo — um valor colado de
 * planilha com muitos dígitos, ou uma data digitada à mão.
 */
describe('VALIDATIONS.validarValor — teto (real)', function() {
  test('recusa valor acima do limite de Decimal(15,2)', function() {
    const out = global.VALIDATIONS.validarValor(1000000000000);
    expect(out.valido).toBe(false);
    expect(out.erro).toMatch(/limite/i);
  });

  test('aceita exatamente o teto', function() {
    const out = global.VALIDATIONS.validarValor(999999999999.99);
    expect(out.valido).toBe(true);
  });
});

describe('VALIDATIONS.validarData — formatos fora do ISO (real)', function() {
  test('texto que não vira data é recusado', function() {
    const out = global.VALIDATIONS.validarData('quinta que vem');
    expect(out.valido).toBe(false);
    expect(out.erro).toMatch(/inválida/i);
  });

  test('data não-ISO mas parseável passa, devolvendo o texto original', function() {
    // Documenta o contrato atual: só o formato ISO é normalizado; o resto
    // volta como veio. Quem consome precisa saber que `valor` nem sempre é
    // YYYY-MM-DD.
    const out = global.VALIDATIONS.validarData('August 22, 2026');
    expect(out.valido).toBe(true);
    expect(out.valor).toBe('August 22, 2026');
  });

  test('ISO com hora é normalizado para a data pura', function() {
    const out = global.VALIDATIONS.validarData('2026-08-22T10:00:00Z');
    expect(out.valido).toBe(true);
    expect(out.valor).toBe('2026-08-22');
  });
});

/**
 * validarSenha delega para PASSWORD_POLICY quando ele existe, e cai numa regra
 * mínima quando não existe. Os dois caminhos importam: o fallback roda em
 * qualquer contexto onde o módulo Tier 0 não tenha carregado ainda, e uma
 * divergência entre ele e o backend produz o pior erro de formulário — o campo
 * aceita, o servidor recusa, e o usuário não sabe o que corrigir.
 */
describe('VALIDATIONS.validarSenha (real)', function() {
  test('recusa senha curta demais', function() {
    const out = global.VALIDATIONS.validarSenha('abc123');
    expect(out.valido).toBe(false);
    expect(out.erro).toMatch(/8 caracteres/);
  });

  test('recusa senha só de letras — o backend exige número ou símbolo', function() {
    const out = global.VALIDATIONS.validarSenha('senhasegura');
    expect(out.valido).toBe(false);
    expect(out.erro).toMatch(/número|caractere especial/i);
  });

  test('aceita senha com número', function() {
    expect(global.VALIDATIONS.validarSenha('senhasegura1').valido).toBe(true);
  });

  test('aceita senha com caractere especial', function() {
    expect(global.VALIDATIONS.validarSenha('senhasegura!').valido).toBe(true);
  });

  test('recusa senha acima do teto de 128', function() {
    const out = global.VALIDATIONS.validarSenha('a1'.repeat(70));
    expect(out.valido).toBe(false);
    expect(out.erro).toMatch(/longa/i);
  });

  test('null e vazio são recusados sem estourar', function() {
    expect(global.VALIDATIONS.validarSenha(null).valido).toBe(false);
    expect(global.VALIDATIONS.validarSenha('').valido).toBe(false);
  });

  test('sem PASSWORD_POLICY, o fallback ainda barra senha curta', function() {
    semGlobalNoSandbox('PASSWORD_POLICY', function() {
      expect(global.VALIDATIONS.validarSenha('curta').valido).toBe(false);
      // O fallback é deliberadamente mais frouxo: só o comprimento. O backend
      // continua sendo a autoridade e recusa o resto.
      expect(global.VALIDATIONS.validarSenha('longaosuficiente').valido).toBe(true);
    });
  });
});

