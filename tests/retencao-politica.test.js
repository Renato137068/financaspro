/**
 * retencao-politica.test.js — todo modelo do schema tem prazo ou isenção.
 *
 * A retenção roda no banco (public.fp_purge_retention, migração
 * supabase/migrations/20261002120000_agendamentos.sql, agendada pelo pg_cron)
 * e o comportamento dela é testado no pgTAP (supabase/tests/agendamentos.test.sql).
 * O que fica aqui é a omissão que nenhum teste de comportamento pega: um
 * modelo novo entra no schema.prisma sem prazo e o dado se acumula para
 * sempre. "Ninguém pediu para apagar" não é base legal para guardar (LGPD
 * art. 15, IV). Antes, a mesma checagem vivia em tests/backend/retention.test.js,
 * contra a política do worker do Express.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const schema = fs.readFileSync(path.join(ROOT, 'prisma', 'schema.prisma'), 'utf8');
const migracao = fs.readFileSync(path.join(ROOT, 'supabase', 'migrations', '20261002120000_agendamentos.sql'), 'utf8');
const doc = fs.readFileSync(path.join(ROOT, 'docs', 'retencao-de-dados.md'), 'utf8');

/** Sem prazo, e por quê. Um modelo novo precisa entrar aqui ou na política. */
const ISENTOS = {
  User: 'Conta ativa. Some por pedido do titular (fp_delete_own_account).',
  UserConfig: 'Preferências da conta ativa; cascade na exclusão.',
  Transaction: 'Conteúdo do usuário. Ele decide quando apagar.',
  Account: 'Conteúdo do usuário.',
  Budget: 'Conteúdo do usuário.',
  RecurringTransaction: 'Conteúdo do usuário.',
  OpenFinanceConnection: 'Vínculo bancário; o Open Finance saiu do escopo (ADR 0007) e a tabela fica vazia.',
  Organization: 'Entidade ativa.',
  OrganizationMember: 'Vínculo ativo; cascade na saída.',
  Plan: 'Catálogo, não é dado pessoal.',
  Subscription: 'Registro fiscal — prazo definido por obrigação contábil, não por esta política.',
  Invoice: 'Registro fiscal — idem.',
  UsageRecord: 'Base de faturamento; segue o prazo fiscal da Invoice.',
};

function modelos() {
  return [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]);
}

/** As tuplas ('Tabela', 'campo', dias) do VALUES da fp_purge_retention. */
function politica() {
  const corpo = migracao.slice(migracao.indexOf('function public.fp_purge_retention'), migracao.indexOf('as politica('));
  return [...corpo.matchAll(/\('(\w+)',\s*'(\w+)',\s*(\d+)\)/g)].map((m) => ({ tabela: m[1], campo: m[2], dias: Number(m[3]) }));
}

/** Campos de um modelo do schema. */
function campos(modelo) {
  const bloco = schema.match(new RegExp('^model ' + modelo + '\\s*\\{([\\s\\S]*?)^\\}', 'm'));
  return bloco ? [...bloco[1].matchAll(/^\s+(\w+)\s+\w/gm)].map((m) => m[1]) : [];
}

describe('política de retenção', () => {
  test('as leituras do schema e da migração acharam o que procurar', () => {
    // Guarda contra o teste ficar verde por o regex parar de casar.
    expect(modelos().length).toBeGreaterThan(15);
    expect(politica().length).toBe(7);
  });

  test('todo modelo do schema tem prazo ou isenção declarada', () => {
    const cobertos = new Set([...politica().map((p) => p.tabela), ...Object.keys(ISENTOS)]);
    expect(modelos().filter((m) => !cobertos.has(m))).toEqual([]);
  });

  test('nenhuma tabela é ao mesmo tempo expurgada e isenta, e nada sobra fora do schema', () => {
    const doSchema = new Set(modelos());
    expect(politica().filter((p) => ISENTOS[p.tabela])).toEqual([]);
    expect([...politica().map((p) => p.tabela), ...Object.keys(ISENTOS)].filter((t) => !doSchema.has(t))).toEqual([]);
  });

  test('o campo de corte de cada tabela existe no modelo (rename não propagado apagaria nada para sempre)', () => {
    for (const p of politica()) {
      expect({ tabela: p.tabela, temCampo: campos(p.tabela).includes(p.campo) }).toEqual({ tabela: p.tabela, temCampo: true });
    }
  });

  test('a tabela de prazos do documento bate com a migração', () => {
    for (const p of politica()) {
      const linha = doc.split('\n').find((l) => l.startsWith('| `' + p.tabela + '`'));
      expect(linha).toBeDefined();
      expect(linha).toContain('`' + p.campo + '`');
      expect(linha).toContain(p.dias + ' dias');
    }
  });

  test('ninguém de fora chama as funções agendadas pelo PostgREST', () => {
    expect(migracao).toMatch(/revoke all on function public\.fp_purge_retention\(timestamptz\) from public, anon, authenticated;/);
    expect(migracao).toMatch(/revoke all on function public\.fp_disparar_billing_reconcile\(\) from public, anon, authenticated;/);
  });
});
