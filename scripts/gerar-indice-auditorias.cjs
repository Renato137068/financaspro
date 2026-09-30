#!/usr/bin/env node
/**
 * gerar-indice-auditorias.cjs — índice de docs/auditorias/.
 *
 * As auditorias ficam juntas em docs/auditorias/ (antes eram 74 arquivos
 * soltos em docs/, mais um na raiz). Este script lista cada uma com data e
 * título, da mais recente para a mais antiga, em dois formatos:
 *   - index.html: abre offline, sem Node (scripts/windows/abrir-auditoria.bat);
 *   - README.md: o que o GitHub mostra ao abrir a pasta.
 *
 * Data: a do nome do arquivo (AAAA-MM-DD ou AAAA-MM); sem ela, a do <title>
 * (DD/MM/AAAA). Título: o <title> do HTML ou o primeiro "# " do Markdown.
 *
 *   node scripts/gerar-indice-auditorias.cjs          # regrava o índice
 *   node scripts/gerar-indice-auditorias.cjs --check  # falha se estiver defasado
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PASTA = path.join(ROOT, 'docs', 'auditorias');
const GERADOS = ['index.html', 'README.md'];

function decodificar(texto) {
  const nomeadas = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', middot: '·' };
  return texto
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => (n.toLowerCase() in nomeadas ? nomeadas[n.toLowerCase()] : m));
}

function tituloDe(arquivo, conteudo) {
  if (arquivo.endsWith('.md')) {
    const m = conteudo.match(/^#\s+(.+)$/m);
    return m ? m[1].trim() : arquivo;
  }
  const m = conteudo.match(/<title>([\s\S]*?)<\/title>/i);
  return m ? decodificar(m[1]).replace(/\s+/g, ' ').trim() : arquivo;
}

function dataDe(arquivo, titulo) {
  let m = arquivo.match(/(20\d\d)-(\d\d)-(\d\d)/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = titulo.match(/(\d\d)\/(\d\d)\/(20\d\d)/);
  if (m) return m[3] + '-' + m[2] + '-' + m[1];
  m = arquivo.match(/(20\d\d)-(\d\d)/);
  if (m) return m[1] + '-' + m[2];
  return '';
}

function listar() {
  return fs.readdirSync(PASTA)
    .filter((f) => /\.(html|md)$/.test(f) && !GERADOS.includes(f))
    .map((arquivo) => {
      const titulo = tituloDe(arquivo, fs.readFileSync(path.join(PASTA, arquivo), 'utf8'));
      return { arquivo, titulo, data: dataDe(arquivo, titulo) };
    })
    // Mais recente primeiro; sem data no fim, em ordem de nome.
    .sort((a, b) => (b.data || '').localeCompare(a.data || '') || a.arquivo.localeCompare(b.arquivo));
}

function dataLegivel(data) {
  if (!data) return 'sem data';
  const [a, m, d] = data.split('-');
  return d ? d + '/' + m + '/' + a : m + '/' + a;
}

function escapar(texto) {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function gerarHtml(itens) {
  const linhas = itens.map((i) => '      <li><time>' + dataLegivel(i.data) + '</time> <a href="'
    + encodeURI(i.arquivo) + '">' + escapar(i.titulo) + '</a></li>');
  return [
    '<!doctype html>',
    '<!-- GERADO por scripts/gerar-indice-auditorias.cjs — não edite à mão. -->',
    '<html lang="pt-BR">',
    '<head>',
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    '  <title>Auditorias do FinançasPro</title>',
    '  <style>',
    '    :root { --fundo: #f6f8f7; --texto: #10231a; --suave: #5b6b63; --link: #00723f; --linha: #dce7e1; }',
    '    @media (prefers-color-scheme: dark) {',
    '      :root { --fundo: #0f1714; --texto: #e6eee9; --suave: #9fb2a8; --link: #5fd39a; --linha: #24322b; }',
    '    }',
    '    body { margin: 0; background: var(--fundo); color: var(--texto); font: 16px/1.6 system-ui, sans-serif; }',
    '    main { max-width: 860px; margin: 0 auto; padding: 32px 16px; }',
    '    h1 { font-size: 1.6rem; margin: 0 0 4px; }',
    '    p { color: var(--suave); margin: 0 0 24px; }',
    '    ul { list-style: none; padding: 0; margin: 0; }',
    '    li { padding: 10px 0; border-top: 1px solid var(--linha); display: flex; gap: 16px; }',
    '    time { color: var(--suave); min-width: 96px; font-variant-numeric: tabular-nums; }',
    '    a { color: var(--link); }',
    '  </style>',
    '</head>',
    '<body>',
    '  <main>',
    '    <h1>Auditorias do FinançasPro</h1>',
    '    <p>' + itens.length + ' relatórios, do mais recente ao mais antigo. As execuções automáticas (JSON) estão em <a href="execucoes/">execucoes/</a>.</p>',
    '    <ul>',
    ...linhas,
    '    </ul>',
    '  </main>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

function gerarMarkdown(itens) {
  return [
    '<!-- GERADO por scripts/gerar-indice-auditorias.cjs — não edite à mão. -->',
    '# Auditorias do FinançasPro',
    '',
    itens.length + ' relatórios, do mais recente ao mais antigo. As execuções automáticas '
      + '(JSON e Markdown dos scripts `scripts/auditoria-*.cjs`) ficam em [`execucoes/`](execucoes/).',
    '',
    '| Data | Relatório |',
    '|---|---|',
    ...itens.map((i) => '| ' + dataLegivel(i.data) + ' | [' + i.titulo.replace(/\|/g, '\\|') + '](' + encodeURI(i.arquivo) + ') |'),
    '',
  ].join('\n');
}

function esperado() {
  const itens = listar();
  return { 'index.html': gerarHtml(itens), 'README.md': gerarMarkdown(itens) };
}

if (require.main === module) {
  const saida = esperado();
  if (process.argv.includes('--check')) {
    const defasados = Object.keys(saida).filter((f) => {
      const p = path.join(PASTA, f);
      return !fs.existsSync(p) || fs.readFileSync(p, 'utf8') !== saida[f];
    });
    if (defasados.length) {
      console.error('[auditorias] índice defasado: ' + defasados.join(', '));
      console.error('              Rode: npm run auditorias:indice');
      process.exit(1);
    }
    console.log('[auditorias] ✓ índice em dia');
  } else {
    for (const [f, conteudo] of Object.entries(saida)) fs.writeFileSync(path.join(PASTA, f), conteudo);
    console.log('[auditorias] índice gravado: ' + listar().length + ' relatórios');
  }
}

module.exports = { listar, dataDe, tituloDe };
