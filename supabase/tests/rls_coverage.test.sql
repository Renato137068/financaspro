-- ============================================================================
-- Cobertura de RLS (pgTAP) — guarda sistêmico (achado M3 da auditoria 03/09).
-- Rodar com: node scripts/test-supabase-pgtap.cjs  (ou `supabase test db`)
--
-- Todo o modelo de segurança do app repousa sobre RLS: uma tabela em `public`
-- sem RLS + os grants padrão do Supabase = anon/authenticated leem e escrevem
-- via PostgREST. O schema é do Prisma, então basta uma tabela nova nascer fora
-- da lista das migrations de RLS para abrir um buraco — sem nenhum aviso.
--
-- Este teste falha o CI se QUALQUER tabela base de `public` estiver sem RLS,
-- salvo uma allowlist explícita e justificada. Foi ele que pegou
-- fp_plan_limit_config (corrigida em 20260903120000).
-- ============================================================================

begin;
select plan(4);

-- ─── 1) Toda tabela base de public tem RLS habilitada ───────────────────────
-- Sem allowlist: até 30/09 _prisma_migrations ficava de fora "por não ser
-- exposta pelo PostgREST", o que não era verdade (os privilégios padrão do
-- Supabase davam SELECT a anon). Fechada em 20261001120000.
-- Tabelas criadas por extensões (ex.: pgTAP no ambiente de CI) são excluídas
-- via pg_depend (deptype = 'e'), não por nome — o guard não depende da lista de
-- extensões instaladas.
select is_empty(
  $$
    select c.relname as tabela_sem_rls
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'                 -- só tabelas base (exclui views/parents particionados)
      and c.relrowsecurity = false        -- RLS desligada
      and not exists (                    -- não é objeto de extensão (pgTAP etc.)
        select 1 from pg_depend d
        where d.objid = c.oid
          and d.classid = 'pg_class'::regclass
          and d.deptype = 'e'
      )
    order by c.relname
  $$,
  'Nenhuma tabela de public está sem RLS'
);

-- ─── 1b) O histórico do Prisma não sai pela API ─────────────────────────────
select ok(
  not has_table_privilege('anon', 'public._prisma_migrations', 'select'),
  'anon não tem SELECT em _prisma_migrations'
);
select ok(
  not has_table_privilege('authenticated', 'public._prisma_migrations', 'select'),
  'authenticated não tem SELECT em _prisma_migrations'
);

-- ─── 2) fp_plan_limit_config mantém a leitura pública ───────────────────────
-- Regressão específica: ligar RLS sem uma policy de SELECT permissiva quebraria
-- SILENCIOSAMENTE a quota (os triggers leem os limites como o próprio usuário).
-- Garante que a leitura continua liberada mesmo com RLS ativa.
-- A policy `for select using (true)` não tem cláusula TO, então vale para o
-- role `public` (que abarca authenticated). Basta existir uma policy permissiva
-- de leitura (SELECT ou ALL) na tabela.
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'fp_plan_limit_config'
      and cmd in ('SELECT', 'ALL')
  ),
  'fp_plan_limit_config tem SELECT liberado (triggers de quota seguem lendo os limites)'
);

select * from finish();
rollback;
