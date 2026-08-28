-- ============================================================================
-- RLS (Row Level Security) — FinançasPro no Supabase
-- ============================================================================
-- Roda DEPOIS que as tabelas existem (migrations do Prisma aplicadas ao
-- Postgres do Supabase). O Prisma continua dono do schema; este arquivo só
-- adiciona segurança.
--
-- Princípios:
--   • RLS habilitada em TODAS as tabelas — negado por padrão.
--   • Padrão de acesso "dono OU membro da org": a maioria das tabelas tem
--     "userId" (dono) e "orgId" opcional (recurso compartilhado com a org).
--   • IDs do Prisma são TEXT (uuid como string), então comparamos com
--     auth.uid()::text — nunca com auth.uid() cru (que é uuid).
--   • Colunas em camelCase (padrão Prisma) → sempre entre aspas.
--   • Escrita sensível (billing) NÃO tem policy: só o service_role (Edge
--     Functions) escreve, e ele ignora RLS por design.
-- ============================================================================

-- ─── Funções auxiliares ─────────────────────────────────────────────────────
-- SECURITY DEFINER: leem "OrganizationMember" sem disparar a RLS da própria
-- tabela (evita recursão infinita nas policies). search_path fixo por segurança.

create or replace function public.is_org_member(target_org text)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public."OrganizationMember" m
    where m."orgId" = target_org and m."userId" = auth.uid()::text
  );
$$;

create or replace function public.is_org_editor(target_org text)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public."OrganizationMember" m
    where m."orgId" = target_org and m."userId" = auth.uid()::text
      and m.role::text in ('OWNER','ADMIN','MEMBER')   -- VIEWER é só leitura
  );
$$;

create or replace function public.is_org_admin(target_org text)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public."OrganizationMember" m
    where m."orgId" = target_org and m."userId" = auth.uid()::text
      and m.role::text in ('OWNER','ADMIN')
  );
$$;

-- ─── User ───────────────────────────────────────────────────────────────────
alter table public."User" enable row level security;

create policy user_select_own on public."User"
  for select using (id = auth.uid()::text);
create policy user_update_own on public."User"
  for update using (id = auth.uid()::text) with check (id = auth.uid()::text);
-- Sem insert/delete pelo cliente: criação vem do trigger de auth (Fase 3).

-- ─── Tabelas financeiras (dono OU org) ──────────────────────────────────────
-- Mesmo padrão para Transaction, Account, Budget, RecurringTransaction.

do $$
declare t text;
begin
  foreach t in array array['Transaction','Account','Budget','RecurringTransaction']
  loop
    execute format('alter table public.%I enable row level security;', t);

    execute format($f$
      create policy %I on public.%I for select using (
        "userId" = auth.uid()::text
        or ("orgId" is not null and public.is_org_member("orgId"))
      );$f$, t||'_select', t);

    execute format($f$
      create policy %I on public.%I for insert with check (
        "userId" = auth.uid()::text
        and ("orgId" is null or public.is_org_editor("orgId"))
      );$f$, t||'_insert', t);

    execute format($f$
      create policy %I on public.%I for update using (
        "userId" = auth.uid()::text
        or ("orgId" is not null and public.is_org_editor("orgId"))
      );$f$, t||'_update', t);

    execute format($f$
      create policy %I on public.%I for delete using (
        "userId" = auth.uid()::text
        or ("orgId" is not null and public.is_org_editor("orgId"))
      );$f$, t||'_delete', t);
  end loop;
end $$;

-- ─── Tabelas só-do-dono ─────────────────────────────────────────────────────
-- UserConfig (PK userId), SyncOp (userId), OpenFinanceConnection (userId).

alter table public."UserConfig" enable row level security;
create policy userconfig_all on public."UserConfig"
  for all using ("userId" = auth.uid()::text) with check ("userId" = auth.uid()::text);

alter table public."SyncOp" enable row level security;
create policy syncop_all on public."SyncOp"
  for all using ("userId" = auth.uid()::text) with check ("userId" = auth.uid()::text);

alter table public."OpenFinanceConnection" enable row level security;
create policy ofc_all on public."OpenFinanceConnection"
  for all using ("userId" = auth.uid()::text) with check ("userId" = auth.uid()::text);

-- ─── Organização / membros / convites ───────────────────────────────────────
alter table public."Organization" enable row level security;
create policy org_select on public."Organization"
  for select using ("ownerId" = auth.uid()::text or public.is_org_member(id));
create policy org_insert on public."Organization"
  for insert with check ("ownerId" = auth.uid()::text);
create policy org_update on public."Organization"
  for update using ("ownerId" = auth.uid()::text or public.is_org_admin(id));
create policy org_delete on public."Organization"
  for delete using ("ownerId" = auth.uid()::text);

alter table public."OrganizationMember" enable row level security;
create policy orgmember_select on public."OrganizationMember"
  for select using ("userId" = auth.uid()::text or public.is_org_member("orgId"));
create policy orgmember_insert on public."OrganizationMember"
  for insert with check (public.is_org_admin("orgId"));
create policy orgmember_update on public."OrganizationMember"
  for update using (public.is_org_admin("orgId"));
create policy orgmember_delete on public."OrganizationMember"
  for delete using (public.is_org_admin("orgId") or "userId" = auth.uid()::text);

alter table public."Invitation" enable row level security;
create policy invitation_select on public."Invitation"
  for select using (public.is_org_admin("orgId") or email = (auth.jwt() ->> 'email'));
create policy invitation_write on public."Invitation"
  for all using (public.is_org_admin("orgId")) with check (public.is_org_admin("orgId"));

-- ─── Planos (leitura pública) ───────────────────────────────────────────────
alter table public."Plan" enable row level security;
create policy plan_select_all on public."Plan" for select using (true);
-- Sem policy de escrita: só service_role (seed/admin).

-- ─── Billing (leitura p/ membros; escrita só service_role) ───────────────────
alter table public."Subscription" enable row level security;
create policy sub_select on public."Subscription"
  for select using (public.is_org_member("orgId"));

alter table public."UsageRecord" enable row level security;
create policy usage_select on public."UsageRecord"
  for select using (exists (
    select 1 from public."Subscription" s
    where s.id = "subscriptionId" and public.is_org_member(s."orgId")
  ));

alter table public."Invoice" enable row level security;
create policy invoice_select on public."Invoice"
  for select using (exists (
    select 1 from public."Subscription" s
    where s.id = "subscriptionId" and public.is_org_member(s."orgId")
  ));

-- ─── Tabelas internas (deny-all; só service_role) ───────────────────────────
-- RLS ligada e SEM policies = nenhum cliente acessa. Edge Functions com
-- service_role ignoram RLS e escrevem normalmente.

alter table public."AuditLog"           enable row level security;
alter table public."StripeWebhookEvent" enable row level security;
alter table public."JobLog"             enable row level security;
alter table public."Session"            enable row level security;
alter table public."VerificationToken"  enable row level security;
