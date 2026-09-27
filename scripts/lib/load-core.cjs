'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');

/** Carrega tests/load-sources.js em CommonJS (package.json type=module). */
function loadLoader() {
  const loaderPath = path.join(ROOT, 'tests', 'load-sources.js');
  const loaderCode = fs.readFileSync(loaderPath, 'utf8');
  const loaderMod = { exports: {} };
  vm.runInNewContext(loaderCode, {
    module: loaderMod,
    exports: loaderMod.exports,
    require,
    __dirname: path.dirname(loaderPath),
    __filename: loaderPath,
    console,
    process,
    global,
    Buffer,
  }, { filename: loaderPath });
  return loaderMod.exports;
}

/** Módulos frontend + BUDGET_SERVICE no global. */
function loadCoreGlobals() {
  const { loadCoreModules, loadScript, getContext, resetFixtures, execNoSandbox } = loadLoader();
  loadCoreModules();
  loadScript(getContext(), 'js/services/budgetService.js');
  global.BUDGET_SERVICE = execNoSandbox('BUDGET_SERVICE');
  return { resetFixtures, execNoSandbox };
}

module.exports = { ROOT, loadCoreGlobals, loadLoader };
