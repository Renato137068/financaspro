-- ============================================================================
-- Exclusão de conta: sem IP nem navegador no AuditLog que sobra
-- ============================================================================
-- O AuditLog tem relação opcional com User: ao apagar a conta o FK faz
-- SET NULL e a linha fica, porque é a prova de quem fez o quê (inclusive de
-- que a exclusão foi atendida). O backend Express limpava ipAddress,
-- userAgent e metadata antes do delete; a fp_delete_own_account, que é o
-- caminho do app desde a ADR 0004, não limpava. Endereço IP é dado pessoal
-- (LGPD art. 5º, I): sem a limpeza, sobrava dado pessoal órfão até o prazo de
-- 365 dias da retenção. Com a saída do Express (ADR 0007), a regra passa a
-- viver só aqui.
-- ============================================================================

create or replace function public.fp_delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  uid text := auth.uid()::text;
  org_rec record;
begin
  if uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  for org_rec in select id from public."Organization" where "ownerId" = uid loop
    delete from public."Transaction" where "orgId" = org_rec.id;
    delete from public."RecurringTransaction" where "orgId" = org_rec.id;
    delete from public."Account" where "orgId" = org_rec.id;
    delete from public."Budget" where "orgId" = org_rec.id;
    delete from public."UsageRecord" where "subscriptionId" in (
      select id from public."Subscription" where "orgId" = org_rec.id
    );
    delete from public."Invoice" where "subscriptionId" in (
      select id from public."Subscription" where "orgId" = org_rec.id
    );
    delete from public."Subscription" where "orgId" = org_rec.id;
    delete from public."Invitation" where "orgId" = org_rec.id;
    delete from public."OrganizationMember" where "orgId" = org_rec.id;
    delete from public."Organization" where id = org_rec.id;
  end loop;

  delete from public."Transaction" where "userId" = uid;
  delete from public."RecurringTransaction" where "userId" = uid;
  delete from public."Account" where "userId" = uid;
  delete from public."Budget" where "userId" = uid;
  delete from public."UserConfig" where "userId" = uid;
  delete from public."SyncOp" where "userId" = uid;
  delete from public."OpenFinanceConnection" where "userId" = uid;
  delete from public."OrganizationMember" where "userId" = uid;
  -- AuditLog fica (é a prova de que a exclusão aconteceu; o FK faz SET NULL),
  -- mas sem o que identifica a pessoa. Mesma transação: se o delete falhar,
  -- não sobra log meio anonimizado.
  update public."AuditLog"
     set "ipAddress" = null, "userAgent" = null, metadata = null
   where "userId" = uid;
  delete from public."User" where id = uid;

  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.fp_delete_own_account() from public;
grant execute on function public.fp_delete_own_account() to authenticated;
