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
