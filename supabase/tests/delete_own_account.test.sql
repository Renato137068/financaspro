-- ============================================================================
-- Exclusão de conta pelo próprio usuário (pgTAP)
--
-- O que precisa ser verdade:
--   • a conta e o conteúdo dela somem, e o login (auth.users) junto;
--   • o AuditLog fica (prova de que a exclusão aconteceu), sem userId, IP,
--     navegador nem metadata;
--   • o AuditLog de outra pessoa não é tocado;
--   • sem login, a função recusa.
-- ============================================================================

begin;
select plan(7);

insert into auth.users (id, email) values
  ('de000000-0000-0000-0000-000000000001', 'sai@x.com'),
  ('de000000-0000-0000-0000-000000000002', 'fica@x.com')
on conflict (id) do nothing;
insert into public."User" (id, name, email, "updatedAt") values
  ('de000000-0000-0000-0000-000000000001', 'Sai', 'sai@x.com', now()),
  ('de000000-0000-0000-0000-000000000002', 'Fica', 'fica@x.com', now())
on conflict (id) do nothing;
insert into public."AuditLog" (id, "userId", action, resource, "ipAddress", "userAgent", metadata) values
  ('al-sai',  'de000000-0000-0000-0000-000000000001', 'login', 'auth', '203.0.113.7', 'Mozilla/5.0', '{"x":1}'),
  ('al-fica', 'de000000-0000-0000-0000-000000000002', 'login', 'auth', '198.51.100.9', 'Chrome', '{"y":2}');

set local role authenticated;
set local request.jwt.claims to '{"sub":"de000000-0000-0000-0000-000000000001"}';
select lives_ok($$ select public.fp_delete_own_account() $$, 'quem está logado apaga a própria conta');
reset role;

select is((select count(*)::int from public."User" where id = 'de000000-0000-0000-0000-000000000001'), 0, 'User apagado');
select is((select count(*)::int from auth.users where id = 'de000000-0000-0000-0000-000000000001'), 0, 'login apagado');

select is(
  (select row("userId", "ipAddress", "userAgent", metadata::text)::text from public."AuditLog" where id = 'al-sai'),
  row(null::text, null::text, null::text, null::text)::text,
  'AuditLog de quem saiu fica sem userId, IP, navegador e metadata'
);
select is(
  (select "ipAddress" from public."AuditLog" where id = 'al-fica'),
  '198.51.100.9',
  'AuditLog de outra pessoa fica como estava'
);
select is((select count(*)::int from public."User" where id = 'de000000-0000-0000-0000-000000000002'), 1, 'a outra conta fica');

set local role authenticated;
set local request.jwt.claims to '{}';
select throws_ok($$ select public.fp_delete_own_account() $$, 'P0001', 'NOT_AUTHENTICATED', 'sem login, recusa');
reset role;

select * from finish();
rollback;
