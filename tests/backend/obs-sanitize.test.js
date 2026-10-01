/**
 * obs-sanitize.test.js — o relatório de erro que chega à Edge Function
 * obs-ingest sai dela sem dado pessoal nem financeiro.
 */
import {
  sanitizarRelatorio, mascararTexto, CHAVES_CONTEXTO, LIMITE_CORPO, versaoDaSessao,
} from '../../supabase/functions/_shared/obs-sanitize.js';

function relatorio(data, extra = {}) {
  return { kind: 'error', ts: '2026-09-27T12:00:00Z', url: '/', app: '11.3.18', data, ...extra };
}

describe('obs-sanitize — mascararTexto', () => {
  test('troca e-mail, valor em reais e números longos', () => {
    expect(mascararTexto('falha para ana.silva@exemplo.com.br')).toBe('falha para [email]');
    expect(mascararTexto('saldo R$ 1.234,56 insuficiente')).toBe('saldo [valor] insuficiente');
    expect(mascararTexto('conta 123456789 não encontrada')).toBe('conta [n] não encontrada');
  });

  test('mantém números curtos (posição, status HTTP)', () => {
    expect(mascararTexto('Unexpected token } in JSON at position 42')).toBe('Unexpected token } in JSON at position 42');
    expect(mascararTexto('HTTP 503')).toBe('HTTP 503');
  });
});

describe('obs-sanitize — sanitizarRelatorio', () => {
  test('relatório válido vira linha com os campos esperados', () => {
    const linha = sanitizarRelatorio(
      relatorio({ message: 'x is undefined', stack: 'TypeError\n at a (app.bundle.js:1:123456)', context: { contexto: 'render:resumo' } },
        { url: '/index.html?token=abc#extrato' }),
      'Mozilla/5.0 (Linux; Android 14)',
    );
    expect(linha).toEqual({
      kind: 'error',
      message: 'x is undefined',
      stack: 'TypeError\n at a (app.bundle.js:1:123456)',
      contexto: { contexto: 'render:resumo' },
      path: '/index.html',
      app_version: '11.3.18',
      user_agent: 'Mozilla/5.0 (Linux; Android 14)',
    });
  });

  test('a pilha mantém linha:coluna do bundle, mas perde e-mail', () => {
    const linha = sanitizarRelatorio(relatorio({
      message: 'erro', stack: 'Error: a@b.com\n at f (app.bundle.js:1:654321)',
    }), null);
    expect(linha.stack).toBe('Error: [email]\n at f (app.bundle.js:1:654321)');
  });

  test('contexto só leva chaves da allowlist', () => {
    const linha = sanitizarRelatorio(relatorio({
      message: 'erro',
      context: {
        contexto: 'RECORRENTES.processar', recorrenteId: 'rec-9f2c', valor: 199.9,
        descricao: 'Aluguel', line: 12, src: 'https://app.financaspro.com/js/app.bundle.js?v=3',
      },
    }), null);
    expect(linha.contexto).toEqual({
      contexto: 'RECORRENTES.processar', line: 12, src: 'https://app.financaspro.com/js/app.bundle.js',
    });
    expect(CHAVES_CONTEXTO).not.toContain('recorrenteId');
  });

  test('corta mensagem, pilha e user-agent', () => {
    const linha = sanitizarRelatorio(relatorio({
      message: 'm'.repeat(1000),
      stack: Array.from({ length: 30 }, (_, i) => 'linha ' + i).join('\n'),
    }), 'u'.repeat(500));
    expect(linha.message).toHaveLength(300);
    expect(linha.stack.split('\n')).toHaveLength(8);
    expect(linha.user_agent).toHaveLength(200);
  });

  test('recusa evento de analytics, corpo sem mensagem e lixo', () => {
    expect(sanitizarRelatorio({ kind: 'event', data: { name: 'primeiro_lancamento' } }, null)).toBeNull();
    expect(sanitizarRelatorio(relatorio({ message: '   ' }), null)).toBeNull();
    expect(sanitizarRelatorio(relatorio({ message: 42 }), null)).toBeNull();
    expect(sanitizarRelatorio(null, null)).toBeNull();
    expect(sanitizarRelatorio('texto', null)).toBeNull();
  });

  test('limite de corpo é de 8 KB', () => {
    expect(LIMITE_CORPO).toBe(8192);
  });
});

describe('obs-sanitize — versaoDaSessao (contagem de uso anônima)', () => {
  test('aviso de uso válido devolve só a versão', () => {
    expect(versaoDaSessao({ kind: 'sessao', app: '11.3.18' })).toBe('11.3.18');
  });

  test('o que vier a mais no aviso não sai daqui: só a versão é lida', () => {
    const extra = { kind: 'sessao', app: '11.3.18', userId: 'u_1', email: 'a@b.com', data: { saldo: 1234 } };
    expect(versaoDaSessao(extra)).toBe('11.3.18');
  });

  test('versão fora de X.Y.Z, sem versão ou outro kind é recusado', () => {
    expect(versaoDaSessao({ kind: 'sessao', app: 'v11' })).toBeNull();
    expect(versaoDaSessao({ kind: 'sessao', app: '11.3.18; drop table' })).toBeNull();
    expect(versaoDaSessao({ kind: 'sessao', app: 11 })).toBeNull();
    expect(versaoDaSessao({ kind: 'sessao' })).toBeNull();
    expect(versaoDaSessao({ kind: 'error', app: '11.3.18' })).toBeNull();
    expect(versaoDaSessao(null)).toBeNull();
  });

  test('um aviso de uso não passa como relatório de erro (e vice-versa)', () => {
    expect(sanitizarRelatorio({ kind: 'sessao', app: '11.3.18' }, null)).toBeNull();
    expect(versaoDaSessao(relatorio({ message: 'x' }))).toBeNull();
  });
});
