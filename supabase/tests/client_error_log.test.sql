-- ============================================================================
-- Relatórios de erro do app (pgTAP)
--
-- O que precisa ser verdade:
--   • a tabela existe com RLS ligada;
--   • nem anon nem authenticated leem ou gravam pelo PostgREST — relatório de
--     erro de um usuário não pode ser lido por outro, e ninguém injeta linhas
--     sem passar pela Edge Function (que sanitiza e aplica os limites).
-- ============================================================================

begin;
select plan(5);

select has_table('public', 'fp_client_error', 'tabela de relatórios de erro existe');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.fp_client_error'::regclass),
  'fp_client_error tem RLS habilitada'
);

select is_empty(
  $$ select 1 from pg_policies where schemaname = 'public' and tablename = 'fp_client_error' $$,
  'fp_client_error não tem policy — só service_role acessa'
);

set local role authenticated;
select throws_ok(
  $$ insert into public.fp_client_error (message) values ('forjado') $$,
  '42501',
  null,
  'authenticated não grava relatório direto'
);
reset role;

set local role anon;
select throws_ok(
  $$ select count(*) from public.fp_client_error $$,
  '42501',
  null,
  'anon não lê relatórios'
);
reset role;

select * from finish();
rollback;
