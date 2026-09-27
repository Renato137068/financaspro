/**
 * guarda-vm-offsets.js — recusa, em tempo de execução, código rodado por vm com
 * o filename de um arquivo de js/ que não começa no offset 0 desse arquivo.
 *
 * O Jest soma a cobertura v8 de um arquivo por POSIÇÃO de caractere. Um trecho
 * do meio de js/x.js executado com `filename: js/x.js` tem as posições contadas
 * a partir do início do arquivo — a cobertura das funções que rodaram cai sobre
 * as primeiras linhas, e o piso passa ou falha por ruído. Foi o que fazia
 * supabase-quota-error.test.js: recortava QUOTA_KINDS e isQuotaExceededError e
 * os rodava com o caminho real de supabase-sync.js.
 *
 * Prefixo é inofensivo (auth-runtime.test.js roda o começo de authController.js
 * e as posições coincidem), e `const X` → `var   X` também, porque preserva o
 * comprimento. Qualquer outra coisa sob um filename de js/ é recusada. Um
 * recorte legítimo usa um filename que não seja de js/, por exemplo
 * path.join(__dirname, 'supabase-sync.slice.js').
 *
 * Por que jest.mock e não um monkey-patch no módulo vm: o mock vale só para o
 * registro de módulos da suíte (o que o teste, carregar-script.js e
 * load-sources.js recebem de require('vm')); o vm que o próprio Jest usa para
 * compilar módulos segue intocado. `suite-integrity.test.js` confere que a
 * guarda está ligada.
 */
jest.mock('vm', () => {
  const fs = require('fs');
  const path = require('path');
  const real = jest.requireActual('vm');

  const JS = path.join(__dirname, '..', 'js') + path.sep;
  const chave = (p) => (process.platform === 'win32' ? p.toLowerCase() : p);
  // A reescrita tolerada: mesmo comprimento, então as posições não mudam.
  const normalizar = (s) => s.replace(/\bconst /g, 'var   ');
  const cache = new Map();

  function conferir(codigo, opcoes) {
    const filename = typeof opcoes === 'string' ? opcoes : opcoes && opcoes.filename;
    if (typeof codigo !== 'string' || typeof filename !== 'string') return;
    const arquivo = path.resolve(path.join(__dirname, '..'), filename);
    if (!chave(arquivo).startsWith(chave(JS)) || !fs.existsSync(arquivo)) return;

    if (!cache.has(arquivo)) cache.set(arquivo, normalizar(fs.readFileSync(arquivo, 'utf8')));
    if (cache.get(arquivo).startsWith(normalizar(codigo))) return;

    const rel = path.relative(path.join(__dirname, '..'), arquivo).replace(/\\/g, '/');
    throw new Error(
      `vm executou, com o filename de ${rel}, um código que não é um prefixo do arquivo em disco. `
      + 'A cobertura v8 conta posições a partir do início do arquivo e cairia nas linhas erradas. '
      + "Carregue o arquivo inteiro (carregarScript em tests/carregar-script.js) ou dê ao trecho "
      + "um filename fora de js/ (ex.: path.join(__dirname, 'nome.slice.js')).",
    );
  }

  class Script extends real.Script {
    constructor(codigo, opcoes) {
      conferir(codigo, opcoes);
      super(codigo, opcoes);
    }
  }

  return {
    ...real,
    Script,
    runInContext(codigo, ctx, opcoes) {
      conferir(codigo, opcoes);
      return real.runInContext(codigo, ctx, opcoes);
    },
    runInNewContext(codigo, ctx, opcoes) {
      conferir(codigo, opcoes);
      return real.runInNewContext(codigo, ctx, opcoes);
    },
    runInThisContext(codigo, opcoes) {
      conferir(codigo, opcoes);
      return real.runInThisContext(codigo, opcoes);
    },
    compileFunction(codigo, params, opcoes) {
      conferir(codigo, opcoes);
      return real.compileFunction(codigo, params, opcoes);
    },
    __guardaOffsets: true,
  };
});
