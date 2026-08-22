/**
 * api-routes.mjs — inventário das rotas REAIS da API, lido do código-fonte.
 *
 * Existe para que a documentação não possa divergir da implementação em
 * silêncio. O OpenAPI era mantido à mão e cobria 17 dos 74 endpoints: toda a
 * superfície SaaS (/orgs, /billing, /open-finance) ficava de fora justamente
 * para quem fosse integrar. Documentação que ninguém verifica envelhece por
 * padrão — então aqui a lista é derivada do fonte, e um teste compara as duas.
 *
 * Deliberadamente ingênuo: casa `router.<método>('<caminho>')` por regex, sem
 * executar o backend. Executar exigiria Prisma gerado e um banco, o que
 * transformaria uma checagem de documentação num teste de integração.
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROUTES_DIR = join(__dirname, '..', '..', 'backend', 'routes');

/** `/orgs/:orgId/members/:userId` → `/orgs/{orgId}/members/{userId}` */
export function paraOpenApi(caminho) {
  return caminho.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

export function listarRotas() {
  const index = readFileSync(join(ROUTES_DIR, 'index.js'), 'utf8');

  const arquivoDe = {};
  for (const m of index.matchAll(/import\s+(\w+)\s+from\s+'\.\/([\w-]+)\.js'/g)) {
    arquivoDe[m[1]] = m[2];
  }

  const rotas = [];
  const coletar = (arquivo, base) => {
    const src = readFileSync(join(ROUTES_DIR, `${arquivo}.js`), 'utf8');
    for (const m of src.matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']*)'/g)) {
      const sufixo = m[2] === '/' ? '' : m[2];
      rotas.push({ method: m[1].toUpperCase(), path: paraOpenApi(base + sufixo) });
    }
  };

  for (const m of index.matchAll(/router\.use\('([^']+)',\s*(\w+)\)/g)) {
    const arquivo = arquivoDe[m[2]];
    if (arquivo) coletar(arquivo, m[1]);
  }

  // health.js é montado na raiz (fora de /api/v1), mas faz parte da superfície
  // pública e precisa aparecer na referência.
  coletar('health', '');

  rotas.sort((a, b) => (a.path + a.method).localeCompare(b.path + b.method));
  return rotas;
}

export default listarRotas;
