#!/usr/bin/env node
/**
 * abrir-celular.cjs — abre o FinançasPro numa janela no formato de celular.
 *
 * Procura Chrome ou Edge, sobe o servidor local se necessário e abre em
 * modo app (sem abas) com viewport ~iPhone 14 / Pixel.
 *
 * Uso:
 *   node scripts/abrir-celular.cjs
 *   node scripts/abrir-celular.cjs --dist
 *   node scripts/abrir-celular.cjs --url http://localhost:3000
 */
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');

const root = path.join(__dirname, '..');
const args = process.argv.slice(2);
const usarDist = args.includes('--dist');
const urlArg = (() => {
  const i = args.indexOf('--url');
  return i !== -1 ? args[i + 1] : null;
})();

const LARGURA = 390;
const ALTURA = 844;
const UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

function candidatosNavegador() {
  if (process.platform !== 'win32') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium-browser',
      '/usr/bin/microsoft-edge',
    ].filter((p) => fs.existsSync(p));
  }

  const locais = [
    process.env.LOCALAPPDATA,
    process.env.PROGRAMFILES,
    process.env['PROGRAMFILES(X86)'],
  ].filter(Boolean);

  const rels = [
    ['Google', 'Chrome', 'Application', 'chrome.exe'],
    ['Microsoft', 'Edge', 'Application', 'msedge.exe'],
  ];

  const out = [];
  for (const base of locais) {
    for (const partes of rels) {
      const p = path.join(base, ...partes);
      if (fs.existsSync(p)) out.push(p);
    }
  }
  return out;
}

function portaLivre(inicio = 3000) {
  return new Promise((resolve, reject) => {
    const s = require('net').createServer();
    s.unref();
    s.on('error', () => resolve(portaLivre(inicio + 1)));
    s.listen(inicio, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

function esperarUrl(url, tentativas = 40) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const tentar = () => {
      n += 1;
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) return resolve();
        if (n >= tentativas) return reject(new Error('Servidor não respondeu a tempo'));
        setTimeout(tentar, 250);
      });
      req.on('error', () => {
        if (n >= tentativas) return reject(new Error('Servidor não respondeu a tempo'));
        setTimeout(tentar, 250);
      });
    };
    tentar();
  });
}

function abrirJanelaCelular(navegador, url) {
  const perfil = path.join(os.tmpdir(), 'financaspro-celular-profile');
  const flags = [
    `--app=${url}`,
    `--window-size=${LARGURA},${ALTURA}`,
    `--user-agent=${UA}`,
    `--user-data-dir=${perfil}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=TranslateUI',
  ];

  console.log('');
  console.log('  ┌─────────────────────────────────────────────┐');
  console.log('  │  FinançasPro — modo celular                 │');
  console.log(`  │  ${LARGURA}×${ALTURA}px · UA Android Pixel 7           │`);
  console.log('  └─────────────────────────────────────────────┘');
  console.log(`  Abrindo: ${url}`);
  console.log(`  Navegador: ${path.basename(navegador)}`);
  console.log('');
  console.log('  Feche a janela do celular para encerrar o servidor.');
  console.log('');

  return spawn(navegador, flags, {
    detached: false,
    stdio: 'ignore',
  });
}

async function main() {
  const navegadores = candidatosNavegador();

  let url = urlArg;
  let filhoServidor = null;

  if (!url) {
    const porta = await portaLivre(3000);
    const base = `http://127.0.0.1:${porta}`;
    url = navegadores.length ? `${base}/` : `${base}/celular.html`;

    const argsServidor = [
      path.join(root, 'scripts', 'servidor-local.cjs'),
      '--sem-abrir',
      '--porta',
      String(porta),
    ];
    if (usarDist) argsServidor.push('--dist');

    filhoServidor = spawn(process.execPath, argsServidor, {
      cwd: root,
      stdio: 'inherit',
    });

    try {
      await esperarUrl(base + '/');
    } catch (err) {
      console.error('\n  ' + err.message + '\n');
      if (filhoServidor) filhoServidor.kill();
      process.exit(1);
    }
  }

  if (!navegadores.length) {
    console.log('\n  Chrome/Edge não encontrado — abrindo preview no navegador padrão.');
    console.log(`  ${url}\n`);
    const cmd = process.platform === 'win32'
      ? `start "" "${url}"`
      : process.platform === 'darwin'
        ? `open "${url}"`
        : `xdg-open "${url}"`;
    require('child_process').execSync(cmd, { stdio: 'ignore' });
    process.on('SIGINT', () => {
      if (filhoServidor) filhoServidor.kill();
      process.exit(0);
    });
    return;
  }

  const navegador = navegadores[0];
  const janela = abrirJanelaCelular(navegador, url);

  const encerrar = () => {
    try { janela.kill(); } catch (_) { /* já fechou */ }
    if (filhoServidor) {
      try { filhoServidor.kill(); } catch (_) { /* já fechou */ }
    }
    process.exit(0);
  };

  janela.on('exit', encerrar);
  process.on('SIGINT', encerrar);
  process.on('SIGTERM', encerrar);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
