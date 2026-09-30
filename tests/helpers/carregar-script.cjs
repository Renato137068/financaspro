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
 *
 * ES Module (import/export) roda pelo conversor de mesmo tamanho de
 * esm-como-script.cjs, com os imports carregados antes no mesmo sandbox. A
 * função devolve o export default, ou o objeto de exports se não houver.
 * Para trocar um import por um dublê, passe-o em `extras` com o nome do
 * export: `carregarScript('js/modules/x.js', { UTILS: dubleDeUtils })`.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ehModulo, converter, executarModulo, nomesDoGrafo } = require('./esm-como-script.cjs');

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
  const codigo = fs.readFileSync(arquivo, 'utf8');
  const modulo = ehModulo(codigo);
  // Os nomes que o grafo do módulo declara ficam só no sandbox: sem isso, o
  // `var UTILS` de um import escreveria pelo getter no global do teste e
  // atropelaria o dublê que ele montou.
  if (modulo) nomesDoGrafo(arquivo).forEach((nome) => { delete sandbox[nome]; });
  Object.assign(sandbox, { module: mod, exports: mod.exports }, extras || {});
  const ctx = vm.createContext(sandbox);
  if (modulo) {
    // `extras` com o nome de um export substitui aquele import (mock).
    const exps = executarModulo(ctx, arquivo, undefined, extras);
    return 'default' in exps ? exps.default : exps;
  }
  vm.runInContext(codigo, ctx, { filename: arquivo });
  return mod.exports;
}

/**
 * Dublês que repassam ao global do teste na hora do uso: para módulos ES
 * carregados uma vez só, enquanto cada teste troca global.UTILS etc.
 *   carregarScript('js/projecao.js', viaGlobal('UTILS', 'CONTAS_PAGAR'))
 * Sem o global, cada propriedade lida é undefined (os guardas do módulo,
 * como `X.metodo && X.metodo()`, caem no caminho de ausência).
 */
function viaGlobal(...nomes) {
  const extras = {};
  nomes.forEach((nome) => {
    extras[nome] = new Proxy({}, {
      get: (_alvo, chave) => {
        const atual = globalThis[nome];
        return atual == null ? undefined : atual[chave];
      },
      has: (_alvo, chave) => globalThis[nome] != null && chave in globalThis[nome],
    });
  });
  return extras;
}

/**
 * viaGlobal para todos os imports diretos do módulo: o teste troca global.X
 * a cada caso, como fazia com o script clássico. Import de função (declarada
 * com `function` no módulo de origem) vira função que repassa a chamada.
 *   carregarScript('js/modules/init-extrato.js', viaGlobalDosImports('js/modules/init-extrato.js'))
 */
function viaGlobalDosImports(rel) {
  const arquivo = path.join(ROOT, rel);
  const extras = {};
  for (const dep of converter(fs.readFileSync(arquivo, 'utf8'), arquivo).importa) {
    const origem = fs.readFileSync(dep.arquivo, 'utf8');
    for (const { importado, local } of dep.nomes) {
      if (new RegExp('^function\\s+' + importado + '\\b', 'm').test(origem)) {
        extras[local] = function() { return globalThis[local].apply(this, arguments); };
      } else {
        Object.assign(extras, viaGlobal(local));
      }
    }
  }
  return extras;
}

module.exports = { carregarScript, viaGlobal, viaGlobalDosImports, nomesDoGlobal };
