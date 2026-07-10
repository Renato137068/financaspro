/**
 * e2e-fixtures.cjs — build + servidor estático para E2E e screenshots
 */
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

const root = path.join(__dirname, '..');
const distDir = path.join(root, 'dist');
const DEFAULT_PORT = 4321;

function ensureBuild() {
  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    console.log('[e2e] Build ausente — executando npm run build…');
    execSync('npm run build', { cwd: root, stdio: 'inherit' });
  }
}

function startStaticServer(port) {
  port = port || DEFAULT_PORT;
  return new Promise(function(resolve, reject) {
    var bin = path.join(root, 'node_modules', 'http-server', 'bin', 'http-server');
    var proc = spawn(process.execPath, [bin, distDir, '-p', String(port), '-s', '-c-1'], {
      cwd: root,
      stdio: 'pipe',
    });
    var ready = false;

    function markReady() {
      if (ready) return;
      ready = true;
      resolve({ proc: proc, port: port });
    }

    proc.on('error', reject);
    proc.stderr.on('data', function() {});
    proc.stdout.on('data', function(buf) {
      var text = String(buf);
      if (text.indexOf('Hit CTRL-C') !== -1 || text.indexOf('Available on') !== -1) {
        markReady();
      }
    });

    setTimeout(function() {
      if (!ready) markReady();
    }, 2500);
  });
}

function demoSeed() {
  var now = new Date();
  var y = now.getFullYear();
  var m = String(now.getMonth() + 1).padStart(2, '0');

  var config = {
    nome: 'Maria Silva',
    moeda: 'BRL',
    tema: 'light',
    plano: 'free',
    renda: 8500,
    pinAtivo: false,
    onboardingConcluido: true,
    orcamentos: { alimentacao: 1200, transporte: 600, moradia: 2000 },
    regra503020: { necessidades: 50, desejos: 30, poupanca: 20 },
    openFinance: { connections: [], lastSync: null },
    _schemaVer: 2,
  };

  var transacoes = [
    { id: 'tx-1', tipo: 'receita', valor: 8500, categoria: 'salario', data: y + '-' + m + '-05', descricao: 'Salário mensal' },
    { id: 'tx-2', tipo: 'despesa', valor: 248.9, categoria: 'alimentacao', data: y + '-' + m + '-08', descricao: 'Supermercado' },
  ];

  return {
    'fp-config': JSON.stringify(config),
    'fp-transacoes': JSON.stringify(transacoes),
    'fp-contas': JSON.stringify([]),
  };
}

module.exports = {
  root: root,
  distDir: distDir,
  DEFAULT_PORT: DEFAULT_PORT,
  ensureBuild: ensureBuild,
  startStaticServer: startStaticServer,
  demoSeed: demoSeed,
};
