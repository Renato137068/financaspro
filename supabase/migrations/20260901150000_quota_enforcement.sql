-- ============================================================================
-- Quota enforcement no Postgres (espelha backend/middleware/plan.js)
-- ============================================================================
-- O app Supabase grava direto no PostgREST com anon key + RLS. Estas funções e
-- triggers rejeitam inserts que ultrapassam o tier FREE mesmo sem passar pelo
-- Express. PRO/BUSINESS: limites NULL = ilimitado.
-- Limites numéricos espelham config/plan-limits.json (paridade testada em
-- tests/plan-limits-parity.test.js).
-- ============================================================================

-- ─── Tabela única de limites numéricos (fonte no SQL) ───────────────────────

create table if not exists public.fp_plan_limit_config (
  tier                text primary key,
  max_trans_per_month int,
  max_accounts        int,
  max_budgets         int
);

insert into public.fp_plan_limit_config (tier, max_trans_per_month, max_accounts, max_budgets) values
  ('FREE',     100,  3,  5),
  ('PRO',      null, 20, null),
  ('BUSINESS', null, null, null)
on conflict (tier) do update set
  max_trans_per_month = excluded.max_trans_per_month,
  max_accounts        = excluded.max_accounts,
  max_budgets         = excluded.max_budgets;

-- ─── Bypass: service_role (Edge Functions) ou sem JWT (auth.uid() nulo) ─────

create or replace function public.fp_quota_bypass()
returns boolean
language sql stable set search_path = public, pg_temp as $$
  select coalesce(auth.jwt() ->> 'role', '') = 'service_role'
      or auth.uid() is null;
$$;

-- ─── Tier ativo do usuário (réplica de getUserPlanTier em plan.js) ──────────

create or replace function public.fp_plan_tier(uid text)
returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_tier text;
begin
  if uid is null or btrim(uid) = '' then
    return 'FREE';
  end if;

  select p.tier::text into v_tier
  from public."OrganizationMember" m
  join public."Organization" o on o.id = m."orgId"
  join public."Subscription" s on s."orgId" = o.id
  join public."Plan" p on p.id = s."planId"
  where m."userId" = uid
    and o.active = true
    and s.status::text in ('ACTIVE', 'TRIALING')
  order by m."joinedAt" asc
  limit 1;

  if v_tier is not null then
    return v_tier;
  end if;

  return 'FREE';
end;
$$;

create or replace function public.fp_get_plan_limits(p_tier text)
returns table (
  max_trans_per_month int,
  max_accounts        int,
  max_budgets         int
)
language sql stable set search_path = public, pg_temp as $$
  select c.max_trans_per_month, c.max_accounts, c.max_budgets
  from public.fp_plan_limit_config c
  where c.tier = coalesce(nullif(btrim(p_tier), ''), 'FREE');
$$;

-- ─── Triggers BEFORE INSERT ─────────────────────────────────────────────────

create or replace function public.fp_enforce_transaction_quota()
returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  v_tier text;
  v_max  int;
  v_count int;
begin
  if public.fp_quota_bypass() then
    return NEW;
  end if;

  v_tier := public.fp_plan_tier(NEW."userId");

  select l.max_trans_per_month into v_max
  from public.fp_get_plan_limits(v_tier) l;

  if v_max is null then
    return NEW;
  end if;

  select count(*)::int into v_count
  from public."Transaction" t
  where t."userId" = NEW."userId"
    and t."deletedAt" is null
    and t."createdAt" >= date_trunc('month', timezone('utc', now()))
    and t."createdAt" < date_trunc('month', timezone('utc', now())) + interval '1 month';

  if v_count >= v_max then
    raise exception using errcode = 'P0001', message = 'QUOTA_EXCEEDED:transaction';
  end if;

  return NEW;
end;
$$;

create or replace function public.fp_enforce_account_quota()
returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  v_tier text;
  v_max  int;
  v_count int;
begin
  if public.fp_quota_bypass() then
    return NEW;
  end if;

  if coalesce(NEW.active, true) = false then
    return NEW;
  end if;

  v_tier := public.fp_plan_tier(NEW."userId");

  select l.max_accounts into v_max
  from public.fp_get_plan_limits(v_tier) l;

  if v_max is null then
    return NEW;
  end if;

  select count(*)::int into v_count
  from public."Account" a
  where a."userId" = NEW."userId"
    and a.active = true;

  if v_count >= v_max then
    raise exception using errcode = 'P0001', message = 'QUOTA_EXCEEDED:account';
  end if;

  return NEW;
end;
$$;

create or replace function public.fp_enforce_budget_quota()
returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  v_tier text;
  v_max  int;
  v_count int;
begin
  if public.fp_quota_bypass() then
    return NEW;
  end if;

  if coalesce(NEW.active, true) = false or coalesce(NEW.limit, 0) <= 0 then
    return NEW;
  end if;

  v_tier := public.fp_plan_tier(NEW."userId");

  select l.max_budgets into v_max
  from public.fp_get_plan_limits(v_tier) l;

  if v_max is null then
    return NEW;
  end if;

  select count(*)::int into v_count
  from public."Budget" b
  where b."userId" = NEW."userId"
    and b.active = true
    and b.limit > 0;

  if v_count >= v_max then
    raise exception using errcode = 'P0001', message = 'QUOTA_EXCEEDED:budget';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_fp_transaction_quota on public."Transaction";
create trigger trg_fp_transaction_quota
  before insert on public."Transaction"
  for each row execute function public.fp_enforce_transaction_quota();

drop trigger if exists trg_fp_account_quota on public."Account";
create trigger trg_fp_account_quota
  before insert on public."Account"
  for each row execute function public.fp_enforce_account_quota();

drop trigger if exists trg_fp_budget_quota on public."Budget";
create trigger trg_fp_budget_quota
  before insert on public."Budget"
  for each row execute function public.fp_enforce_budget_quota();
