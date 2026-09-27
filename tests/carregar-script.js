/**
 * carregar-script.js — carrega um script de js/ via vm, no lugar de require().
 *
 * Por que não require(): a cobertura do frontend usa o provider v8, e o Jest
 * soma a cobertura de um mesmo arquivo por POSIÇÃO de caractere (mergeProcessCovs)
 * antes de descontar o `wrapperLength` do embrulho CommonJS. Se uma suíte carrega
 * o arquivo por require (com embrulho) e outra por vm.runInContext (sem), as
 * execuções via vm ficam deslocadas pelo tamanho do cabeçalho (~90 caracteres) e
 * a cobertura cai no trecho errado do arquivo. Por isso cada arquivo de js/ tem
 * de ser carregado de UMA forma só — e a forma única é vm, que é como o
 * load-sources e as demais suítes já carregam. `suite-integrity.test.js` trava
 * a mistura.
 *
 * O sandbox é `Object.create(globalThis)`: os nomes livres do script (document,
 * window, UTILS, setTimeout, localStorage...) caem no global do próprio teste —
 * como aconteceria com require. A leitura é feita na hora do acesso, então um
 * teste que troca `global.UTILS` depois do carregamento continua sendo visto
 * pelo módulo, e `jest.useFakeTimers()` continua interceptando os timers dele.
 * Os `var` e funções de topo do script ficam no sandbox, sem vazar para o global
 * do teste (de novo como no require, onde seriam locais do módulo).
 *
 * Por que o Proxy em volta do Object.create: no Jest, `globalThis` é o global
 * proxy do contexto do jsdom, e os nomes do jsdom (document, btoa, ...) só
 * existem atrás do interceptor desse contexto. O vm resolve nomes livres com
 * GetRealNamedProperty, que percorre o protótipo mas PULA interceptores — com o
 * Object.create puro, `document` dá ReferenceError. O Proxy faz o acesso passar
 * por um [[Get]] comum, que atravessa o interceptor.
 *
 * Cada chamada cria uma instância NOVA do módulo (não há cache como no require).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');

/**
 * @param {string} relativo caminho a partir da raiz do repo, ex.: 'js/pin.js'
 * @param {object} [opcoes]
 * @param {string} [opcoes.global] nome declarado pelo script a devolver quando
 *   ele não preenche `module.exports` (ex.: 'INIT_EXTRATO').
 * @returns o `module.exports` do script, ou o global declarado em `opcoes.global`.
 */
function carregarScript(relativo, opcoes) {
  const nomeGlobal = opcoes && opcoes.global;
  const arquivo = path.join(root, relativo);
  const codigo = fs.readFileSync(arquivo, 'utf8');

  const base = Object.create(globalThis);
  const modulo = { exports: {} };
  base.module = modulo;
  base.exports = modulo.exports;
  const proprio = (k) => Object.prototype.hasOwnProperty.call(base, k);
  const sandbox = new Proxy(base, {
    // Próprias do sandbox (module, exports, `var` de topo) primeiro; o resto é
    // lido do global do teste no momento do acesso.
    get: (alvo, k) => (proprio(k) ? alvo[k] : globalThis[k]),
    has: (alvo, k) => proprio(k) || k in globalThis,
  });
  const contexto = vm.createContext(sandbox);

  // filename ABSOLUTO: sem ele o provider v8 não mapeia a execução de volta ao
  // arquivo e o módulo aparece com 0% no relatório.
  vm.runInContext(codigo, contexto, { filename: arquivo });

  if (nomeGlobal) {
    // `const X` de topo vive no escopo de script do contexto, não no sandbox;
    // avaliar o nome dentro do contexto alcança os dois casos.
    return vm.runInContext(nomeGlobal, contexto);
  }
  if (modulo.exports !== base.exports || Object.keys(modulo.exports).length) {
    return modulo.exports;
  }
  throw new Error(
    `${relativo} não preencheu module.exports — passe { global: 'NOME' } a carregarScript`,
  );
}

module.exports = { carregarScript };
