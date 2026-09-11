-- ============================================================================
-- Quota v2 — limite por profundidade, nao por volume de uso
-- ============================================================================
-- Muda o eixo do plano gratuito (decisao de produto de 2026-09):
--
--   * teto de transacoes por mes deixa de existir. Travar o registro no meio do
--     mes quebrava o habito de quem usa o app todo dia -- inclusive de quem
--     pagaria. Volume de uso nunca mais e limitado.
--   * contas sobem de 3 para 5. Tres estourava durante o proprio onboarding
--     (corrente + poupanca + dois cartoes e a configuracao tipica do publico).
--   * entram os limites novos: metas, recorrentes, contas a pagar, gastos
--     fixos, categorias personalizadas, anexos, dispositivos, janela de
--     analise e cota mensal de OCR.
--
-- Espelha config/plan-limits.json. Paridade testada em
-- tests/plan-limits-parity.test.js.
-- ============================================================================

alter table public.fp_plan_limit_config
  add column if not exists max_custom_categories int,
  add column if not exists max_goals             int,
  add column if not exists max_recurring         int,
  add column if not exists max_bills_to_pay      int,
  add column if not exists max_subscriptions     int,
  add column if not exists max_attachments       int,
  add column if not exists max_devices           int,
  add column if not exists history_months        int,
  add column if not exists ocr_per_month         int;

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

-- fp_get_plan_limits ganha as colunas novas. CREATE OR REPLACE nao pode mudar
-- o RETURNS TABLE — precisa DROP antes (SQLSTATE 42P13).
drop function if exists public.fp_get_plan_limits(text);
create function public.fp_get_plan_limits(p_tier text)
returns table (
  max_trans_per_month   int,
  max_accounts          int,
  max_budgets           int,
  max_custom_categories int,
  max_goals             int,
  max_recurring         int,
  max_bills_to_pay      int,
  max_subscriptions     int,
  max_attachments       int,
  max_devices           int,
  history_months        int,
  ocr_per_month         int
)
language sql stable set search_path = public, pg_temp as $$
  select c.max_trans_per_month, c.max_accounts, c.max_budgets,
         c.max_custom_categories, c.max_goals, c.max_recurring,
         c.max_bills_to_pay, c.max_subscriptions, c.max_attachments,
         c.max_devices, c.history_months, c.ocr_per_month
  from public.fp_plan_limit_config c
  where c.tier = coalesce(nullif(btrim(p_tier), ''), 'FREE');
$$;

-- O trigger de transacao continua existindo, mas fica inerte: com
-- max_trans_per_month nulo em todos os tiers, ele retorna NEW sempre. Mantido
-- no lugar para que reativar um teto seja mudar uma linha de dado, nao
-- reescrever enforcement.
