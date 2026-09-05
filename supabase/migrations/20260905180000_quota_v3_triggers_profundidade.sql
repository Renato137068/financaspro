-- ============================================================================
-- Quota v3 — triggers de profundidade (RISK-03)
-- ============================================================================
-- A v2 já gravou max_goals / max_recurring / max_bills_to_pay / etc. em
-- fp_plan_limit_config, mas só Account e Budget tinham BEFORE INSERT.
-- Metas, contas a pagar, gastos fixos e categorias custom vivem em
-- UserConfig.data (JSON). Recorrentes cloud usam RecurringTransaction.
--
-- Anexos (IndexedDB) e OCR (localStorage) continuam só no cliente — sem tabela
-- Postgres equivalente nesta etapa.
--
-- Re-upsert dos limites: tests/plan-limits-parity.test.js lê a migration
-- *quota* mais recente e espera o INSERT de 12 colunas numéricas.
-- ============================================================================

insert into public.fp_plan_limit_config (
  tier, max_trans_per_month, max_accounts, max_budgets,
  max_custom_categories, max_goals, max_recurring, max_bills_to_pay,
  max_subscriptions, max_attachments, max_devices, history_months, ocr_per_month
) values
  ('FREE',     null, 5,    5,    5,    1,    3,    5,    5,    10,   1,    3,    5),
  ('PRO',      null, null, null, null, null, null, null, null, null, null, null, null),
  ('BUSINESS', null, null, null, null, null, null, null, null, null, null, null, null)
on conflict (tier) do update set
  max_trans_per_month   = excluded.max_trans_per_month,
  max_accounts          = excluded.max_accounts,
  max_budgets           = excluded.max_budgets,
  max_custom_categories = excluded.max_custom_categories,
  max_goals             = excluded.max_goals,
  max_recurring         = excluded.max_recurring,
  max_bills_to_pay      = excluded.max_bills_to_pay,
  max_subscriptions     = excluded.max_subscriptions,
  max_attachments       = excluded.max_attachments,
  max_devices           = excluded.max_devices,
  history_months        = excluded.history_months,
  ocr_per_month         = excluded.ocr_per_month;

-- ─── Helpers JSON (UserConfig.data) ─────────────────────────────────────────

create or replace function public.fp_json_array_len(p_data jsonb, p_key text)
returns int
language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_data is null then 0
    when jsonb_typeof(p_data -> p_key) = 'array'
      then coalesce(jsonb_array_length(p_data -> p_key), 0)
    else 0
  end;
$$;

create or replace function public.fp_json_custom_category_count(p_data jsonb)
returns int
language sql immutable set search_path = public, pg_temp as $$
  select coalesce(sum(
    case
      when jsonb_typeof(e.value) = 'array' then jsonb_array_length(e.value)
      else 0
    end
  ), 0)::int
  from jsonb_each(coalesce(p_data -> 'categoriasCustom', '{}'::jsonb)) e;
$$;

-- ─── RecurringTransaction ───────────────────────────────────────────────────

create or replace function public.fp_enforce_recurring_quota()
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

  select l.max_recurring into v_max
  from public.fp_get_plan_limits(v_tier) l;

  if v_max is null then
    return NEW;
  end if;

  select count(*)::int into v_count
  from public."RecurringTransaction" r
  where r."userId" = NEW."userId"
    and r.active = true;

  if v_count >= v_max then
    raise exception using errcode = 'P0001', message = 'QUOTA_EXCEEDED:recurring';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_fp_recurring_quota on public."RecurringTransaction";
create trigger trg_fp_recurring_quota
  before insert on public."RecurringTransaction"
  for each row execute function public.fp_enforce_recurring_quota();

-- ─── UserConfig (metas / contas a pagar / assinaturas / categorias) ─────────
-- Só rejeita quando a contagem NOVA ultrapassa o teto E aumentou vs OLD
-- (não prende quem já estava acima do limite após downgrade).

create or replace function public.fp_enforce_userconfig_quota()
returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  v_tier text;
  v_max  int;
  v_new  int;
  v_old  int;
begin
  if public.fp_quota_bypass() then
    return NEW;
  end if;

  v_tier := public.fp_plan_tier(NEW."userId");

  -- goals → metas
  select l.max_goals into v_max from public.fp_get_plan_limits(v_tier) l;
  if v_max is not null then
    v_new := public.fp_json_array_len(NEW.data, 'metas');
    if v_new > v_max then
      v_old := case when TG_OP = 'UPDATE'
        then public.fp_json_array_len(OLD.data, 'metas') else 0 end;
      if v_new > v_old then
        raise exception using errcode = 'P0001', message = 'QUOTA_EXCEEDED:goal';
      end if;
    end if;
  end if;

  -- bills → contasPagar
  select l.max_bills_to_pay into v_max from public.fp_get_plan_limits(v_tier) l;
  if v_max is not null then
    v_new := public.fp_json_array_len(NEW.data, 'contasPagar');
    if v_new > v_max then
      v_old := case when TG_OP = 'UPDATE'
        then public.fp_json_array_len(OLD.data, 'contasPagar') else 0 end;
      if v_new > v_old then
        raise exception using errcode = 'P0001', message = 'QUOTA_EXCEEDED:bill';
      end if;
    end if;
  end if;

  -- subscriptions (gastos fixos) → assinaturas
  select l.max_subscriptions into v_max from public.fp_get_plan_limits(v_tier) l;
  if v_max is not null then
    v_new := public.fp_json_array_len(NEW.data, 'assinaturas');
    if v_new > v_max then
      v_old := case when TG_OP = 'UPDATE'
        then public.fp_json_array_len(OLD.data, 'assinaturas') else 0 end;
      if v_new > v_old then
        raise exception using errcode = 'P0001', message = 'QUOTA_EXCEEDED:subscription';
      end if;
    end if;
  end if;

  -- custom categories → categoriasCustom
  select l.max_custom_categories into v_max from public.fp_get_plan_limits(v_tier) l;
  if v_max is not null then
    v_new := public.fp_json_custom_category_count(NEW.data);
    if v_new > v_max then
      v_old := case when TG_OP = 'UPDATE'
        then public.fp_json_custom_category_count(OLD.data) else 0 end;
      if v_new > v_old then
        raise exception using errcode = 'P0001', message = 'QUOTA_EXCEEDED:category';
      end if;
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_fp_userconfig_quota on public."UserConfig";
create trigger trg_fp_userconfig_quota
  before insert or update of data on public."UserConfig"
  for each row execute function public.fp_enforce_userconfig_quota();
