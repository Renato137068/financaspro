-- ============================================================================
-- Painel de saúde (pgTAP) — supabase/migrations/20260930120000_saude_telemetria.sql
--
-- O que precisa ser verdade:
--   • o contador de uso só é escrito pela Edge Function (service_role), soma
--     sem perder aviso e recusa versão que não seja X.Y.Z;
--   • nem anon nem authenticated leem o contador ou o schema `saude`;
--   • erros por 1.000 sessões e o funil fazem a conta certa.
-- ============================================================================

begin;
select plan(14);

select has_table('public', 'fp_app_sessao_dia', 'contador de uso por dia e versão existe');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.fp_app_sessao_dia'::regclass),
  'fp_app_sessao_dia tem RLS habilitada'
);
select is_empty(
  $$ select 1 from pg_policies where schemaname = 'public' and tablename = 'fp_app_sessao_dia' $$,
  'fp_app_sessao_dia não tem policy — só service_role acessa'
);

-- ─── Quem pode escrever e ler ───────────────────────────────────────────────
set local role anon;
select throws_ok(
  $$ select public.fp_obs_contar_sessao('11.3.18') $$,
  '42501', null, 'anon não chama o contador direto (só pela Edge Function)'
);
reset role;

set local role authenticated;
select throws_ok(
  $$ select count(*) from public.fp_app_sessao_dia $$,
  '42501', null, 'authenticated não lê o contador'
);
select throws_ok(
  $$ select count(*) from saude.versao_resumo $$,
  '42501', null, 'authenticated não lê o schema saude'
);
reset role;

-- ─── Contador ───────────────────────────────────────────────────────────────
set local role service_role;
select lives_ok(
  $$ select public.fp_obs_contar_sessao('11.3.18');
     select public.fp_obs_contar_sessao('11.3.18');
     select public.fp_obs_contar_sessao('11.3.18');
     select public.fp_obs_contar_sessao('11.3.19') $$,
  'service_role soma avisos de uso'
);
select throws_ok(
  $$ select public.fp_obs_contar_sessao('v11') $$,
  '23514', null, 'versão fora de X.Y.Z é recusada'
);
reset role;

select is(
  (select sessoes from public.fp_app_sessao_dia
   where app_version = '11.3.18' and dia = (now() at time zone 'utc')::date),
  3, 'três avisos no mesmo dia viram sessoes = 3, numa linha só'
);

-- ─── Erros por 1.000 sessões ────────────────────────────────────────────────
insert into public.fp_client_error (app_version, message) values ('11.3.18', 'e1'), ('11.3.19', 'e2'), ('11.3.19', 'e3');
-- Evento que não é erro não conta.
insert into public.fp_client_error (app_version, kind, message) values ('11.3.18', 'outro', 'x');

select is(
  (select erros_por_mil from saude.versao_resumo where app_version = '11.3.18'),
  333.3, '1 erro em 3 sessões = 333,3 por mil'
);
select is(
  (select erros_por_mil from saude.versao_resumo where app_version = '11.3.19'),
  2000.0, '2 erros em 1 sessão = 2.000 por mil'
);

-- ─── Funil de nuvem ─────────────────────────────────────────────────────────
-- Semana antiga (já passou dos 37 dias): 3 contas; 2 lançaram; 1 lançou depois
-- do 30º dia; 1 ganhou o trial; 1 é assinante.
insert into public."User" (id, name, email, "createdAt", "updatedAt") values
  ('f1000000-0000-0000-0000-000000000001', 'A', 'fa@x.com', date_trunc('week', now()) - interval '70 days', now()),
  ('f1000000-0000-0000-0000-000000000002', 'B', 'fb@x.com', date_trunc('week', now()) - interval '70 days', now()),
  ('f1000000-0000-0000-0000-000000000003', 'C', 'fc@x.com', date_trunc('week', now()) - interval '70 days', now());
insert into public."Transaction" (id, "userId", type, amount, description, date, "createdAt", "updatedAt") values
  ('ft1', 'f1000000-0000-0000-0000-000000000001', 'despesa', 1, 'x', now(), date_trunc('week', now()) - interval '69 days', now()),
  ('ft2', 'f1000000-0000-0000-0000-000000000001', 'despesa', 1, 'x', now(), date_trunc('week', now()) - interval '20 days', now()),
  ('ft3', 'f1000000-0000-0000-0000-000000000002', 'despesa', 1, 'x', now(), date_trunc('week', now()) - interval '68 days', now());
insert into public.fp_welcome_trial_grant (user_id, org_id, ends_at)
  values ('f1000000-0000-0000-0000-000000000002', 'o_trial', now() + interval '14 days');
insert into public."Plan" (id, name, tier, "priceMonthly", "priceYearly") values ('p_saude', 'Pro', 'PRO', 10, 100)
  on conflict do nothing;
insert into public."Organization" (id, name, slug, "ownerId", "updatedAt")
  values ('o_saude', 'Org A', 'org-saude-a', 'f1000000-0000-0000-0000-000000000001', now());
insert into public."OrganizationMember" (id, "orgId", "userId", role)
  values ('m_saude', 'o_saude', 'f1000000-0000-0000-0000-000000000001', 'OWNER')
  on conflict ("orgId", "userId") do nothing;
insert into public."Subscription" (id, "orgId", "planId", status, "currentPeriodStart", "currentPeriodEnd", "updatedAt")
  values ('s_saude', 'o_saude', (select id from public."Plan" where tier = 'PRO'), 'ACTIVE', now(), now() + interval '30 days', now())
  on conflict ("orgId") do update set status = 'ACTIVE';

select results_eq(
  $$ select contas, com_lancamento, ativos_d30, com_trial, assinantes
     from saude.funil_nuvem where semana = (date_trunc('week', now()) - interval '70 days')::date $$,
  $$ values (3, 2, 1, 1, 1) $$,
  'funil da semana antiga: 3 contas, 2 lançaram, 1 ativa no 30º dia, 1 trial, 1 assinante'
);

-- Semana corrente: ainda sem 30 dias — ativos_d30 fica nulo, não zero.
insert into public."User" (id, name, email, "updatedAt")
  values ('f1000000-0000-0000-0000-000000000009', 'N', 'fn@x.com', now());
select is(
  (select ativos_d30 from saude.funil_nuvem where semana = date_trunc('week', now())::date),
  null::integer, 'semana sem 30 dias completos: ativos_d30 é nulo (não parece queda)'
);

-- ─── Papel de leitura do alerta (docs/observabilidade/painel-saude.md) ─────
-- Só USAGE no schema e SELECT nas views basta: as views leem as tabelas com o
-- dono delas.
create role saude_leitura_teste;
grant usage on schema saude to saude_leitura_teste;
grant select on all tables in schema saude to saude_leitura_teste;
set local role saude_leitura_teste;
select lives_ok(
  $$ select * from saude.versao_resumo; select * from saude.funil_nuvem $$,
  'papel com grant só no schema saude lê o painel'
);
reset role;

select * from finish();
rollback;
