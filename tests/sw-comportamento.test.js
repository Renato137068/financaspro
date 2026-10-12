/**
 * sw-comportamento.test.js — roda o sw.js gerado de verdade (vm), com caches e
 * fetch falsos. Os testes de texto em sw-precache não pegam erro de sintaxe
 * no template do gerador nem a lógica dos handlers.
 * @jest-environment node
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const swSrc = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

function montarSw({ fetchImpl, falharUrls = [] }) {
  const handlers = {};
  const puts = [];
  const cache = {
    add: (req) => (falharUrls.includes(new URL(req.url).pathname)
      ? Promise.reject(new Error('404')) : Promise.resolve()),
    put: (req, res) => { puts.push(req.url || String(req)); return Promise.resolve(); },
  };
  const ctx = {
    self: {
      addEventListener: (tipo, fn) => { handlers[tipo] = fn; },
      location: { origin: 'https://app.test' },
      clients: { claim: () => Promise.resolve() },
      skipWaiting: () => {},
    },
    caches: {
      open: () => Promise.resolve(cache),
      match: () => Promise.resolve(undefined),
      keys: () => Promise.resolve([]),
      delete: () => Promise.resolve(true),
    },
    fetch: fetchImpl || (() => Promise.reject(new Error('offline'))),
    Request: class extends Request {
      constructor(input, init) {
        super(typeof input === 'string' ? new URL(input, 'https://app.test').href : input, init);
      }
    },
    Response, URL, Promise, Set, console: { error() {}, warn() {}, log() {} },
  };
  vm.runInNewContext(swSrc, ctx);
  return { handlers, puts };
}

function disparar(handler, evento) {
  let promessa;
  handler({ ...evento, waitUntil: (p) => { promessa = p; }, respondWith: (p) => { promessa = p; } });
  return promessa;
}

describe('service worker — comportamento executado', () => {
  test('o sw.js gerado é JavaScript válido', () => {
    expect(() => new vm.Script(swSrc)).not.toThrow();
  });

  test('install aborta quando falta item essencial (index.html)', async () => {
    const { handlers } = montarSw({ falharUrls: ['/index.html'] });
    await expect(disparar(handlers.install, {})).rejects.toThrow(/essencial/);
  });

  test('install segue quando só um item acessório falha', async () => {
    const { handlers } = montarSw({ falharUrls: ['/manifest.json'] });
    await expect(disparar(handlers.install, {})).resolves.toBeUndefined();
  });

  test('HTML no lugar de um chunk JS vira 404 e não entra no cache', async () => {
    const fetchImpl = () => Promise.resolve(new Response('<!doctype html>', {
      status: 200, headers: { 'content-type': 'text/html; charset=utf-8' },
    }));
    const { handlers, puts } = montarSw({ fetchImpl });
    const req = new Request('https://app.test/js/extrato-abc123.js');
    const res = await disparar(handlers.fetch, { request: req });
    expect(res.status).toBe(404);
    await new Promise((r) => setTimeout(r, 0));
    expect(puts).toHaveLength(0);
  });

  test('pedido de asset revalida com o servidor (cache: no-cache)', async () => {
    let modo;
    const fetchImpl = (req) => {
      modo = req.cache;
      return Promise.resolve(new Response('x', { status: 200, headers: { 'content-type': 'text/javascript' } }));
    };
    const { handlers, puts } = montarSw({ fetchImpl });
    const res = await disparar(handlers.fetch, { request: new Request('https://app.test/js/app.bundle.js') });
    expect(res.status).toBe(200);
    expect(modo).toBe('no-cache');
    await new Promise((r) => setTimeout(r, 0));
    expect(puts).toHaveLength(1);
  });
});
