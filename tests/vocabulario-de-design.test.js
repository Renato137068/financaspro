/**
 * vocabulario-de-design.test.js — o sistema nomeia por função, não por aspiração.
 *
 * O projeto tinha 358 ocorrências de uma palavra de aspiração em nomes de
 * classe, tokens e comentários. O problema não é a palavra em si: é o que ela
 * permite. Como ela não descreve nada verificável, cada componente pôde ganhar
 * uma segunda versão ao lado da primeira — `.orc-header` e a variante sufixada,
 * `.extrato-item` e a variante sufixada — e ninguém apagou a primeira. Ao
 * remover o sufixo apareceram 43 regras mortas e uma colisão real que mudou o
 * visual de um cartão.
 *
 * A palavra continua permitida onde é vocabulário de PRODUTO: o nome do plano
 * que o usuário vê, e nomes de serviços de terceiros.
 *
 * Nota de implementação: a palavra proibida é montada por código, nunca escrita
 * literalmente. Uma varredura automática que removesse a palavra do projeto
 * inteiro danificaria este arquivo se ela estivesse aqui — foi exatamente o que
 * aconteceu na primeira tentativa, e o teste virou um arquivo com erro de
 * sintaxe em vez de uma regra.
 */
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const PROIBIDA = ['pre', 'mium'].join('');

const PULAR = new Set(['node_modules', '.git', 'dist', 'docs', '_to_delete', '.aud',
  'test-results', 'playwright-report', 'screenshots', 'coverage', 'android', 'backend']);

function varrer(dir) {
  const saida = [];
  for (const nome of fs.readdirSync(dir)) {
    if (PULAR.has(nome)) continue;
    const p = path.join(dir, nome);
    if (fs.statSync(p).isDirectory()) saida.push(...varrer(p));
    else if (['.css', '.js', '.html'].includes(path.extname(nome))) saida.push(p);
  }
  return saida;
}

/** Vocabulário de produto e de terceiros — legítimo, fica. */
const PERMITIDO = new RegExp([
  'perfil-avatar-badge--' + PROIBIDA,   // modificador do PLANO
  "'" + PROIBIDA + "'",                  // comparação com o tier vindo da API
  'youtube ' + PROIBIDA,                 // serviço de terceiro
  'Recursos ' + PROIBIDA + ' na nuvem',  // comentário sobre o plano
  "label: 'Premium'",                    // rótulo do plano na interface
].join('|'), 'i');

/** Comentários que EXPLICAM a renomeação precisam poder citar o nome antigo. */
const HISTORICO = new RegExp([
  PROIBIDA + '\\.css', '-\\*-' + PROIBIDA, 'fase "' + PROIBIDA + '"',
  'se chamava', 'sufixo "' + PROIBIDA + '"', 'variantes "-' + PROIBIDA + '"',
  'o ' + PROIBIDA + ' ou o normal', 'palavra proibida', 'a palavra de aspiração',
].join('|'), 'i');

const ARQUIVOS = varrer(raiz).filter(function(p) {
  var base = path.basename(p);
  if (base === path.basename(__filename)) return false;
  if (base === 'auditoria-produto-pos-fases.html') return false;
  return true;
});

describe('nenhum nome descreve aspiração em vez de função', function() {
  test('varreu uma quantidade plausível de arquivos', function() {
    expect(ARQUIVOS.length).toBeGreaterThan(100);
  });

  test('a palavra de aspiração não voltou como vocabulário de design', function() {
    const re = new RegExp(PROIBIDA, 'i');
    const achados = [];
    for (const arquivo of ARQUIVOS) {
      fs.readFileSync(arquivo, 'utf8').split('\n').forEach((linha, i) => {
        if (!re.test(linha)) return;
        if (PERMITIDO.test(linha) || HISTORICO.test(linha)) return;
        achados.push(`${path.relative(raiz, arquivo)}:${i + 1} → ${linha.trim().slice(0, 72)}`);
      });
    }
    expect(achados).toEqual([]);
  });

  test('nenhuma classe termina com o sufixo de aspiração', function() {
    // classe-<palavra>, mas não o modificador de plano classe--<palavra>
    const re = new RegExp('(?<![-a-z0-9])((?:[a-z0-9]+-)+)' + PROIBIDA + '(?![a-z0-9])', 'gi');
    const achados = [];
    for (const arquivo of ARQUIVOS) {
      const fonte = fs.readFileSync(arquivo, 'utf8');
      for (const m of fonte.matchAll(re)) {
        if (m[1].endsWith('--')) continue;
        const linha = fonte.slice(0, m.index).split('\n').length;
        if (HISTORICO.test(fonte.split('\n')[linha - 1] || '')) continue;
        achados.push(`${path.relative(raiz, arquivo)}:${linha} → ${m[0]}`);
      }
    }
    expect(achados).toEqual([]);
  });
});
