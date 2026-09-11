-- ============================================================================
-- RLS em fp_plan_limit_config — fecha um bypass de quota.
-- ============================================================================
-- A tabela de limites numéricos (criada em 20260901150000_quota_enforcement)
-- nasceu SEM row level security. No Supabase, uma tabela em `public` sem RLS,
-- somada aos grants padrão do projeto, fica LEGÍVEL e GRAVÁVEL por anon e
-- authenticated via PostgREST. Consequência concreta:
--
--   um usuário FREE poderia fazer
--     update public.fp_plan_limit_config set max_trans_per_month = null
--       where tier = 'FREE';
--   e furar a quota que os triggers BEFORE INSERT impõem — porque eles leem os
--   limites JUSTAMENTE desta tabela (fp_get_plan_limits → fp_plan_limit_config).
--
-- Correção: mesmo padrão da tabela "Plan" (leitura pública, escrita só
-- service_role). RLS ligada + policy permissiva de SELECT, sem policy de
-- escrita.
--
--   • SELECT liberado: os triggers de quota NÃO são SECURITY DEFINER, então
--     leem a tabela como o próprio usuário. Sem a policy de SELECT, a RLS
--     negaria a leitura, v_max viria NULL e a quota deixaria de ser aplicada
--     (falha SILENCIOSA). A policy `using (true)` preserva a leitura.
--   • Escrita negada: sem policy de INSERT/UPDATE/DELETE, anon/authenticated
--     não alteram os limites. Só o service_role (que ignora RLS) faz
--     seed/manutenção.
--
-- Coberto por supabase/tests/rls_coverage.test.sql (garante que nenhuma tabela
-- de public fique sem RLS de novo).
-- ============================================================================

alter table public.fp_plan_limit_config enable row level security;

drop policy if exists fp_plan_limit_config_select on public.fp_plan_limit_config;
create policy fp_plan_limit_config_select on public.fp_plan_limit_config
  for select using (true);
-- Sem policy de insert/update/delete: escrita fica só para o service_role.
