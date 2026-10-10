/**
 * docs-caminhos.test.js — a documentação principal não cita arquivo que sumiu.
 *
 * A auditoria de 27/09 (B3) achou o doc de arquitetura descrevendo
 * js/state.js e js/automacao.js, que não existiam mais. Um doc que mente sobre
 * a estrutura é pior que doc nenhum: quem chega segue a pista errada.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DOCS = ['README.md', 'CONTRIBUTING.md', 'docs/ARQUITETURA_SAAS.md'];

test.each(DOCS)('%s: todo caminho citado em `crase` existe', (doc) => {
  const texto = fs.readFileSync(path.join(ROOT, doc), 'utf8');
  const caminhos = [...texto.matchAll(/`([A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+)`/g)]
    .map((m) => m[1])
    // Padrões (<chunk>, *.js) e URLs não são caminhos concretos.
    .filter((c) => !/[<>*]/.test(c) && !/^https?:/.test(c));
  expect(caminhos.length).toBeGreaterThan(0);
  expect(caminhos.filter((c) => !fs.existsSync(path.join(ROOT, c.replace(/\/$/, ''))))).toEqual([]);
});

describe('supabase/README.md', () => {
  // Achado 6 da auditoria do servidor (09/10): o README falava em 4 arquivos de
  // teste quando eram 12, e listava como pendente o que já existia.
  const readme = fs.readFileSync(path.join(ROOT, 'supabase/README.md'), 'utf8');

  test('cita cada arquivo de teste pgTAP de supabase/tests/', () => {
    const arquivos = fs.readdirSync(path.join(ROOT, 'supabase/tests')).filter((f) => f.endsWith('.test.sql'));
    expect(arquivos.length).toBeGreaterThan(0);
    expect(arquivos.filter((f) => !readme.includes('`' + f + '`'))).toEqual([]);
  });

  test('todo caminho citado em `crase` existe', () => {
    const caminhos = [...readme.matchAll(/`([A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+)`/g)].map((m) => m[1]);
    expect(caminhos.filter((c) => !fs.existsSync(path.join(ROOT, c.replace(/\/$/, ''))))).toEqual([]);
  });
});

describe('supabase/EXECUCAO.md', () => {
  const roteiro = fs.readFileSync(path.join(ROOT, 'supabase/EXECUCAO.md'), 'utf8');

  test('não manda aplicar migração com psql (o db push seguinte quebra)', () => {
    expect(roteiro).not.toMatch(/psql[^\n]*supabase\/migrations\//);
  });

  test('não manda pôr segredo na URL da Play (play-rtdn recusa ?secret=)', () => {
    expect(roteiro).not.toMatch(/play-rtdn\?secret=/);
  });

  test('todo caminho citado em `crase` existe', () => {
    const caminhos = [...roteiro.matchAll(/`([A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+)`/g)].map((m) => m[1])
      .filter((c) => !/[<>*]/.test(c) && !/^https?:/.test(c));
    expect(caminhos.filter((c) => !fs.existsSync(path.join(ROOT, c.replace(/\/$/, ''))))).toEqual([]);
  });
});
