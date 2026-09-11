-- ============================================================================
-- Bootstrap de organização: membro OWNER + assinatura FREE ao criar org.
-- O cliente só insere em "Organization"; o restante roda com SECURITY DEFINER.
-- ============================================================================

create or replace function public.handle_new_organization()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  free_plan_id text;
begin
  insert into public."OrganizationMember" (id, "orgId", "userId", role, "joinedAt")
  values (gen_random_uuid()::text, NEW.id, NEW."ownerId", 'OWNER', now())
  on conflict do nothing;

  select id into free_plan_id from public."Plan" where tier = 'FREE' limit 1;
  if free_plan_id is not null then
    insert into public."Subscription" (
      id, "orgId", "planId", status, "billingInterval",
      "currentPeriodStart", "currentPeriodEnd", "updatedAt"
    )
    values (
      gen_random_uuid()::text,
      NEW.id,
      free_plan_id,
      'ACTIVE',
      'monthly',
      now(),
      now() + interval '10 years',
      now()
    )
    on conflict ("orgId") do nothing;
  end if;

  return NEW;
end;
$$;

drop trigger if exists on_organization_created on public."Organization";
create trigger on_organization_created
  after insert on public."Organization"
  for each row execute function public.handle_new_organization();
