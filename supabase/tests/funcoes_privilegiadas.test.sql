-- ============================================================================
-- Funções SECURITY DEFINER (pgTAP) — guarda sistêmico
--
-- Toda função privilegiada fixa o search_path e termina em pg_temp: sem isso,
-- uma tabela temporária de mesmo nome passa na frente da real dentro da
-- função. E o plano de uma conta (fp_plan_tier) não é consultável sem login.
-- Migração: 20261009130000_funcoes_privilegios_search_path.sql
-- ============================================================================

begin;
select plan(5);

select is_empty(
  $$ select n.nspname || '.' || p.proname
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where p.prosecdef
       and n.nspname in ('public', 'saude')
       and not exists (
         select 1 from unnest(coalesce(p.proconfig, '{}')) c
         where c ~ '^search_path=' and c ~ 'pg_temp$'
       ) $$,
  'toda função SECURITY DEFINER de public e saude fixa search_path terminando em pg_temp'
);

select ok(
  not has_function_privilege('anon', 'public.fp_plan_tier(text)', 'execute'),
  'anon não executa fp_plan_tier'
);
select ok(
  has_function_privilege('authenticated', 'public.fp_plan_tier(text)', 'execute'),
  'authenticated executa fp_plan_tier (gatilhos de cota rodam como quem grava)'
);
select ok(
  has_function_privilege('service_role', 'public.fp_plan_tier(text)', 'execute'),
  'service_role executa fp_plan_tier'
);

-- Os gatilhos de cota continuam funcionando para quem está logado.
insert into public."User" (id, name, email, "passwordHash", "passwordSalt", "updatedAt")
values ('eeee0000-0000-0000-0000-000000000001', 'Eva', 'e1@x.com', 'h', 's', now());
set local role authenticated;
set local request.jwt.claims to '{"sub":"eeee0000-0000-0000-0000-000000000001"}';
select lives_ok(
  $$ insert into public."Transaction" (id, "userId", type, amount, description, date, "updatedAt")
     values ('te_1', 'eeee0000-0000-0000-0000-000000000001', 'despesa', 1, 'x', now(), now()) $$,
  'lançamento de quem está logado passa pelo gatilho de cota'
);

select * from finish();
rollback;
