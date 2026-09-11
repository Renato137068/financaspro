-- Aceite de convite (fp_accept_org_invitation) — smoke pgTAP.
-- Roda no CI com stub de auth; valida existência e grant da função.

begin;
select plan(2);

select has_function(
  'public',
  'fp_accept_org_invitation',
  array['text'],
  'fp_accept_org_invitation(text) existe'
);

select ok(
  has_function_privilege('authenticated', 'public.fp_accept_org_invitation(text)', 'execute'),
  'authenticated pode executar fp_accept_org_invitation'
);

select * from finish();
rollback;
