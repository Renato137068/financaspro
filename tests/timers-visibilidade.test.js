/**
 * timers-visibilidade.test.js — o app trabalha quando ninguém está olhando?
 *
 * Origem: a auditoria de dimensões ocultas contou 4 timers periódicos (sync a
 * cada 15s, autosave a cada 30s, alertas e cache a cada 5min) e ZERO
 * ocorrências de `visibilitychange` em todo o frontend.
 *
 * Num PWA instalado no celular, isso é bateria gasta recalculando uma tela que
 * ninguém está vendo. O custo não aparece em métrica de produto nenhuma — só
 * na estimativa de uso do sistema operacional, onde o usuário lê o nome do app
 * ao lado de um número e desinstala.
 *
 * Limite honesto: aqui se verifica que os timers param e voltam, não quanto de
 * bateria isso economiza. Medir consumo real exige aparelho físico.
 */
const path = require('path');
const fs = require('fs');
const { loadCoreModules } = require('./load-sources');

loadCoreModules();

const U = () => global.UTILS;

/** Coloca o documento em um estado de visibilidade e dispara o evento. */
function visibilidade(estado) {
  Object.defineProperty(document, 'visibilityState', {
    value: estado, configurable: true,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  jest.useFakeTimers();
  visibilidade('visible');
});

afterEach(() => {
  jest.useRealTimers();
});

describe('UTILS.intervaloVisivel', () => {
  test('executa normalmente com a aba visível', () => {
    const fn = jest.fn();
    const t = U().intervaloVisivel(fn, 1000);

    jest.advanceTimersByTime(3000);

    expect(fn).toHaveBeenCalledTimes(3);
    t.parar();
  });

  test('para de executar quando a aba some', () => {
    const fn = jest.fn();
    const t = U().intervaloVisivel(fn, 1000);

    jest.advanceTimersByTime(2000);
    expect(fn).toHaveBeenCalledTimes(2);

    visibilidade('hidden');
    jest.advanceTimersByTime(10000);

    expect(fn).toHaveBeenCalledTimes(2);
    t.parar();
  });

  test('ao voltar, atualiza imediatamente em vez de esperar o ciclo', () => {
    // Sem isto, quem volta para a aba veria estado velho por até um período
    // inteiro — e "pausei para economizar" viraria "o app estava desatualizado".
    const fn = jest.fn();
    const t = U().intervaloVisivel(fn, 60000);

    visibilidade('hidden');
    jest.advanceTimersByTime(120000);
    expect(fn).toHaveBeenCalledTimes(0);

    visibilidade('visible');
    expect(fn).toHaveBeenCalledTimes(1);   // já, sem avançar o relógio

    t.parar();
  });

  test('o ciclo é retomado depois de voltar', () => {
    const fn = jest.fn();
    const t = U().intervaloVisivel(fn, 1000);

    visibilidade('hidden');
    visibilidade('visible');               // +1 (imediato)
    jest.advanceTimersByTime(2000);        // +2

    expect(fn).toHaveBeenCalledTimes(3);
    t.parar();
  });

  test('ficar visível duas vezes seguidas não duplica o timer', () => {
    // Dois intervals no mesmo callback dobrariam o trabalho em silêncio.
    const fn = jest.fn();
    const t = U().intervaloVisivel(fn, 1000);

    visibilidade('visible');
    visibilidade('visible');
    fn.mockClear();

    jest.advanceTimersByTime(1000);

    expect(fn).toHaveBeenCalledTimes(1);
    t.parar();
  });

  test('erro no callback ao voltar não impede a retomada', () => {
    let chamadas = 0;
    const fn = jest.fn(() => {
      chamadas++;
      if (chamadas === 1) throw new Error('falha na primeira');
    });

    const t = U().intervaloVisivel(fn, 1000);
    visibilidade('hidden');
    visibilidade('visible');               // lança aqui

    jest.advanceTimersByTime(2000);

    expect(chamadas).toBeGreaterThan(1);
    t.parar();
  });

  test('parar cancela o timer e solta o listener', () => {
    const fn = jest.fn();
    const t = U().intervaloVisivel(fn, 1000);

    t.parar();
    jest.advanceTimersByTime(5000);
    visibilidade('hidden');
    visibilidade('visible');

    expect(fn).not.toHaveBeenCalled();
  });

  test('não inicia se a aba já estiver escondida na criação', () => {
    visibilidade('hidden');
    const fn = jest.fn();
    const t = U().intervaloVisivel(fn, 1000);

    jest.advanceTimersByTime(5000);

    expect(fn).not.toHaveBeenCalled();
    t.parar();
  });

  test('entrada inválida devolve um handle inerte em vez de quebrar', () => {
    expect(() => U().intervaloVisivel(null, 1000).parar()).not.toThrow();
    expect(() => U().intervaloVisivel(() => {}, 0).parar()).not.toThrow();
  });
});

// ─── autosave: o caso em que pausar não basta ────────────────────────────────
describe('APP_STORE — autosave grava ao esconder a aba', () => {
  afterEach(() => {
    if (global.APP_STORE && global.APP_STORE.stopAutoSave) global.APP_STORE.stopAutoSave();
  });

  test('persiste imediatamente quando a aba some', () => {
    // Uma aba escondida é justamente a que o sistema descarta sem avisar.
    // Só pausar o timer trocaria bateria por perda de estado.
    const store = global.APP_STORE;
    const spy = jest.spyOn(store, '_persistirUI').mockImplementation(() => {});

    store._setupAutoSave();
    spy.mockClear();

    visibilidade('hidden');

    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  test('para o ciclo depois de gravar', () => {
    const store = global.APP_STORE;
    const spy = jest.spyOn(store, '_persistirUI').mockImplementation(() => {});

    store._setupAutoSave();
    visibilidade('hidden');
    spy.mockClear();

    jest.advanceTimersByTime(120000);

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test('retoma o ciclo ao voltar', () => {
    const store = global.APP_STORE;
    const spy = jest.spyOn(store, '_persistirUI').mockImplementation(() => {});

    store._setupAutoSave();
    visibilidade('hidden');
    visibilidade('visible');
    spy.mockClear();

    jest.advanceTimersByTime(30000);

    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  test('stopAutoSave solta o listener — logout não deixa rastro', () => {
    const store = global.APP_STORE;
    const spy = jest.spyOn(store, '_persistirUI').mockImplementation(() => {});

    store._setupAutoSave();
    store.stopAutoSave();
    spy.mockClear();

    visibilidade('hidden');
    jest.advanceTimersByTime(60000);

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test('chamar _setupAutoSave duas vezes não duplica a gravação', () => {
    const store = global.APP_STORE;
    const spy = jest.spyOn(store, '_persistirUI').mockImplementation(() => {});

    store._setupAutoSave();
    store._setupAutoSave();
    spy.mockClear();

    visibilidade('hidden');

    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

// ─── guarda contra regressão ─────────────────────────────────────────────────
describe('nenhum timer periódico novo escapa da pausa', () => {
  const root = path.join(__dirname, '..');

  /** Arquivos .js da aplicação, sem vendor e sem bundles gerados. */
  function arquivosApp(dir, acc = []) {
    for (const nome of fs.readdirSync(dir)) {
      const p = path.join(dir, nome);
      if (fs.statSync(p).isDirectory()) {
        if (nome === 'vendor' || nome === 'lazy') continue;
        arquivosApp(p, acc);
      } else if (nome.endsWith('.js') && !nome.includes('.min.') && !nome.includes('.bundle.')) {
        acc.push(p);
      }
    }
    return acc;
  }

  // Timers que legitimamente usam setInterval cru, com o motivo.
  const PERMITIDOS = {
    'js/core/utils.js': 'implementa o próprio intervaloVisivel',
    'js/core/store.js': 'autosave grava ao esconder a aba em vez de só pausar',
    'js/modules/init-open-finance.js': 'poll curto de popup; termina sozinho ao fechar',
  };

  test('todo setInterval periódico usa intervaloVisivel ou está justificado', () => {
    const infratores = [];

    for (const arquivo of arquivosApp(path.join(root, 'js'))) {
      const rel = path.relative(root, arquivo).split(path.sep).join('/');
      if (rel in PERMITIDOS) continue;

      const src = fs.readFileSync(arquivo, 'utf8');
      if (/\bsetInterval\s*\(/.test(src)) infratores.push(rel);
    }

    expect(infratores).toEqual([]);
  });

  test('as justificativas apontam para arquivos que existem', () => {
    const inexistentes = Object.keys(PERMITIDOS)
      .filter(f => !fs.existsSync(path.join(root, f)));
    expect(inexistentes).toEqual([]);
  });

  test('os arquivos justificados realmente contêm setInterval', () => {
    // Justificativa órfã dá falsa sensação de que a exceção ainda é necessária.
    const semTimer = Object.keys(PERMITIDOS)
      .filter(f => !/\bsetInterval\s*\(/.test(fs.readFileSync(path.join(root, f), 'utf8')));
    expect(semTimer).toEqual([]);
  });
});
