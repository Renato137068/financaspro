-- ============================================================================
-- Testes dos códigos de recuperação do 2FA (pgTAP)
-- Rodar com: supabase test db
--
-- O que precisa ser verdade:
--   • gerar exige AAL2 (senão um atacante com só a senha emite os próprios);
--   • o código em claro nunca fica no banco;
--   • consumir funciona em AAL1, uma única vez, e devolve a conta;
--   • códigos de outra pessoa não servem.
-- ============================================================================

begin;
select plan(8);

-- ─── Estrutura ──────────────────────────────────────────────────────────────
select has_table('public', 'MfaRecoveryCode', 'tabela de códigos existe');
select has_function('public', 'fp_mfa_recovery_generate', 'generate existe');
select has_function('public', 'fp_mfa_recovery_consume', 'consume existe');

-- ─── Usuários ───────────────────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('44444444-4444-4444-4444-444444444444', 'comfator@x.com'),
  ('55555555-5555-5555-5555-555555555555', 'outro@x.com')
on conflict (id) do nothing;

insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values (
  '66666666-6666-6666-6666-666666666666',
  '44444444-4444-4444-4444-444444444444',
  'FinançasPro', 'totp', 'verified', now(), now()
)
on conflict (id) do nothing;

-- ─── AAL1 não gera códigos ──────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to '{"sub":"44444444-4444-4444-4444-444444444444","aal":"aal1"}';

select throws_ok(
  $$ select public.fp_mfa_recovery_generate() $$,
  'MFA_REQUIRED',
  'quem está em AAL1 NÃO consegue emitir códigos novos'
);

-- ─── AAL2 gera 10 códigos, e nenhum fica em claro ───────────────────────────
set local request.jwt.claims to '{"sub":"44444444-4444-4444-4444-444444444444","aal":"aal2"}';

create temp table codigos_gerados on commit drop as
  select public.fp_mfa_recovery_generate() as codigo;

select is(
  (select count(*)::int from codigos_gerados),
  10,
  'gera 10 códigos de uma vez'
);

-- A tabela é revogada de `authenticated` de propósito (acesso só via funções
-- SECURITY DEFINER). Ler o hash cru para conferir que nada fica em claro é ato
-- administrativo: roda como dono, depois volta para authenticated.
reset role;
select is(
  (select count(*)::int
   from public."MfaRecoveryCode" m
   join codigos_gerados c on m."codeHash" = c.codigo),
  0,
  'nenhum código está guardado em claro (só o hash)'
);
set local role authenticated;

-- ─── Código de OUTRA pessoa não vale ────────────────────────────────────────
set local request.jwt.claims to '{"sub":"55555555-5555-5555-5555-555555555555","aal":"aal1"}';

select ok(
  not public.fp_mfa_recovery_consume((select codigo from codigos_gerados limit 1)),
  'código de outro usuário é recusado'
);

-- ─── O dono consome em AAL1 e recupera a conta ──────────────────────────────
set local request.jwt.claims to '{"sub":"44444444-4444-4444-4444-444444444444","aal":"aal1"}';

select ok(
  public.fp_mfa_recovery_consume((select codigo from codigos_gerados limit 1)),
  'o dono usa o código mesmo em AAL1 — é o ponto da recuperação'
);

select * from finish();
rollback;
