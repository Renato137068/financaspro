-- ============================================================================
-- Testes de RLS (pgTAP) — provam ISOLAMENTO entre usuários e organizações.
-- Rodar com: supabase test db
--
-- Um app financeiro que vaza dado de outro usuário é a pior falha possível.
-- Estes testes tentam ativamente esse vazamento e exigem que a RLS negue.
-- ============================================================================

begin;
select plan(10);

-- ─── Setup (papel de owner/postgres → RLS é ignorada aqui) ──────────────────
insert into public."User" (id, name, email, "passwordHash", "passwordSalt", "updatedAt")
values ('bbbb0000-0000-0000-0000-000000000001', 'Alice', 'u1@x.com', 'h', 's', now()),
       ('bbbb0000-0000-0000-0000-000000000002', 'Bob',   'u2@x.com', 'h', 's', now());

insert into public."Organization" (id, name, slug, "ownerId", "updatedAt")
values ('o1', 'Org da Alice', 'org-alice', 'bbbb0000-0000-0000-0000-000000000001', now());

-- O trigger de bootstrap da organização já cria a associação do dono; o insert
-- explícito é redundante e colidiria na unique (orgId, userId).
insert into public."OrganizationMember" (id, "orgId", "userId", role)
values ('m1', 'o1', 'bbbb0000-0000-0000-0000-000000000001', 'OWNER')
on conflict ("orgId", "userId") do nothing;

insert into public."Plan" (id, name, tier, "priceMonthly", "priceYearly")
values ('p_free', 'Gratuito', 'FREE', 0, 0);

insert into public."Transaction" (id, "userId", type, amount, description, date, "updatedAt")
values ('t_personal', 'bbbb0000-0000-0000-0000-000000000001', 'despesa', 10, 'pessoal da Alice', now(), now()),
       ('t_u2',       'bbbb0000-0000-0000-0000-000000000002', 'receita', 30, 'da Bob',           now(), now());

insert into public."Transaction" (id, "userId", type, amount, description, date, "orgId", "updatedAt")
values ('t_org', 'bbbb0000-0000-0000-0000-000000000001', 'despesa', 20, 'da org', now(), 'o1', now());

-- ─── Como Alice (u1): dona + membro da org ──────────────────────────────────
set local role authenticated;
set local request.jwt.claims to '{"sub":"bbbb0000-0000-0000-0000-000000000001","email":"u1@x.com"}';

select is(
  (select count(*)::int from public."Transaction"),
  2,
  'Alice vê exatamente as 2 transações dela (pessoal + org)'
);

-- CTE que modifica dados precisa ficar no topo da query (regra do Postgres),
-- então materializamos a contagem numa temp table antes de asseverar.
create temp table _edit_org on commit drop as
  with u as (update public."Transaction" set description = 'editada' where id = 't_org' returning 1)
  select count(*)::int as n from u;
select is(
  (select n from _edit_org),
  1,
  'Alice (OWNER) consegue editar a transação da org'
);

-- ─── Como Bob (u2): de fora, não é membro da org ────────────────────────────
set local request.jwt.claims to '{"sub":"bbbb0000-0000-0000-0000-000000000002","email":"u2@x.com"}';

select is(
  (select count(*)::int from public."Transaction"),
  1,
  'Bob vê só a transação dele — nada de Alice'
);

select is(
  (select count(*)::int from public."Transaction" where id in ('t_personal', 't_org')),
  0,
  'Bob não enxerga nenhuma linha da Alice, nem por id direto'
);

create temp table _hack on commit drop as
  with u as (update public."Transaction" set description = 'hackeada' where id = 't_personal' returning 1)
  select count(*)::int as n from u;
select is(
  (select n from _hack),
  0,
  'Bob não consegue atualizar transação da Alice (0 linhas afetadas)'
);

select throws_ok(
  $$ insert into public."Transaction" (id, "userId", type, amount, description, date, "updatedAt")
     values ('t_forjada', 'bbbb0000-0000-0000-0000-000000000001', 'despesa', 1, 'forjada como Alice', now(), now()) $$,
  '42501',
  null,
  'Bob não consegue inserir transação em nome da Alice (viola WITH CHECK)'
);

select lives_ok(
  $$ insert into public."Transaction" (id, "userId", type, amount, description, date, "updatedAt")
     values ('t_bob2', 'bbbb0000-0000-0000-0000-000000000002', 'despesa', 5, 'legítima da Bob', now(), now()) $$,
  'Bob consegue inserir a própria transação'
);

select is(
  (select count(*)::int from public."Organization" where id = 'o1'),
  0,
  'Bob não enxerga a organização da Alice'
);

select is(
  (select count(*)::int from public."Plan"),
  1,
  'Planos são leitura pública (Bob vê os planos)'
);

-- ─── Billing é só-service_role: nem o dono da org escreve pelo cliente ───────
set local request.jwt.claims to '{"sub":"bbbb0000-0000-0000-0000-000000000001","email":"u1@x.com"}';

select throws_ok(
  $$ insert into public."Subscription"
       (id, "orgId", "planId", "currentPeriodStart", "currentPeriodEnd", "updatedAt")
     values ('s_forjada', 'o1', 'p_free', now(), now(), now()) $$,
  '42501',
  null,
  'Nem a OWNER cria Subscription pelo cliente — só Edge Function (service_role)'
);

select * from finish();
rollback;
