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
  // Artefato já pronto: smoke e CI podem apontar para dist/ sem rebuild implícito.
  if (process.env.E2E_SKIP_BUILD === '1' || process.env.E2E_SKIP_BUILD === 'true') {
    var skipIndex = path.join(distDir, 'index.html');
    var skipBundle = path.join(distDir, 'js', 'app.bundle.js');
    if (!fs.existsSync(skipIndex) || !fs.existsSync(skipBundle)) {
      throw new Error('[e2e] E2E_SKIP_BUILD=1 mas dist/ está incompleto (falta index.html ou app.bundle.js)');
    }
    console.log('[e2e] Usando dist/ existente (E2E_SKIP_BUILD=1)');
    return;
  }

  var distIndex = path.join(distDir, 'index.html');
  var appBundle = path.join(distDir, 'js', 'app.bundle.js');
  var srcIndex = path.join(root, 'index.html');
  var srcBundleScript = path.join(root, 'scripts', 'bundle-app.cjs');

  function mtime(p) {
    try { return fs.statSync(p).mtimeMs; } catch (e) { return 0; }
  }

  var needsBuild = !fs.existsSync(distIndex)
    || !fs.existsSync(appBundle)
    || mtime(distIndex) < mtime(srcIndex)
    || mtime(appBundle) < mtime(srcBundleScript);

  if (needsBuild) {
    console.log('[e2e] Build ausente ou desatualizado — executando npm run build…');
    execSync('npm run build', { cwd: root, stdio: 'inherit' });
  }

  if (!fs.existsSync(distIndex) || !fs.existsSync(appBundle)) {
    throw new Error('[e2e] Build não produziu dist/index.html + js/app.bundle.js');
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
