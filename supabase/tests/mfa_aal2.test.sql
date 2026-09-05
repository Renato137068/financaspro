-- ============================================================================
-- Testes de 2FA no banco (pgTAP) — provam que AAL1 não passa quando a conta
-- tem TOTP verificado. Rodar com: supabase test db
--
-- O 2FA que só existe na tela não protege nada: a sessão devolvida pelo
-- signInWithPassword já é válida para o PostgREST. Estes testes exigem que o
-- banco recuse essa sessão.
-- ============================================================================

begin;
select plan(6);

-- ─── Estrutura ──────────────────────────────────────────────────────────────
select has_function('public', 'fp_mfa_ok', 'fp_mfa_ok() existe');

select is(
  (select count(*)::int
   from pg_policies
   where schemaname = 'public'
     and tablename = 'Transaction'
     and policyname = 'Transaction_require_aal2'
     and permissive = 'RESTRICTIVE'),
  1,
  'Transaction tem policy RESTRICTIVE de AAL2'
);

select is(
  (select count(*)::int
   from pg_policies
   where schemaname = 'public'
     and policyname like '%_require_aal2'
     and permissive = 'RESTRICTIVE'),
  14,
  'as 14 tabelas com dado do usuário estão cobertas'
);

-- ─── Conta SEM 2FA: nada muda ───────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","aal":"aal1"}';

select ok(
  public.fp_mfa_ok(),
  'sem fator verificado, AAL1 continua liberado'
);

-- ─── Conta COM 2FA verificado ───────────────────────────────────────────────
reset role;

insert into auth.users (id, email)
values ('22222222-2222-2222-2222-222222222222', 'mfa@x.com')
on conflict (id) do nothing;

insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values (
  '33333333-3333-3333-3333-333333333333',
  '22222222-2222-2222-2222-222222222222',
  'FinançasPro', 'totp', 'verified', now(), now()
)
on conflict (id) do nothing;

set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","aal":"aal1"}';

select ok(
  not public.fp_mfa_ok(),
  'com TOTP verificado, sessão AAL1 é RECUSADA (o gate não é só de UI)'
);

set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","aal":"aal2"}';

select ok(
  public.fp_mfa_ok(),
  'depois do segundo fator (AAL2), a sessão passa'
);

select * from finish();
rollback;
