/**
 * auditorias-indice.test.js — as auditorias ficam juntas e indexadas.
 *
 * Eram 74 relatórios soltos em docs/, mais um na raiz, e seis atalhos .bat/.cmd
 * na raiz (achado B3 da auditoria de 27/09). Agora moram em docs/auditorias/
 * e scripts/windows/. Sem trava, o próximo relatório nasce de novo em docs/ e
 * o índice envelhece sem ninguém notar.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { listar } = require('../scripts/gerar-indice-auditorias.cjs');

const ROOT = path.join(__dirname, '..');

describe('docs/auditorias', () => {
  test('o índice (index.html e README.md) está em dia', () => {
    const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'gerar-indice-auditorias.cjs'), '--check'], { encoding: 'utf8' });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });

  test('todo relatório da pasta aparece no índice, com título', () => {
    const itens = listar();
    expect(itens.length).toBeGreaterThan(70);
    const indice = fs.readFileSync(path.join(ROOT, 'docs', 'auditorias', 'index.html'), 'utf8');
    itens.forEach((i) => {
      expect(i.titulo).not.toBe(i.arquivo);
      expect(indice).toContain('href="' + encodeURI(i.arquivo) + '"');
    });
  });

  test('nenhuma auditoria solta em docs/ ou na raiz', () => {
    const soltas = (dir) => fs.readdirSync(path.join(ROOT, dir)).filter((f) => /^auditoria.*\.(html|md)$/i.test(f));
    expect(soltas('.')).toEqual([]);
    expect(soltas('docs')).toEqual([]);
    expect(fs.existsSync(path.join(ROOT, 'docs', 'audit-runs'))).toBe(false);
  });

  test('os scripts de auditoria gravam em docs/auditorias/execucoes/', () => {
    ['auditoria-massiva-usuarios.cjs', 'auditoria-usuarios-virtuais.cjs', 'auditoria-verificacao-fixes.cjs'].forEach((f) => {
      const src = fs.readFileSync(path.join(ROOT, 'scripts', f), 'utf8');
      expect(src).toContain("path.join(ROOT, 'docs', 'auditorias', 'execucoes')");
    });
  });
});

describe('atalhos do Windows', () => {
  test('moram em scripts/windows/, não na raiz', () => {
    expect(fs.readdirSync(ROOT).filter((f) => /\.(bat|cmd)$/i.test(f))).toEqual([]);
    expect(fs.readdirSync(path.join(ROOT, 'scripts', 'windows')).filter((f) => /\.(bat|cmd)$/i.test(f)).length).toBeGreaterThan(0);
  });

  test('cada atalho sobe para a raiz do repositório antes de rodar', () => {
    const pasta = path.join(ROOT, 'scripts', 'windows');
    fs.readdirSync(pasta).filter((f) => /\.(bat|cmd)$/i.test(f)).forEach((f) => {
      const src = fs.readFileSync(path.join(pasta, f), 'utf8');
      expect(src).toMatch(/^cd \/d "%~dp0\.\.\\\.\."\r?$/m);
      // Os caminhos que o atalho abre existem a partir da raiz.
      [...src.matchAll(/"(docs\\[^"]+|scripts\\[^"%]+)"/g)].forEach((m) => {
        const alvo = m[1].split(' ')[0].replace(/\\/g, '/');
        expect(fs.existsSync(path.join(ROOT, alvo))).toBe(true);
      });
    });
  });
});
