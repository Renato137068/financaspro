#!/usr/bin/env node
/**
 * servidor-local.cjs — servidor estático para testar o app na própria máquina.
 *
 * Sem dependência nenhuma: roda com o Node instalado, sem `npm install`. A
 * alternativa (vite, http-server) exige node_modules íntegro, e a hora de
 * descobrir que ele quebrou não é a hora em que você só queria abrir o app.
 *
 * Uso:
 *   node scripts/servidor-local.cjs            → serve o código-fonte
 *   node scripts/servidor-local.cjs --dist      → serve a build de produção
 *   node scripts/servidor-local.cjs --porta 8080
 *
 * O app funciona sem backend: CONFIG.API_BASE_URL nasce vazio e tudo é
 * guardado no localStorage do navegador.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const args = process.argv.slice(2);
const usarDist = args.includes('--dist');
const semAbrir = args.includes('--sem-abrir');
const idxPorta = args.indexOf('--porta');
const portaInicial = idxPorta !== -1 ? Number(args[idxPorta + 1]) : 3000;

const root = path.join(__dirname, '..');
const raiz = usarDist ? path.join(root, 'dist') : root;

if (!fs.existsSync(path.join(raiz, 'index.html'))) {
  console.error(`\n  Não encontrei index.html em ${raiz}`);
  if (usarDist) console.error('  Rode `npm run build` antes de usar --dist.\n');
  process.exit(1);
}

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  // woff2 sem o tipo certo faz o navegador recusar a fonte em silêncio e cair
  // na do sistema — o layout muda e nada explica por quê.
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
};

/**
 * Pastas que não devem ser servidas. Não é segurança de verdade (isto é um
 * servidor local), é evitar expor `.env` por descuido se alguém rodar isto
 * numa rede compartilhada.
 */
const BLOQUEADAS = [/^\.env/, /^node_modules[/\\]/, /^\.git[/\\]/, /^\.claude[/\\]/];

function resolverCaminho(urlPath) {
  // Normaliza e recusa qualquer coisa que escape da raiz servida.
  const limpo = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const relativo = path.normalize(limpo).replace(/^([/\\])+/, '');
  const destino = path.join(raiz, relativo);

  if (!destino.startsWith(raiz)) return null;
  if (BLOQUEADAS.some((re) => re.test(relativo))) return null;
  return destino;
}

const servidor = http.createServer((req, res) => {
  let destino = resolverCaminho(req.url === '/' ? '/index.html' : req.url);

  if (!destino) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('403 — fora da raiz servida');
  }

  if (fs.existsSync(destino) && fs.statSync(destino).isDirectory()) {
    destino = path.join(destino, 'index.html');
  }

  if (!fs.existsSync(destino)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end(`404 — ${req.url}`);
  }

  const ext = path.extname(destino).toLowerCase();

  // Sem cache, sempre. Este servidor existe para TESTAR: um arquivo servido do
  // cache do navegador depois de uma alteração faz você depurar a versão
  // errada — e é exatamente o tipo de tempo perdido que não dá para recuperar.
  res.writeHead(200, {
    'Content-Type': TIPOS[ext] || 'application/octet-stream',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Service-Worker-Allowed': '/',
  });

  fs.createReadStream(destino).pipe(res);
});

/** Sobe na primeira porta livre a partir da inicial. */
function ouvir(porta, tentativas = 12) {
  servidor.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && tentativas > 0) {
      console.log(`  porta ${porta} ocupada, tentando ${porta + 1}...`);
      return ouvir(porta + 1, tentativas - 1);
    }
    console.error('\n  Falha ao subir o servidor:', err.message, '\n');
    process.exit(1);
  });

  servidor.listen(porta, '127.0.0.1', () => {
    const url = `http://localhost:${porta}`;
    console.log('');
    console.log('  ┌───────────────────────────────────────────────┐');
    console.log(`  │  Sobra rodando em ${url}${' '.repeat(Math.max(0, 22 - url.length))}│`);
    console.log('  └───────────────────────────────────────────────┘');
    console.log('');
    console.log(`  Servindo: ${usarDist ? 'dist/ (build de produção)' : 'código-fonte'}`);
    console.log('  Dados ficam no localStorage do navegador — sem backend.');
    console.log('');
    console.log('  Testar offline / service worker:');
    console.log(`     ${url}/?sw=1   liga o SW  (desliga com ?sw=0)`);
    console.log('     depois: DevTools → Network → Offline → recarregue');
    console.log('');
    console.log('  Para parar: Ctrl+C');
    console.log('');

    if (!semAbrir) abrirNavegador(url);
  });
}

function abrirNavegador(url) {
  const comandos = { win32: `start "" "${url}"`, darwin: `open "${url}"` };
  const cmd = comandos[process.platform] || `xdg-open "${url}"`;
  try {
    execSync(cmd, { stdio: 'ignore' });
  } catch (e) {
    // Sem navegador padrão configurado, ou ambiente sem interface. O endereço
    // já está impresso acima; abrir à mão resolve.
  }
}

ouvir(portaInicial);
