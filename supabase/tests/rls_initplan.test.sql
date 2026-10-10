-- ============================================================================
-- RLS na forma indexável (20261009120000_rls_initplan_desempenho.sql)
--
-- 1. Estrutura: as regras das tabelas financeiras e as RESTRICTIVE de 2FA
--    usam (select auth.uid()), (select fp_mfa_ok()) e a lista de orgs, sem
--    chamada por linha. Uma migração futura que volte à forma antiga reprova.
-- 2. Semântica: dono, OWNER, MEMBER, VIEWER e quem é de fora continuam
--    vendo e editando exatamente o que viam (rls_policies cobre o caso
--    básico; aqui, os papéis de org e o 2FA aplicado pela tabela).
-- ============================================================================

begin;
select plan(18);

-- ─── Estrutura ──────────────────────────────────────────────────────────────
select has_function('public', 'fp_org_ids_membro', 'fp_org_ids_membro() existe');
select has_function('public', 'fp_org_ids_editor', 'fp_org_ids_editor() existe');

select is(
  (select count(*)::int from pg_policies
   where schemaname = 'public'
     and tablename in ('Transaction','Account','Budget','RecurringTransaction')
     and policyname ~ '_(select|insert|update|delete)$'),
  16,
  'as 16 regras das tabelas financeiras existem'
);

select is_empty(
  $$ select tablename || '.' || policyname from pg_policies
     where schemaname = 'public'
       and tablename in ('Transaction','Account','Budget','RecurringTransaction',
                         'UserConfig','SyncOp','OpenFinanceConnection')
       and coalesce(qual, '') || coalesce(with_check, '') ~ 'is_org_(member|editor)\(' $$,
  'nenhuma regra financeira chama is_org_member/is_org_editor por linha'
);

select is_empty(
  $$ select tablename || '.' || policyname from pg_policies
     where schemaname = 'public'
       and tablename in ('Transaction','Account','Budget','RecurringTransaction',
                         'UserConfig','SyncOp','OpenFinanceConnection')
       and policyname !~ '_require_aal2$'
       and coalesce(qual, with_check) !~ '\(\s*SELECT auth\.uid\(\)' $$,
  'todas as regras financeiras e só-do-dono leem auth.uid() uma vez (select)'
);

select is(
  (select count(*)::int from pg_policies
   where schemaname = 'public'
     and policyname like '%\_require\_aal2'
     and permissive = 'RESTRICTIVE'
     and qual ~ '^\(\s*SELECT fp_mfa_ok\(\)'
     and with_check ~ '^\(\s*SELECT fp_mfa_ok\(\)'),
  14,
  'as 14 RESTRICTIVE de 2FA chamam fp_mfa_ok() uma vez por consulta'
);

-- ─── Dados ──────────────────────────────────────────────────────────────────
insert into public."User" (id, name, email, "passwordHash", "passwordSalt", "updatedAt")
values ('dddd0000-0000-0000-0000-000000000001', 'Dona',   'd1@x.com', 'h', 's', now()),
       ('dddd0000-0000-0000-0000-000000000002', 'Membro', 'd2@x.com', 'h', 's', now()),
       ('dddd0000-0000-0000-0000-000000000003', 'Viewer', 'd3@x.com', 'h', 's', now()),
       ('dddd0000-0000-0000-0000-000000000004', 'Fora',   'd4@x.com', 'h', 's', now());

insert into public."Organization" (id, name, slug, "ownerId", "updatedAt")
values ('od1', 'Casa', 'casa-d', 'dddd0000-0000-0000-0000-000000000001', now());

insert into public."OrganizationMember" (id, "orgId", "userId", role)
values ('md2', 'od1', 'dddd0000-0000-0000-0000-000000000002', 'MEMBER'),
       ('md3', 'od1', 'dddd0000-0000-0000-0000-000000000003', 'VIEWER')
on conflict ("orgId", "userId") do nothing;

insert into public."Transaction" (id, "userId", type, amount, description, date, "orgId", "updatedAt")
values ('td_pessoal', 'dddd0000-0000-0000-0000-000000000001', 'despesa', 10, 'pessoal', now(), null,  now()),
       ('td_org',     'dddd0000-0000-0000-0000-000000000001', 'despesa', 20, 'da casa', now(), 'od1', now()),
       ('td_fora',    'dddd0000-0000-0000-0000-000000000004', 'despesa', 30, 'de fora', now(), null,  now());

set local role authenticated;

-- ─── MEMBER: vê e edita o da org, não o pessoal da dona ─────────────────────
set local request.jwt.claims to '{"sub":"dddd0000-0000-0000-0000-000000000002"}';
select results_eq(
  $$ select id from public."Transaction" order by id $$,
  $$ values ('td_org'::text) $$,
  'MEMBER vê só a transação da org'
);
create temp table _upd_membro on commit drop as
  with u as (update public."Transaction" set description = 'm' where id in ('td_org','td_pessoal') returning id)
  select array_agg(id order by id) as ids from u;
select is((select ids from _upd_membro), array['td_org']::text[], 'MEMBER edita a da org e não a pessoal');
select lives_ok(
  $$ insert into public."Transaction" (id, "userId", type, amount, description, date, "orgId", "updatedAt")
     values ('td_m_org', 'dddd0000-0000-0000-0000-000000000002', 'despesa', 1, 'x', now(), 'od1', now()) $$,
  'MEMBER lança na org'
);

-- ─── VIEWER: vê o da org, não edita nem lança nela ──────────────────────────
set local request.jwt.claims to '{"sub":"dddd0000-0000-0000-0000-000000000003"}';
select is((select count(*)::int from public."Transaction" where "orgId" = 'od1'), 2, 'VIEWER vê as da org');
create temp table _upd_viewer on commit drop as
  with u as (update public."Transaction" set description = 'v' where "orgId" = 'od1' returning 1)
  select count(*)::int as n from u;
select is((select n from _upd_viewer), 0, 'VIEWER não edita a da org');
select throws_ok(
  $$ insert into public."Transaction" (id, "userId", type, amount, description, date, "orgId", "updatedAt")
     values ('td_v_org', 'dddd0000-0000-0000-0000-000000000003', 'despesa', 1, 'x', now(), 'od1', now()) $$,
  '42501', null,
  'VIEWER não lança na org'
);
select lives_ok(
  $$ insert into public."Transaction" (id, "userId", type, amount, description, date, "updatedAt")
     values ('td_v_pessoal', 'dddd0000-0000-0000-0000-000000000003', 'despesa', 1, 'x', now(), now()) $$,
  'VIEWER lança a própria, fora da org'
);

-- ─── De fora: só o próprio ──────────────────────────────────────────────────
set local request.jwt.claims to '{"sub":"dddd0000-0000-0000-0000-000000000004"}';
select results_eq(
  $$ select id from public."Transaction" order by id $$,
  $$ values ('td_fora'::text) $$,
  'quem é de fora vê só a própria'
);
create temp table _del_fora on commit drop as
  with d as (delete from public."Transaction" where id in ('td_org','td_pessoal') returning 1)
  select count(*)::int as n from d;
select is((select n from _del_fora), 0, 'quem é de fora não apaga nada da dona');

-- ─── Dona: vê as dela e as da org ───────────────────────────────────────────
set local request.jwt.claims to '{"sub":"dddd0000-0000-0000-0000-000000000001"}';
select is(
  (select count(*)::int from public."Transaction"),
  3,
  'dona vê a pessoal, a da org e a que o MEMBER lançou na org'
);

-- ─── 2FA aplicado pela tabela (RESTRICTIVE em forma de InitPlan) ────────────
reset role;
insert into auth.users (id, email)
values ('dddd0000-0000-0000-0000-000000000001', 'd1@x.com')
on conflict (id) do nothing;
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values ('44444444-4444-4444-4444-444444444444', 'dddd0000-0000-0000-0000-000000000001',
        'FinançasPro', 'totp', 'verified', now(), now());
set local role authenticated;
set local request.jwt.claims to '{"sub":"dddd0000-0000-0000-0000-000000000001","aal":"aal1"}';
select is((select count(*)::int from public."Transaction"), 0, 'com TOTP verificado, sessão AAL1 não lê nada');
set local request.jwt.claims to '{"sub":"dddd0000-0000-0000-0000-000000000001","aal":"aal2"}';
select is((select count(*)::int from public."Transaction"), 3, 'depois do segundo fator (AAL2), lê de novo');

select * from finish();
rollback;
