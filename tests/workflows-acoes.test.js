/**
 * workflows-acoes.test.js — toda ação dos workflows fixada por SHA de commit.
 *
 * Achado B2 da reauditoria de 30/09: o release passava a conta de serviço da
 * Play para `r0adkll/upload-google-play@v1`, uma tag que o dono da ação pode
 * mover para qualquer commit. Fixar por SHA faz o código que roda com os
 * segredos ser exatamente o que foi revisado. O comentário com a versão fica
 * para quem atualiza saber de onde partir.
 *
 * O mesmo achado apontou ações ainda em Node 20 (checkout/setup-node v4),
 * que o GitHub já força para Node 24 com aviso: a lista de versões mínimas
 * abaixo impede voltar para elas.
 */
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', '.github', 'workflows');
const arquivos = fs.readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f));

function usos() {
  const lista = [];
  arquivos.forEach((arq) => {
    fs.readFileSync(path.join(DIR, arq), 'utf8').split('\n').forEach((linha, i) => {
      const m = linha.match(/^\s*(?:-\s+)?uses:\s*(\S+)(.*)$/);
      if (m) lista.push({ onde: arq + ':' + (i + 1), ref: m[1], resto: m[2].trim() });
    });
  });
  return lista;
}

// Major mínima de cada ação (a primeira que roda em Node 24).
const MINIMAS = {
  'actions/checkout': 5,
  'actions/setup-node': 5,
  'actions/setup-java': 5,
  'actions/upload-artifact': 6,
  'docker/setup-buildx-action': 4,
  'docker/build-push-action': 7,
};

describe('ações dos workflows', () => {
  const todos = usos();

  test('há ações para conferir (o parser não quebrou)', () => {
    expect(todos.length).toBeGreaterThan(10);
  });

  test('toda ação é fixada por SHA de 40 caracteres, com a versão em comentário', () => {
    const soltas = todos.filter((u) => !/@[0-9a-f]{40}$/.test(u.ref) || !/^# v\d+(\.\d+)*$/.test(u.resto));
    expect(soltas.map((u) => u.onde + ' ' + u.ref + ' ' + u.resto)).toEqual([]);
  });

  test('nenhuma ação volta para uma major que roda em Node 20', () => {
    const velhas = todos.filter((u) => {
      const nome = u.ref.split('@')[0];
      const major = Number((u.resto.match(/^# v(\d+)/) || [])[1]);
      return MINIMAS[nome] && major < MINIMAS[nome];
    });
    expect(velhas.map((u) => u.onde + ' ' + u.ref + ' ' + u.resto)).toEqual([]);
  });

  test('a ação de terceiro que recebe a conta de serviço da Play está fixada', () => {
    const play = todos.filter((u) => u.ref.startsWith('r0adkll/upload-google-play@'));
    expect(play).toHaveLength(1);
    expect(play[0].ref).toMatch(/@[0-9a-f]{40}$/);
  });
});
