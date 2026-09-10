-- ============================================================================
-- Testes de quota enforcement (pgTAP) — v3 (limites por profundidade)
-- Rodar com: supabase test db
-- ============================================================================

begin;
select plan(8);

-- ─── Setup ───────────────────────────────────────────────────────────────────
insert into public."User" (id, name, email, "passwordHash", "passwordSalt", "updatedAt")
values
  ('aaaa0000-0000-0000-0000-000000000001', 'Free User', 'free@x.com', 'h', 's', now()),
  ('aaaa0000-0000-0000-0000-000000000002',  'Pro User',  'pro@x.com',  'h', 's', now());

insert into public."Plan" (id, name, tier, "priceMonthly", "priceYearly")
values
  ('p_free', 'Gratuito', 'FREE', 0, 0),
  ('p_pro',  'Pro',      'PRO',  16.9, 129)
on conflict do nothing;

insert into public."Organization" (id, name, slug, "ownerId", "updatedAt")
values
  ('o_free', 'Org Free', 'org-free', 'aaaa0000-0000-0000-0000-000000000001', now()),
  ('o_pro',  'Org Pro',  'org-pro',  'aaaa0000-0000-0000-0000-000000000002',  now());

update public."Subscription"
set "planId" = 'p_pro', "updatedAt" = now()
where "orgId" = 'o_pro';

-- ─── Transações: teto removido (v2) — 101ª passa no FREE ────────────────────
insert into public."Transaction" (id, "userId", type, amount, description, date, "createdAt", "updatedAt")
select
  't_free_' || g::text,
  'aaaa0000-0000-0000-0000-000000000001',
  'despesa',
  1,
  'tx ' || g::text,
  now(),
  now(),
  now()
from generate_series(1, 100) g;

set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaa0000-0000-0000-0000-000000000001","email":"free@x.com","role":"authenticated"}';

select lives_ok(
  $$ insert into public."Transaction" (id, "userId", type, amount, description, date, "updatedAt")
     values ('t_free_101', 'aaaa0000-0000-0000-0000-000000000001', 'despesa', 1, 'sem teto de volume', now(), now()) $$,
  'FREE: 101ª transação do mês é aceita (sem teto de volume)'
);

-- ─── Contas: FREE no limite de 5 ─────────────────────────────────────────────
insert into public."Account" (id, "userId", name, type, balance, "updatedAt")
select
  'a' || g::text,
  'aaaa0000-0000-0000-0000-000000000001',
  'C' || g::text,
  'checking',
  0,
  now()
from generate_series(1, 5) g;

select throws_ok(
  $$ insert into public."Account" (id, "userId", name, type, balance, "updatedAt")
     values ('a6', 'aaaa0000-0000-0000-0000-000000000001', 'C6', 'checking', 0, now()) $$,
  'P0001',
  'QUOTA_EXCEEDED:account',
  'FREE: 6ª conta ativa é rejeitada'
);

-- ─── Orçamentos: FREE no limite de 5 ─────────────────────────────────────────
insert into public."Budget" (id, "userId", category, "limit", period, active, "updatedAt")
select
  'b' || g::text,
  'aaaa0000-0000-0000-0000-000000000001',
  'cat_' || g::text,
  100,
  'monthly',
  true,
  now()
from generate_series(1, 5) g;

select throws_ok(
  $$ insert into public."Budget" (id, "userId", category, "limit", period, active, "updatedAt")
     values ('b6', 'aaaa0000-0000-0000-0000-000000000001', 'cat_6', 50, 'monthly', true, now()) $$,
  'P0001',
  'QUOTA_EXCEEDED:budget',
  'FREE: 6º orçamento com limite > 0 é rejeitado'
);

-- ─── RecurringTransaction: FREE max 3 ───────────────────────────────────────
insert into public."RecurringTransaction" (
  id, "userId", type, amount, description, frequency, "startDate", "nextDue", active, "updatedAt"
)
select
  'r' || g::text,
  'aaaa0000-0000-0000-0000-000000000001',
  'despesa',
  10,
  'rec ' || g::text,
  'monthly',
  now(),
  now(),
  true,
  now()
from generate_series(1, 3) g;

select throws_ok(
  $$ insert into public."RecurringTransaction" (
       id, "userId", type, amount, description, frequency, "startDate", "nextDue", active, "updatedAt"
     ) values ('r4', 'aaaa0000-0000-0000-0000-000000000001', 'despesa', 10, 'rec 4', 'monthly', now(), now(), true, now()) $$,
  'P0001',
  'QUOTA_EXCEEDED:recurring',
  'FREE: 4ª recorrente ativa é rejeitada'
);

-- ─── UserConfig: 2ª meta rejeitada ───────────────────────────────────────────
insert into public."UserConfig" ("userId", data, "updatedAt")
values ('aaaa0000-0000-0000-0000-000000000001', '{"metas":[{"id":"m1"}]}'::jsonb, now());

select throws_ok(
  $$ update public."UserConfig"
     set data = '{"metas":[{"id":"m1"},{"id":"m2"}]}'::jsonb
     where "userId" = 'aaaa0000-0000-0000-0000-000000000001' $$,
  'P0001',
  'QUOTA_EXCEEDED:goal',
  'FREE: 2ª meta em UserConfig é rejeitada'
);

-- ─── UserConfig: 6ª conta a pagar rejeitada ──────────────────────────────────
select throws_ok(
  $$ update public."UserConfig"
     set data = jsonb_build_object(
       'metas', jsonb_build_array(jsonb_build_object('id','m1')),
       'contasPagar', (
         select jsonb_agg(jsonb_build_object('id', 'c' || g::text))
         from generate_series(1, 6) g
       )
     )
     where "userId" = 'aaaa0000-0000-0000-0000-000000000001' $$,
  'P0001',
  'QUOTA_EXCEEDED:bill',
  'FREE: 6ª conta a pagar em UserConfig é rejeitada'
);

-- ─── PRO: 2 metas passam ─────────────────────────────────────────────────────
set local request.jwt.claims to '{"sub":"aaaa0000-0000-0000-0000-000000000002","email":"pro@x.com","role":"authenticated"}';

select lives_ok(
  $$ insert into public."UserConfig" ("userId", data, "updatedAt")
     values (
       'aaaa0000-0000-0000-0000-000000000002',
       '{"metas":[{"id":"p1"},{"id":"p2"}]}'::jsonb,
       now()
     ) $$,
  'PRO: 2 metas em UserConfig são aceitas'
);

-- ─── service_role ignora quota ───────────────────────────────────────────────
-- O bypass de quota olha o papel no JWT (auth.jwt() ->> 'role'), não o papel do
-- Postgres; e o service_role ignora RLS (BYPASSRLS no bootstrap).
reset role;
set local request.jwt.claims to '{"role":"service_role"}';
set local role service_role;

select lives_ok(
  $$ insert into public."Account" (id, "userId", name, type, balance, "updatedAt")
     values ('a_svc', 'aaaa0000-0000-0000-0000-000000000001', 'svc', 'checking', 0, now()) $$,
  'service_role: insert acima do limite de contas é permitido'
);

select * from finish();
rollback;
