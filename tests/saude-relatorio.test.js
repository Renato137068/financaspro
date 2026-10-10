/**
 * saude-relatorio.test.js — a regra do alerta do painel de saúde e o
 * workflow que a roda todo dia (etapa 4 do roadmap).
 *
 * O alerta abre issue sozinho: alarme falso ensina a ignorá-lo, e alarme que
 * não dispara esconde uma versão ruim. As duas pontas ficam presas aqui.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  decidirAlerta, listarAlertas, montarRelatorio, compararVersao, MIN_SESSOES, TETO, MIN_ERRO_NOVO,
} = require('../scripts/saude-relatorio.cjs');

const ROOT = path.join(__dirname, '..');
const v = (app_version, sessoes, erros_por_mil) => ({ app_version, sessoes, erros: 0, erros_por_mil });

describe('decidirAlerta', () => {
  test('versão nova bem pior que a anterior alerta', () => {
    const d = decidirAlerta([v('11.3.18', 500, 4), v('11.3.19', 400, 25)]);
    expect(d.alerta).toBe(true);
    expect(d.nova.app_version).toBe('11.3.19');
    expect(d.anterior.app_version).toBe('11.3.18');
    expect(d.limite).toBe(8); // 4 × 1,5 + 2
  });

  test('variação pequena não alerta (fator e folga)', () => {
    expect(decidirAlerta([v('11.3.18', 500, 4), v('11.3.19', 500, 8)]).alerta).toBe(false);
    // 0 → 1,5 por mil: a folga segura o alarme quando a base é quase zero.
    expect(decidirAlerta([v('11.3.18', 500, 0), v('11.3.19', 500, 1.5)]).alerta).toBe(false);
    expect(decidirAlerta([v('11.3.18', 500, 0), v('11.3.19', 500, 2.1)]).alerta).toBe(true);
  });

  test('versão nova melhor não alerta', () => {
    expect(decidirAlerta([v('11.3.18', 500, 30), v('11.3.19', 500, 3)]).alerta).toBe(false);
  });

  test(`versão com menos de ${MIN_SESSOES} sessões fica de fora (um aparelho não é tendência)`, () => {
    const d = decidirAlerta([v('11.3.18', 500, 4), v('11.3.19', MIN_SESSOES - 1, 900)]);
    expect(d.alerta).toBe(false);
    expect(d.motivo).toMatch(/menos de duas versões/);
    // …e a comparação passa a ser entre as duas mais novas COM uso.
    const d2 = decidirAlerta([v('11.3.17', 500, 3), v('11.3.18', 500, 20), v('11.3.19', 10, 900)]);
    expect(d2.alerta).toBe(true);
    expect(d2.nova.app_version).toBe('11.3.18');
  });

  test('ordena por versão numérica, não por texto (11.3.10 > 11.3.9)', () => {
    expect(compararVersao('11.3.10', '11.3.9')).toBeGreaterThan(0);
    const d = decidirAlerta([v('11.3.10', 500, 30), v('11.3.9', 500, 2)]);
    expect(d.nova.app_version).toBe('11.3.10');
    expect(d.alerta).toBe(true);
  });

  test('sem dados não alerta nem quebra', () => {
    expect(decidirAlerta([]).alerta).toBe(false);
    expect(decidirAlerta(undefined).alerta).toBe(false);
  });
});

describe('listarAlertas', () => {
  const HOJE = '2026-10-20';
  const comHistorico = (lista) => lista.map((x) => Object.assign({ primeiro_dia: '2026-09-25' }, x));
  const erro = (message, ocorrencias, novo) => ({
    app_version: '11.3.19', message, onde: 'render:resumo', ocorrencias, novo, pilha: 'at f (app.bundle.js:1:2)',
  });

  test('a piora entre versões vira issue com o título de sempre', () => {
    const a = listarAlertas({ resumo: [v('11.3.18', 500, 4), v('11.3.19', 400, 25)], hoje: HOJE });
    expect(a.map((x) => x.titulo)).toEqual(['Saúde: v11.3.19 com mais erros por sessão que a versão anterior']);
  });

  test(`primeira versão (sem anterior) acima de ${TETO} por mil também alerta`, () => {
    const a = listarAlertas({ resumo: [v('11.3.19', 400, TETO + 5)], hoje: HOJE });
    expect(a.map((x) => x.titulo)).toEqual(['Saúde: v11.3.19 com mais de ' + TETO + ' erros por 1.000 sessões']);
    expect(listarAlertas({ resumo: [v('11.3.19', 400, TETO)], hoje: HOJE })).toEqual([]);
  });

  test('avisos de uso parados há 2 dias alertam; sem nenhum aviso ainda, não', () => {
    expect(listarAlertas({ resumo: [], ultimoDiaComSessao: '2026-10-19', hoje: HOJE })).toEqual([]);
    const a = listarAlertas({ resumo: [], ultimoDiaComSessao: '2026-10-18', hoje: HOJE });
    expect(a[0].titulo).toBe('Saúde: os avisos de uso pararam de chegar');
    expect(a[0].motivo).toMatch(/2026-10-18 \(2 dias\)/);
    expect(listarAlertas({ resumo: [], ultimoDiaComSessao: null, hoje: HOJE })).toEqual([]);
  });

  test(`erro novo com ${MIN_ERRO_NOVO}+ ocorrências alerta, no máximo 3 por dia`, () => {
    const erros = [erro('a is undefined', MIN_ERRO_NOVO, true), erro('velho', 500, false),
      erro('raro', MIN_ERRO_NOVO - 1, true), erro('b', 40, true), erro('c', 30, true), erro('d', 20, true)];
    const a = listarAlertas({ resumo: comHistorico([v('11.3.19', 100, 1)]), erros, hoje: HOJE });
    expect(a.map((x) => x.titulo)).toEqual(['Saúde: erro novo — b', 'Saúde: erro novo — c', 'Saúde: erro novo — d']);
  });

  test('sem histórico anterior à janela, todo erro pareceria novo: não alerta', () => {
    const a = listarAlertas({ resumo: [v('11.3.19', 100, 1)].map((x) => Object.assign(x, { primeiro_dia: '2026-10-17' })),
      erros: [erro('x', 99, true)], hoje: HOJE });
    expect(a).toEqual([]);
  });

  test('o título vindo de mensagem de erro sai numa linha, sem aspas nem crase', () => {
    const a = listarAlertas({ resumo: comHistorico([v('11.3.19', 100, 1)]), erros: [erro('quebrou "x"\n`y`', 50, true)], hoje: HOJE });
    expect(a[0].titulo).toBe('Saúde: erro novo — quebrou x y');
  });
});

describe('montarRelatorio', () => {
  test('tabela por versão (mais nova primeiro) e funil com nulo como —', () => {
    const resumo = [v('11.3.9', 500, 2), v('11.3.10', 400, 3)];
    const funil = [{ semana: '2026-09-21', contas: 5, com_lancamento: 3, ativos_d30: null, com_trial: 2, assinantes: 1 }];
    const md = montarRelatorio(resumo, funil, decidirAlerta(resumo));
    expect(md).toMatch(/^# Saúde do FinançasPro/);
    expect(md).toMatch(/Sem alerta/);
    expect(md.indexOf('| 11.3.10 |')).toBeLessThan(md.indexOf('| 11.3.9 |'));
    expect(md).toContain('| 2026-09-21 | 5 | 3 | — | 2 | 1 |');
  });

  test('erros mais frequentes: mais vistos primeiro, novos marcados, pipe não quebra a tabela', () => {
    const erros = [
      { app_version: '11.3.19', message: 'raro', onde: null, ocorrencias: 2, novo: false, pilha: '', ultima: '2026-10-05T10:00:00Z' },
      { app_version: '11.3.19', message: 'a | b', onde: 'render:resumo', ocorrencias: 9, novo: true,
        pilha: '    at f (app.bundle.js:1:2)', ultima: '2026-10-06T10:00:00Z' },
    ];
    const md = montarRelatorio([], [], decidirAlerta([]), { erros });
    expect(md).toContain('## Erros mais frequentes (últimos 7 dias)');
    expect(md).toContain('| 11.3.19 | 9 | 🆕 a \\| b | render:resumo | at f (app.bundle.js:1:2) | 2026-10-06T10:00 |');
    expect(md.indexOf('a \\| b')).toBeLessThan(md.indexOf('raro'));
  });

  test('sem nenhum aviso de uso, o relatório diz que a telemetria não está ligada', () => {
    const md = montarRelatorio([], [], decidirAlerta([]), { ultimoDiaComSessao: null });
    expect(md).toMatch(/telemetria não está ligada/);
  });

  test('outros alertas aparecem mesmo sem piora entre versões', () => {
    const alertas = [{ titulo: 't', motivo: 'último aviso de uso em 2026-10-01' }];
    const md = montarRelatorio([], [], decidirAlerta([]), { alertas });
    expect(md).toMatch(/Sem piora entre versões/);
    expect(md).toContain('**⚠️ Alerta:** último aviso de uso em 2026-10-01');
  });

  test('com alerta, o motivo abre o relatório', () => {
    const resumo = [v('11.3.18', 500, 4), v('11.3.19', 400, 25)];
    expect(montarRelatorio(resumo, [], decidirAlerta(resumo))).toMatch(/\*\*⚠️ Alerta:\*\* v11\.3\.19: 25/);
  });
});

describe('script e workflow', () => {
  test('sem SAUDE_DATABASE_URL, o script falha dizendo o que falta', () => {
    const env = Object.assign({}, process.env);
    delete env.SAUDE_DATABASE_URL;
    const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'saude-relatorio.cjs')], { env, encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/SAUDE_DATABASE_URL/);
  });

  const wf = fs.readFileSync(path.join(ROOT, '.github/workflows/saude.yml'), 'utf8');

  test('roda todo dia e à mão, e sem o segredo sai verde avisando', () => {
    expect(wf).toMatch(/schedule:\n\s+- cron: '\d+ \d+ \* \* \*'/);
    expect(wf).toMatch(/workflow_dispatch:/);
    expect(wf).toMatch(/::notice::SAUDE_DATABASE_URL não configurado/);
  });

  test('abre uma issue por alerta, sem duplicar a do mesmo título', () => {
    expect(wf).toContain('node scripts/saude-relatorio.cjs --saida relatorio.md --alertas alertas.txt');
    expect(wf).toMatch(/if: steps\.saude\.outputs\.alerta == 'true'/);
    expect(wf).toContain('done < alertas.txt');
    // O título pode trazer a mensagem de um erro: vai como dado, nunca como código.
    expect(wf).toContain('jq -r --arg t "$TITULO"');
    expect(wf).not.toMatch(/select\(\.title == \\"\$TITULO/);
    expect(wf).toMatch(/gh issue comment "\$NUM"/);
    expect(wf).toMatch(/gh issue create --title "\$TITULO"/);
    expect(wf).toMatch(/permissions:\n\s+contents: read\n\s+issues: write/);
  });

  test('o doc do painel existe e é citado pelo workflow', () => {
    expect(wf).toContain('docs/observabilidade/painel-saude.md');
    expect(fs.existsSync(path.join(ROOT, 'docs/observabilidade/painel-saude.md'))).toBe(true);
  });
});
