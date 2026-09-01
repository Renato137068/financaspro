-- ============================================================================
-- Testes de quota enforcement (pgTAP)
-- Rodar com: supabase test db
-- ============================================================================

begin;
select plan(6);

-- ─── Setup ───────────────────────────────────────────────────────────────────
insert into public."User" (id, name, email, "passwordHash", "passwordSalt", "updatedAt")
values
  ('u_free', 'Free User', 'free@x.com', 'h', 's', now()),
  ('u_pro',  'Pro User',  'pro@x.com',  'h', 's', now());

insert into public."Plan" (id, name, tier, "priceMonthly", "priceYearly")
values
  ('p_free', 'Gratuito', 'FREE', 0, 0),
  ('p_pro',  'Pro',      'PRO',  16.9, 129)
on conflict do nothing;

insert into public."Organization" (id, name, slug, "ownerId", "updatedAt")
values
  ('o_free', 'Org Free', 'org-free', 'u_free', now()),
  ('o_pro',  'Org Pro',  'org-pro',  'u_pro',  now());

update public."Subscription"
set "planId" = 'p_pro', "updatedAt" = now()
where "orgId" = 'o_pro';

-- 100 transações do mês para u_free (no limite)
insert into public."Transaction" (id, "userId", type, amount, description, date, "createdAt", "updatedAt")
select
  't_free_' || g::text,
  'u_free',
  'despesa',
  1,
  'tx ' || g::text,
  now(),
  now(),
  now()
from generate_series(1, 100) g;

-- ─── Como u_free: 101ª transação é rejeitada ────────────────────────────────
set local role authenticated;
set local request.jwt.claims to '{"sub":"u_free","email":"free@x.com","role":"authenticated"}';

select throws_ok(
  $$ insert into public."Transaction" (id, "userId", type, amount, description, date, "updatedAt")
     values ('t_free_101', 'u_free', 'despesa', 1, 'estoura', now(), now()) $$,
  'P0001',
  'QUOTA_EXCEEDED:transaction',
  'FREE: 101ª transação do mês é rejeitada'
);

-- ─── Como u_pro: acima de 100 passa ─────────────────────────────────────────
set local request.jwt.claims to '{"sub":"u_pro","email":"pro@x.com","role":"authenticated"}';

select lives_ok(
  $$ insert into public."Transaction" (id, "userId", type, amount, description, date, "updatedAt")
     values ('t_pro_101', 'u_pro', 'despesa', 1, 'pro ok', now(), now()) $$,
  'PRO: 101ª transação do mês é aceita'
);

-- ─── Contas: FREE no limite de 3 ─────────────────────────────────────────────
set local request.jwt.claims to '{"sub":"u_free","email":"free@x.com","role":"authenticated"}';

insert into public."Account" (id, "userId", name, type, balance, "updatedAt")
values
  ('a1', 'u_free', 'C1', 'checking', 0, now()),
  ('a2', 'u_free', 'C2', 'checking', 0, now()),
  ('a3', 'u_free', 'C3', 'checking', 0, now());

select throws_ok(
  $$ insert into public."Account" (id, "userId", name, type, balance, "updatedAt")
     values ('a4', 'u_free', 'C4', 'checking', 0, now()) $$,
  'P0001',
  'QUOTA_EXCEEDED:account',
  'FREE: 4ª conta ativa é rejeitada'
);

-- ─── Orçamentos: FREE no limite de 5 com limite > 0 ─────────────────────────
insert into public."Budget" (id, "userId", category, "limit", period, active, "updatedAt")
select
  'b' || g::text,
  'u_free',
  'cat_' || g::text,
  100,
  'monthly',
  true,
  now()
from generate_series(1, 5) g;

select throws_ok(
  $$ insert into public."Budget" (id, "userId", category, "limit", period, active, "updatedAt")
     values ('b6', 'u_free', 'cat_6', 50, 'monthly', true, now()) $$,
  'P0001',
  'QUOTA_EXCEEDED:budget',
  'FREE: 6º orçamento com limite > 0 é rejeitado'
);

-- ─── service_role ignora quota ───────────────────────────────────────────────
reset role;
set local role service_role;

select lives_ok(
  $$ insert into public."Transaction" (id, "userId", type, amount, description, date, "updatedAt")
     values ('t_svc_101', 'u_free', 'despesa', 1, 'service bypass', now(), now()) $$,
  'service_role: insert acima do limite é permitido'
);

select * from finish();
rollback;
