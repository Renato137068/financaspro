-- ============================================================================
-- Exclusão de conta pelo próprio usuário (LGPD + Google Play)
-- ============================================================================
-- Chamada via client.rpc('fp_delete_own_account') com JWT do usuário logado.
-- Apaga dados na nuvem e remove auth.users; dados locais no aparelho não são
-- afetados (o app encerra a sessão depois da RPC).
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
  delete from public."User" where id = uid;

  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.fp_delete_own_account() from public;
grant execute on function public.fp_delete_own_account() to authenticated;
