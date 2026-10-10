-- ============================================================================
-- Painel de saúde: retenção D1/D7/D30 (pgTAP) —
-- supabase/migrations/20261009140000_saude_retencao_nuvem.sql
--
-- O que precisa ser verdade:
--   • "voltou no dia N" = lançamento que chegou ao servidor em
--     [cadastro + N dias, cadastro + N+1 dias); o fim da janela fica de fora;
--   • lançamento apagado depois conta (a pessoa voltou);
--   • a coluna do dia N fica nula até a semana inteira passar do dia N;
--   • authenticated não lê; o papel de leitura do painel lê.
-- ============================================================================

begin;
select plan(7);

select has_view('saude', 'retencao_nuvem', 'view de retenção D1/D7/D30 existe');

-- Semana antiga (70 dias atrás), 3 contas:
--   A: lançou no dia 0, no dia 1, no dia 7 e no dia 30 → D1, D7, D30;
--   B: lançou no dia 1 (apagado depois), no dia 3 e exatamente no início do
--      dia 8 → só D1 (dia 3 não é D1 nem D7; 8 dias cravados já é o dia 8);
--   C: nunca lançou.
insert into public."User" (id, name, email, "createdAt", "updatedAt") values
  ('r1000000-0000-0000-0000-000000000001', 'A', 'ra@x.com', date_trunc('week', now()) - interval '70 days', now()),
  ('r1000000-0000-0000-0000-000000000002', 'B', 'rb@x.com', date_trunc('week', now()) - interval '68 days', now()),
  ('r1000000-0000-0000-0000-000000000003', 'C', 'rc@x.com', date_trunc('week', now()) - interval '66 days', now());
insert into public."Transaction" (id, "userId", type, amount, description, date, "createdAt", "updatedAt", "deletedAt") values
  ('rt1', 'r1000000-0000-0000-0000-000000000001', 'despesa', 1, 'x', now(), date_trunc('week', now()) - interval '70 days' + interval '2 hours', now(), null),
  ('rt2', 'r1000000-0000-0000-0000-000000000001', 'despesa', 1, 'x', now(), date_trunc('week', now()) - interval '69 days' + interval '1 hour', now(), null),
  ('rt3', 'r1000000-0000-0000-0000-000000000001', 'despesa', 1, 'x', now(), date_trunc('week', now()) - interval '63 days' + interval '5 hours', now(), null),
  ('rt4', 'r1000000-0000-0000-0000-000000000001', 'despesa', 1, 'x', now(), date_trunc('week', now()) - interval '40 days' + interval '23 hours', now(), null),
  ('rt5', 'r1000000-0000-0000-0000-000000000002', 'despesa', 1, 'x', now(), date_trunc('week', now()) - interval '67 days' + interval '3 hours', now(), now()),
  ('rt6', 'r1000000-0000-0000-0000-000000000002', 'despesa', 1, 'x', now(), date_trunc('week', now()) - interval '65 days', now(), null),
  ('rt7', 'r1000000-0000-0000-0000-000000000002', 'despesa', 1, 'x', now(), date_trunc('week', now()) - interval '60 days', now(), null);

select results_eq(
  $$ select contas, d1, d7, d30, d1_pct, d7_pct, d30_pct
     from saude.retencao_nuvem where semana = (date_trunc('week', now()) - interval '70 days')::date $$,
  $$ values (3, 2, 1, 1, 66.7, 33.3, 33.3) $$,
  'semana antiga: 3 contas, 2 no D1, 1 no D7, 1 no D30, com as porcentagens'
);

-- Semana de 21 dias atrás: D1 e D7 já fecharam, D30 ainda não.
insert into public."User" (id, name, email, "createdAt", "updatedAt") values
  ('r1000000-0000-0000-0000-000000000004', 'D', 'rd@x.com', date_trunc('week', now()) - interval '21 days', now());
insert into public."Transaction" (id, "userId", type, amount, description, date, "createdAt", "updatedAt") values
  ('rt8', 'r1000000-0000-0000-0000-000000000004', 'despesa', 1, 'x', now(), date_trunc('week', now()) - interval '20 days', now());
select results_eq(
  $$ select contas, d1, d7, d30 from saude.retencao_nuvem
     where semana = (date_trunc('week', now()) - interval '21 days')::date $$,
  $$ values (1, 1, 0, null::integer) $$,
  'semana de 3 semanas atrás: D1 e D7 contados, D30 nulo (ainda não fechou)'
);

-- Semana corrente: nenhum dia fechou para todas as contas.
insert into public."User" (id, name, email, "updatedAt")
  values ('r1000000-0000-0000-0000-000000000009', 'N', 'rn@x.com', now());
select results_eq(
  $$ select d1, d7, d30, d1_pct from saude.retencao_nuvem where semana = date_trunc('week', now())::date $$,
  $$ values (null::integer, null::integer, null::integer, null::numeric) $$,
  'semana corrente: D1, D7 e D30 nulos (não parece queda)'
);

-- ─── Acesso ─────────────────────────────────────────────────────────────────
set local role authenticated;
select throws_ok(
  $$ select count(*) from saude.retencao_nuvem $$,
  '42501', null, 'authenticated não lê a retenção'
);
reset role;

set local role anon;
select throws_ok(
  $$ select count(*) from saude.retencao_nuvem $$,
  '42501', null, 'anon não lê a retenção'
);
reset role;

create role saude_retencao_teste;
grant usage on schema saude to saude_retencao_teste;
grant select on all tables in schema saude to saude_retencao_teste;
set local role saude_retencao_teste;
select lives_ok(
  $$ select * from saude.retencao_nuvem $$,
  'papel com grant só no schema saude lê a retenção'
);
reset role;

select * from finish();
rollback;
