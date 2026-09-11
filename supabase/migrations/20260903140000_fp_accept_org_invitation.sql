-- Aceite de convite de org pelo convidado (RLS bloqueia self-insert em OrganizationMember).
-- SECURITY DEFINER valida token, e-mail do JWT e teto maxUsers do plano.

create or replace function public.fp_accept_org_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inv record;
  uid text := auth.uid()::text;
  user_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  seats int;
  max_u int;
begin
  if uid is null or uid = '' then
    raise exception 'nao-autenticado' using errcode = 'P0001';
  end if;
  if p_token is null or length(trim(p_token)) < 8 then
    raise exception 'convite-invalido' using errcode = 'P0001';
  end if;

  select * into inv
  from public."Invitation"
  where token = trim(p_token)
  for update;

  if not found then
    raise exception 'convite-invalido' using errcode = 'P0001';
  end if;
  if inv."acceptedAt" is not null then
    raise exception 'convite-ja-usado' using errcode = 'P0001';
  end if;
  if inv."expiresAt" < now() then
    raise exception 'convite-expirado' using errcode = 'P0001';
  end if;
  if lower(inv.email) <> user_email then
    raise exception 'convite-email-diferente' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public."OrganizationMember"
    where "orgId" = inv."orgId" and "userId" = uid
  ) then
    update public."Invitation" set "acceptedAt" = now() where id = inv.id;
    return jsonb_build_object('orgId', inv."orgId", 'role', inv.role, 'alreadyMember', true);
  end if;

  select p."maxUsers" into max_u
  from public."Subscription" s
  join public."Plan" p on p.id = s."planId"
  where s."orgId" = inv."orgId";

  -- Seed: 0 = ilimitado (Business). null/ausente = FREE (1).
  if max_u is null then
    max_u := 1;
  elsif max_u = 0 then
    max_u := null;
  end if;

  if max_u is not null then
    select count(*)::int into seats
    from public."OrganizationMember"
    where "orgId" = inv."orgId";
    if seats >= max_u then
      raise exception 'limite-membros' using errcode = 'P0001';
    end if;
  end if;

  insert into public."OrganizationMember" (id, "orgId", "userId", role, "joinedAt")
  values (gen_random_uuid()::text, inv."orgId", uid, inv.role, now());

  update public."Invitation" set "acceptedAt" = now() where id = inv.id;

  return jsonb_build_object('orgId', inv."orgId", 'role', inv.role, 'alreadyMember', false);
end;
$$;

revoke all on function public.fp_accept_org_invitation(text) from public;
grant execute on function public.fp_accept_org_invitation(text) to authenticated;
