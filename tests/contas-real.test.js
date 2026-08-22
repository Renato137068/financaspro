/**
 * contas-real.test.js — exercita js/contas.js e a parte pura de js/anexos.js.
 *
 * Fecha os dois últimos itens da lista de módulos sem teste real declarada em
 * `suite-integrity.test.js`. Contas é o vínculo entre transação e banco: se o
 * cache sai de sincronia com o armazenamento, o extrato passa a mostrar conta
 * errada num lançamento.
 */
const { loadCoreModules, resetFixtures } = require('./load-sources');

loadCoreModules();

const C = () => global.CONTAS;
const AN = () => global.ANEXOS;

beforeEach(function() {
  resetFixtures();
  C().init();
});

describe('CONTAS — persistência', function() {
  test('salvar gera id e devolve a conta', function() {
    const c = C().salvar({ nome: 'Nubank', tipo: 'digital' });

    expect(c.id).toEqual(expect.any(String));
    expect(c.nome).toBe('Nubank');
  });

  test('conta salva aparece na listagem', function() {
    C().salvar({ nome: 'Itaú', tipo: 'corrente' });
    expect(C().getAll()).toHaveLength(1);
  });

  test('salvar com id existente atualiza em vez de duplicar', function() {
    const c = C().salvar({ nome: 'Antigo', tipo: 'corrente' });
    C().salvar({ id: c.id, nome: 'Novo', tipo: 'poupanca' });

    const todas = C().getAll();
    expect(todas).toHaveLength(1);
    expect(todas[0].nome).toBe('Novo');
    expect(todas[0].tipo).toBe('poupanca');
  });

  test('o cache acompanha o armazenamento após salvar', function() {
    // Se o cache não for atualizado, a UI segue mostrando a lista antiga até
    // um reload — e o usuário acha que o cadastro não funcionou.
    C().salvar({ nome: 'A', tipo: 'corrente' });
    expect(C().getAll()).toEqual(global.DADOS.getContas());
  });

  test('deletar remove só a indicada e atualiza o cache', function() {
    const a = C().salvar({ nome: 'A', tipo: 'corrente' });
    C().salvar({ nome: 'B', tipo: 'digital' });

    C().deletar(a.id);

    expect(C().getAll()).toHaveLength(1);
    expect(C().getAll()[0].nome).toBe('B');
    expect(C().getAll()).toEqual(global.DADOS.getContas());
  });

  test('deletar id inexistente não altera nada', function() {
    C().salvar({ nome: 'A', tipo: 'corrente' });
    C().deletar('fantasma');
    expect(C().getAll()).toHaveLength(1);
  });
});

describe('CONTAS — busca', function() {
  test('getById encontra a conta', function() {
    const c = C().salvar({ nome: 'Banco', tipo: 'corrente' });
    expect(C().getById(c.id).nome).toBe('Banco');
  });

  test('getById devolve null para id inexistente', function() {
    expect(C().getById('fantasma')).toBeNull();
  });

  test('getNome devolve string vazia quando a conta sumiu', function() {
    // Transação pode referenciar conta já excluída; devolver undefined
    // colocaria "undefined" na tela do extrato.
    expect(C().getNome('fantasma')).toBe('');
  });

  test('getNome devolve o nome da conta existente', function() {
    const c = C().salvar({ nome: 'Carteira', tipo: 'carteira' });
    expect(C().getNome(c.id)).toBe('Carteira');
  });
});

describe('CONTAS — rótulos e ícones', function() {
  const TIPOS = ['corrente', 'poupanca', 'digital', 'carteira', 'credito', 'debito'];

  test.each([
    ['credito', 'Cartão Crédito'],
    ['debito', 'Cartão Débito'],
    ['poupanca', 'Poupança'],
    ['digital', 'Conta Digital'],
    ['carteira', 'Carteira'],
  ])('tipo %s tem rótulo próprio', function(tipo, rotulo) {
    expect(C().tipoLabel(tipo)).toBe(rotulo);
  });

  test('tipo desconhecido cai em Conta Corrente', function() {
    expect(C().tipoLabel('inventado')).toBe('Conta Corrente');
    expect(C().tipoLabel(undefined)).toBe('Conta Corrente');
  });

  test('todo tipo conhecido tem ícone próprio', function() {
    const genericos = TIPOS.filter(t => C().iconeLucide(t) === 'landmark' && t !== 'corrente');
    expect(genericos).toEqual([]);
  });

  test('tipo desconhecido cai no ícone genérico em vez de vazio', function() {
    expect(C().iconeLucide('inventado')).toBe('landmark');
  });
});

describe('ANEXOS.validarArquivo', function() {
  function arquivo(tipo, bytes) {
    return { type: tipo, size: bytes, name: 'comprovante' };
  }

  test('aceita os formatos permitidos', function() {
    ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'].forEach(function(tipo) {
      expect(AN().validarArquivo(arquivo(tipo, 1024)).valido).toBe(true);
    });
  });

  test('recusa formato não permitido', function() {
    // Executável disfarçado de comprovante é o caso que importa barrar.
    const out = AN().validarArquivo(arquivo('application/x-msdownload', 1024));
    expect(out.valido).toBe(false);
    expect(out.erro).toMatch(/imagem|PDF/i);
  });

  test('recusa arquivo acima do limite', function() {
    const out = AN().validarArquivo(arquivo('image/png', AN().MAX_BYTES + 1));
    expect(out.valido).toBe(false);
    expect(out.erro).toMatch(/grande/i);
  });

  test('aceita exatamente no limite', function() {
    expect(AN().validarArquivo(arquivo('image/png', AN().MAX_BYTES)).valido).toBe(true);
  });

  test('recusa entrada nula sem lançar', function() {
    expect(AN().validarArquivo(null).valido).toBe(false);
    expect(AN().validarArquivo(undefined).valido).toBe(false);
  });

  test('o limite declarado é 2 MB', function() {
    // O texto de erro promete 2 MB ao usuário; se a constante mudar sem o
    // texto, a mensagem passa a mentir.
    expect(AN().MAX_BYTES).toBe(2 * 1024 * 1024);
    expect(AN().validarArquivo(arquivo('image/png', AN().MAX_BYTES + 1)).erro).toContain('2 MB');
  });

  test('o limite por transação é declarado', function() {
    expect(AN().MAX_POR_TX).toBeGreaterThan(0);
  });
});
