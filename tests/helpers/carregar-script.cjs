/**
 * carregar-script.cjs — carrega um arquivo de js/ nos testes do frontend.
 *
 * Substitui `require('../js/…')`. Os dois carregam o módulo e devolvem o
 * `module.exports`, mas o `require` do Jest embrulha o código num cabeçalho
 * CommonJS, e a cobertura V8 soma as execuções de um arquivo por posição de
 * caractere. Como o app completo (tests/helpers/app-jsdom.cjs) roda os mesmos
 * arquivos via vm, sem cabeçalho, misturar as duas formas deslocava a soma e
 * atribuía cobertura ao trecho errado. Com uma forma só, a medição fecha.
 *
 * Nomes livres (DADOS, UTILS, window, document…) resolvem no global do teste,
 * como no `require`, inclusive dublês trocados depois do carregamento. `var` de
 * topo fica no sandbox, como ficava no escopo do módulo.
 *
 *   const BILLING = carregarScript('js/billing.js');
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');

/**
 * Acessores e métodos da janela do jsdom (document, btoa, localStorage…) não
 * resolvem pela cadeia de protótipos dentro do vm. Para eles, um getter
 * explícito que lê do global do teste na hora do uso.
 */
function nomesDoGlobal() {
  const nomes = new Set();
  for (let o = globalThis; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
    Object.getOwnPropertyNames(o).forEach((n) => nomes.add(n));
  }
  return nomes;
}

function carregarScript(rel, extras) {
  const arquivo = path.join(ROOT, rel);
  const mod = { exports: {} };
  const sandbox = Object.create(globalThis);
  nomesDoGlobal().forEach((nome) => {
    Object.defineProperty(sandbox, nome, {
      get: () => globalThis[nome],
      set: (v) => { globalThis[nome] = v; },
      configurable: true,
      enumerable: false,
    });
  });
  Object.assign(sandbox, { module: mod, exports: mod.exports }, extras || {});
  vm.runInContext(fs.readFileSync(arquivo, 'utf8'), vm.createContext(sandbox), { filename: arquivo });
  return mod.exports;
}

module.exports = { carregarScript };
