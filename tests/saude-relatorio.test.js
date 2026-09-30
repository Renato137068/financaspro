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
  decidirAlerta, montarRelatorio, compararVersao, MIN_SESSOES,
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

  test('abre issue só com alerta, sem duplicar a da mesma versão', () => {
    expect(wf).toContain('node scripts/saude-relatorio.cjs --saida relatorio.md');
    expect(wf).toMatch(/if: steps\.saude\.outputs\.alerta == 'true'/);
    expect(wf).toMatch(/gh issue comment "\$NUM"/);
    expect(wf).toMatch(/gh issue create --title "\$TITULO"/);
    expect(wf).toMatch(/permissions:\n\s+contents: read\n\s+issues: write/);
  });

  test('o doc do painel existe e é citado pelo workflow', () => {
    expect(wf).toContain('docs/observabilidade/painel-saude.md');
    expect(fs.existsSync(path.join(ROOT, 'docs/observabilidade/painel-saude.md'))).toBe(true);
  });
});
