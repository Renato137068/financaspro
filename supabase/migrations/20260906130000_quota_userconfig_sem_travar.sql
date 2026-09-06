-- ============================================================================
-- Quota v4 — o UserConfig nunca fica preso, e os limites voltam a ser afirmados
-- ============================================================================
-- Dois achados da auditoria pré-beta, no mesmo arquivo porque tocam a mesma
-- tabela e devem subir juntos.
--
-- ─── Achado 07: o INSERT rejeitado nunca vira UPDATE ────────────────────────
--
-- O trigger de UserConfig levanta exceção na LINHA INTEIRA, e UserConfig.data
-- é um JSON só: metas, contas a pagar, assinaturas e categorias viajam junto
-- com renda, tema e estado de onboarding.
--
-- A cláusula de grandfather (`v_new > v_old`) resolve o downgrade: quem já
-- tinha 2 metas no banco continua salvando, porque v_old também é 2. Mas ela
-- lê OLD.data, e no INSERT não existe OLD — v_old vale 0. Então quem chega com
-- estado local acima do limite (usou o app sem login, ou criou as metas durante
-- o Pro de boas-vindas antes da primeira sincronização da config) tem o INSERT
-- recusado. E como a linha nunca é criada, a próxima tentativa também é um
-- INSERT, com v_old = 0 de novo. Trava para sempre: a config na nuvem nunca
-- sai do zero, e a pessoa só descobre ao instalar em outro aparelho.
--
-- O INSERT passa a ser tratado como o downgrade já era: estado que chega é
-- estado que fica. Ninguém ganha nada com isso — os itens já existem no
-- aparelho, e a criação de novos continua barrada em dois lugares. No cliente,
-- BILLING.guardQuota() barra antes de gravar, com a mensagem que explica o
-- Pro (js/metas.js, contas-pagar.js, assinaturas.js, categories.js). No banco,
-- o UPDATE continua recusando qualquer aumento.
--
-- ─── Achado 06: a migration de quota v2 foi editada depois de aplicada ──────
--
-- `supabase db push` não reaplica migration já registrada, então a edição
-- posterior de 20260904120000 pode nunca ter chegado ao banco. Este INSERT
-- reafirma a tabela inteira via `on conflict do update`, de forma idempotente:
-- rodar de novo não faz mal, e o estado final passa a estar descrito por uma
-- migration que com certeza ainda não foi aplicada em lugar nenhum.
--
-- Os valores são os mesmos de config/plan-limits.json — a paridade é conferida
-- por tests/plan-limits-parity.test.js, que lê a migration *quota* mais
-- recente (esta) e compara com o JSON canônico.
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

-- ─── Trigger de UserConfig: recusa aumento, nunca tranca a linha ────────────

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

  /* Primeira gravação da config na nuvem: o estado local já existe no
     aparelho e recusá-lo não devolve nada a ninguém — só impede a linha de
     nascer, e sem linha o próximo push também é INSERT. Ver o cabeçalho. */
  if TG_OP = 'INSERT' then
    return NEW;
  end if;

  v_tier := public.fp_plan_tier(NEW."userId");

  -- goals → metas
  select l.max_goals into v_max from public.fp_get_plan_limits(v_tier) l;
  if v_max is not null then
    v_new := public.fp_json_array_len(NEW.data, 'metas');
    v_old := public.fp_json_array_len(OLD.data, 'metas');
    if v_new > v_max and v_new > v_old then
      raise exception using errcode = 'P0001', message = 'QUOTA_EXCEEDED:goal';
    end if;
  end if;

  -- bills → contasPagar
  select l.max_bills_to_pay into v_max from public.fp_get_plan_limits(v_tier) l;
  if v_max is not null then
    v_new := public.fp_json_array_len(NEW.data, 'contasPagar');
    v_old := public.fp_json_array_len(OLD.data, 'contasPagar');
    if v_new > v_max and v_new > v_old then
      raise exception using errcode = 'P0001', message = 'QUOTA_EXCEEDED:bill';
    end if;
  end if;

  -- subscriptions (gastos fixos) → assinaturas
  select l.max_subscriptions into v_max from public.fp_get_plan_limits(v_tier) l;
  if v_max is not null then
    v_new := public.fp_json_array_len(NEW.data, 'assinaturas');
    v_old := public.fp_json_array_len(OLD.data, 'assinaturas');
    if v_new > v_max and v_new > v_old then
      raise exception using errcode = 'P0001', message = 'QUOTA_EXCEEDED:subscription';
    end if;
  end if;

  -- custom categories → categoriasCustom
  select l.max_custom_categories into v_max from public.fp_get_plan_limits(v_tier) l;
  if v_max is not null then
    v_new := public.fp_json_custom_category_count(NEW.data);
    v_old := public.fp_json_custom_category_count(OLD.data);
    if v_new > v_max and v_new > v_old then
      raise exception using errcode = 'P0001', message = 'QUOTA_EXCEEDED:category';
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_fp_userconfig_quota on public."UserConfig";
create trigger trg_fp_userconfig_quota
  before insert or update of data on public."UserConfig"
  for each row execute function public.fp_enforce_userconfig_quota();
