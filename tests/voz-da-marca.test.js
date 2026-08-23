/**
 * voz-da-marca.test.js — trava as regras de voz nas mensagens de interface.
 *
 * A auditoria de marca extraiu as 98 mensagens passadas a UTILS.mostrarToast e
 * encontrou vários autores em vez de uma voz: 21 delas terminavam em exclamação
 * sem regra nenhuma ("Conta adicionada!" ao lado de "Conta removida"), sete
 * abriam com a palavra "Erro" sem dizer o que fazer, e uma trazia jargão de
 * desenvolvedor para a tela ("Parser não disponível"). Isso não é falta de
 * polimento: é ausência de personalidade, que era justamente o diagnóstico.
 *
 * Estes testes existem para que a próxima mensagem escrita com pressa seja
 * reprovada no CI e não na tela do usuário.
 */
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');

function arquivosJs(dir) {
  const saida = [];
  for (const nome of fs.readdirSync(dir)) {
    const p = path.join(dir, nome);
    if (fs.statSync(p).isDirectory()) saida.push(...arquivosJs(p));
    else if (nome.endsWith('.js') && !p.includes(`${path.sep}vendor${path.sep}`)) saida.push(p);
  }
  return saida;
}

/** Toda chamada a mostrarToast com texto literal, com arquivo e linha. */
function mensagens() {
  const re = /mostrarToast\(\s*'((?:[^'\\]|\\.)*)'/g;
  const saida = [];
  for (const arquivo of arquivosJs(path.join(raiz, 'js'))) {
    const fonte = fs.readFileSync(arquivo, 'utf8');
    let m;
    while ((m = re.exec(fonte)) !== null) {
      saida.push({
        texto: m[1],
        onde: `${path.relative(raiz, arquivo)}:${fonte.slice(0, m.index).split('\n').length}`,
      });
    }
  }
  return saida;
}

const TODAS = mensagens();

describe('voz da marca nas mensagens de interface', function() {
  test('existem mensagens para verificar', function() {
    expect(TODAS.length).toBeGreaterThan(80);
  });

  test('nenhuma mensagem termina em exclamação', function() {
    // Salvar uma conta não é uma conquista. A marca informa, não comemora —
    // e comemorar em metade dos casos e não na outra é o que soa desatento.
    const ruins = TODAS.filter((m) => m.texto.trim().endsWith('!'));
    expect(ruins.map((m) => `${m.onde} → ${m.texto}`)).toEqual([]);
  });

  test('nenhuma mensagem abre com "Erro" ou "Falha"', function() {
    // Mensagem de falha diz o que NÃO aconteceu e o que fazer. Abrir com
    // "Erro" gasta a confiança do usuário sem entregar informação nenhuma.
    const ruins = TODAS.filter((m) => /^(Erro|Falha|Inválido)\b/i.test(m.texto.trim()));
    expect(ruins.map((m) => `${m.onde} → ${m.texto}`)).toEqual([]);
  });

  test('nenhuma mensagem usa jargão de desenvolvedor', function() {
    const jargao = /\b(parser|cache|token|payload|null|undefined|stack|timeout|fetch)\b/i;
    const ruins = TODAS.filter((m) => jargao.test(m.texto));
    expect(ruins.map((m) => `${m.onde} → ${m.texto}`)).toEqual([]);
  });

  test('nenhuma mensagem usa "com sucesso"', function() {
    // Redundante: se a mensagem está aparecendo, deu certo. E aparecia em
    // umas e não em outras, o que era a incoerência visível ao usuário.
    const ruins = TODAS.filter((m) => /com sucesso/i.test(m.texto));
    expect(ruins.map((m) => `${m.onde} → ${m.texto}`)).toEqual([]);
  });

  test('nenhuma mensagem tem palavra sem acento que deveria ter', function() {
    // "Orcamentos definidos com sucesso!" chegou à tela de um app que cobra
    // assinatura. Num produto que pede confiança para guardar a vida
    // financeira do usuário, um erro de ortografia custa desproporcionalmente.
    const suspeitas = /\b(orcamento|orcamentos|transacao|transacoes|nao|voce|codigo|periodo|sera|ja)\b/i;
    const ruins = TODAS.filter((m) => suspeitas.test(m.texto));
    expect(ruins.map((m) => `${m.onde} → ${m.texto}`)).toEqual([]);
  });
});
