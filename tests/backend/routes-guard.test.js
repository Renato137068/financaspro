/**
 * routes-guard.test.js — verificação estática das rotas do backend.
 *
 * Testes de comportamento provam que validateParams funciona; este prova que
 * ninguém *esqueceu* de usá-lo. É a diferença entre corrigir 29 rotas hoje e
 * garantir que a rota nº 30, escrita daqui a três meses, nasça protegida.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROUTES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'backend', 'routes');
const files = fs.readdirSync(ROUTES_DIR).filter(f => f.endsWith('.js') && f !== 'index.js');

/** Extrai as declarações de rota de um arquivo, com o trecho de middlewares. */
function parseRoutes(src, file) {
  const re = /router\.(get|post|put|patch|delete)\(\s*('[^']*')\s*,([\s\S]*?)(?:asyncHandler|async\s*\(|\(req|function)/g;
  const out = [];
  let m;
  while ((m = re.exec(src))) {
    out.push({ file, method: m[1], path: m[2], middlewares: m[3] });
  }
  return out;
}

const allRoutes = files.flatMap(f => parseRoutes(fs.readFileSync(path.join(ROUTES_DIR, f), 'utf8'), f));

describe('rotas — validação de path params', () => {
  test('o parser encontrou rotas (guarda contra teste vazio silencioso)', () => {
    expect(allRoutes.length).toBeGreaterThan(20);
  });

  test('toda rota com path param declara validateParams', () => {
    const semValidacao = allRoutes
      .filter(r => /:\w+/.test(r.path))
      .filter(r => !r.middlewares.includes('validateParams'))
      .map(r => `${r.method.toUpperCase()} ${r.path} (${r.file})`);

    expect(semValidacao).toEqual([]);
  });

  test('validateParams vem antes de qualquer middleware que leia o param', () => {
    // resolveOrg/requireOrgRole consultam o banco usando req.params.orgId.
    // Se rodarem antes da validação, um orgId inválido vira erro do Prisma.
    const foraDeOrdem = allRoutes
      .filter(r => r.middlewares.includes('validateParams') && r.middlewares.includes('resolveOrg'))
      .filter(r => r.middlewares.indexOf('validateParams') > r.middlewares.indexOf('resolveOrg'))
      .map(r => `${r.method.toUpperCase()} ${r.path} (${r.file})`);

    expect(foraDeOrdem).toEqual([]);
  });
});

describe('rotas — proteção por autenticação', () => {
  test('todo arquivo de rota aplica authenticate ou justifica a exceção', () => {
    // health e billing (webhook Stripe) são públicos por design.
    const PUBLICAS = new Set(['health.js']);

    const desprotegidas = files
      .filter(f => !PUBLICAS.has(f))
      .filter(f => {
        const src = fs.readFileSync(path.join(ROUTES_DIR, f), 'utf8');
        return !src.includes('authenticate');
      });

    expect(desprotegidas).toEqual([]);
  });
});

describe('rotas — tratamento de erro assíncrono', () => {
  test('handlers async usam asyncHandler ou encaminham para next', () => {
    // Um `async (req,res) => { throw }` sem asyncHandler vira unhandledRejection
    // e o server.js responde a isso derrubando o processo.
    const suspeitas = [];

    for (const file of files) {
      const src = fs.readFileSync(path.join(ROUTES_DIR, file), 'utf8');
      const re = /router\.(?:get|post|put|patch|delete)\(([\s\S]*?)\n\}\)\);/g;
      let m;
      while ((m = re.exec(src))) {
        const bloco = m[1];
        const temAsync = /async\s*\(/.test(bloco);
        const protegido = bloco.includes('asyncHandler') || /catch\s*\(|next\)/.test(bloco);
        if (temAsync && !protegido) {
          suspeitas.push(`${file}: ${bloco.slice(0, 60).replace(/\s+/g, ' ')}`);
        }
      }
    }

    expect(suspeitas).toEqual([]);
  });
});
