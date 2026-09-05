-- ============================================================================
-- M1 — teto de tentativas no consumo de código de recuperação (pgTAP)
-- Rodar com: supabase test db
--
-- O que precisa ser verdade:
--   • falhas dentro da janela se acumulam e travam na 6ª tentativa;
--   • quem acerta não é punido por falhas anteriores;
--   • a tabela de tentativas é invisível para o cliente.
-- ============================================================================

begin;
select plan(7);

select has_table('public', 'MfaRecoveryAttempt', 'tabela de tentativas existe');

select is(
  (select count(*)::int from pg_tables t
    where t.schemaname = 'public' and t.tablename = 'MfaRecoveryAttempt' and t.rowsecurity),
  1,
  'RLS ligada na tabela de tentativas'
);

select ok(
  not has_table_privilege('authenticated', 'public."MfaRecoveryAttempt"', 'select'),
  'o cliente não lê a tabela de tentativas'
);

-- ─── Usuário com 2FA e códigos ──────────────────────────────────────────────
insert into auth.users (id, email)
values ('77777777-7777-7777-7777-777777777777', 'limite@x.com')
on conflict (id) do nothing;

insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values ('88888888-8888-8888-8888-888888888888',
        '77777777-7777-7777-7777-777777777777',
        'FinançasPro', 'totp', 'verified', now(), now())
on conflict (id) do nothing;

set local role authenticated;
set local request.jwt.claims to '{"sub":"77777777-7777-7777-7777-777777777777","aal":"aal2"}';

create temp table cods on commit drop as
  select public.fp_mfa_recovery_generate() as codigo;

-- ─── Cinco chutes errados: recusados, mas ainda avaliados ───────────────────
set local request.jwt.claims to '{"sub":"77777777-7777-7777-7777-777777777777","aal":"aal1"}';

select is(
  (select count(*) filter (where not public.fp_mfa_recovery_consume('AAAA-BBBB-CCCC-DDD' || g))::int
     from generate_series(1, 5) g),
  5,
  'os cinco primeiros chutes são recusados sem travar'
);

-- ─── A sexta tentativa bate no teto ─────────────────────────────────────────
select throws_like(
  $$ select public.fp_mfa_recovery_consume('AAAA-BBBB-CCCC-DDDD') $$,
  'RECOVERY_RATE_LIMITED:%',
  'a sexta tentativa é bloqueada, com o tempo restante no erro'
);

-- ─── O código certo também respeita o teto enquanto ele durar ───────────────
select throws_like(
  $$ select public.fp_mfa_recovery_consume((select codigo from cods limit 1)) $$,
  'RECOVERY_RATE_LIMITED:%',
  'durante o bloqueio, nem o código certo passa — o teto vem antes da busca'
);

-- ─── Sem falhas recentes, o código certo entra ──────────────────────────────
delete from public."MfaRecoveryAttempt"
 where "userId" = '77777777-7777-7777-7777-777777777777';

select ok(
  public.fp_mfa_recovery_consume((select codigo from cods limit 1)),
  'passada a janela, o código certo funciona normalmente'
);

select * from finish();
rollback;
