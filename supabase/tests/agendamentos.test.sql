-- ============================================================================
-- Tarefas agendadas: retenção e disparo da reconciliação (pgTAP)
--
-- O que precisa ser verdade:
--   • o expurgo apaga só o que passou do prazo, tabela por tabela, e devolve
--     quantas linhas saíram de cada uma, sem nenhuma "erro: …";
--   • rodar de novo não apaga mais nada (o critério é a data);
--   • nem anon nem authenticated chamam as funções pelo PostgREST (rpc);
--   • sem pg_net (o Postgres do CI) ou sem os segredos no Vault, o disparo da reconciliação não faz nada e
--     diz por quê, em vez de quebrar o job do pg_cron.
-- ============================================================================

begin;
select plan(13);

insert into public."User" (id, name, email, "updatedAt")
values ('ag000000-0000-0000-0000-000000000001', 'Ana', 'ag@x.com', now());
insert into public."Organization" (id, name, slug, "ownerId", "updatedAt")
values ('o_ag', 'Org Ag', 'org-ag', 'ag000000-0000-0000-0000-000000000001', now());

-- Cada tabela com uma linha velha (fora do prazo) e uma nova (dentro).
insert into public."Session" (id, "refreshToken", "userId", "expiresAt") values
  ('s-velha', 'rt-velha', 'ag000000-0000-0000-0000-000000000001', now() - interval '31 days'),
  ('s-nova',  'rt-nova',  'ag000000-0000-0000-0000-000000000001', now() - interval '29 days');
insert into public."VerificationToken" (id, "tokenHash", type, "userId", "expiresAt") values
  ('vt-velho', 'h-velho', 'password_reset', 'ag000000-0000-0000-0000-000000000001', now() - interval '8 days'),
  ('vt-novo',  'h-novo',  'password_reset', 'ag000000-0000-0000-0000-000000000001', now() - interval '6 days');
insert into public."Invitation" (id, "orgId", email, token, "expiresAt") values
  ('inv-velho', 'o_ag', 'velho@x.com', 'tk-velho', now() - interval '31 days'),
  ('inv-novo',  'o_ag', 'novo@x.com',  'tk-novo',  now() + interval '3 days');
insert into public."JobLog" (id, queue, "jobId", name, data, "createdAt") values
  ('jl-velho', 'q', 'j-velho', 'n', '{}', now() - interval '91 days'),
  ('jl-novo',  'q', 'j-novo',  'n', '{}', now() - interval '89 days');
insert into public."AuditLog" (id, action, resource, "createdAt") values
  ('al-velho', 'a', 'r', now() - interval '366 days'),
  ('al-novo',  'a', 'r', now() - interval '364 days');
insert into public."SyncOp" (id, "userId", entity, "resourceId", action, "processedAt") values
  ('so-velho', 'ag000000-0000-0000-0000-000000000001', 'tx', 'x', 'upsert', now() - interval '91 days'),
  ('so-novo',  'ag000000-0000-0000-0000-000000000001', 'tx', 'y', 'upsert', now() - interval '89 days');
insert into public."StripeWebhookEvent" (id, type, "processedAt") values
  ('evt-velho', 't', now() - interval '91 days'),
  ('evt-novo',  't', now() - interval '89 days');

-- Contagens e leituras filtram pelos ids deste teste: no CI o banco é
-- compartilhado com outros passos, que deixam linhas recentes (dentro do prazo).
select is(
  public.fp_purge_retention(),
  '{"Session": 1, "VerificationToken": 1, "Invitation": 1, "JobLog": 1, "AuditLog": 1, "SyncOp": 1, "StripeWebhookEvent": 1}'::jsonb,
  'expurgo apaga uma linha velha de cada tabela e diz quantas'
);

select is((select id from public."Session" where id like 's-%'), 's-nova', 'Session: fica a de 29 dias');
select is((select id from public."VerificationToken" where id like 'vt-%'), 'vt-novo', 'VerificationToken: fica o de 6 dias');
select is((select id from public."Invitation" where id like 'inv-%'), 'inv-novo', 'Invitation: fica o convite em aberto');
select is((select id from public."JobLog" where id like 'jl-%'), 'jl-novo', 'JobLog: fica o de 89 dias');
select is((select id from public."AuditLog" where id like 'al-%'), 'al-novo', 'AuditLog: fica o de 364 dias');
select is((select id from public."SyncOp" where id like 'so-%'), 'so-novo', 'SyncOp: fica o de 89 dias');
select is((select id from public."StripeWebhookEvent" where id like 'evt-%'), 'evt-novo', 'StripeWebhookEvent: fica o de 89 dias');

select is(
  (select sum(value::text::int) from jsonb_each(public.fp_purge_retention()))::int,
  0,
  'segunda rodada no mesmo dia não apaga mais nada'
);

select ok(
  public.fp_disparar_billing_reconcile() in ('sem-pg_net', 'sem-vault', 'sem-segredos'),
  'sem pg_net, Vault ou segredos o disparo da reconciliação não faz nada e diz por quê'
);

set local role authenticated;
select throws_ok($$ select public.fp_purge_retention() $$, '42501', null, 'authenticated não chama o expurgo');
select throws_ok($$ select public.fp_disparar_billing_reconcile() $$, '42501', null, 'authenticated não dispara a reconciliação');
reset role;

set local role anon;
select throws_ok($$ select public.fp_purge_retention() $$, '42501', null, 'anon não chama o expurgo');
reset role;

select * from finish();
rollback;
