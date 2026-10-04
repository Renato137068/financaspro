-- ============================================================================
-- Planos da assinatura (Gratuito, Pro, Business) — semear ou atualizar.
--
-- Substitui `npm run billing:seed` (backend/prisma/seed-plans.js, que usava o
-- Prisma Client e saiu com a API Express, ADR 0007). Mesmos valores.
--
-- Idempotente: cria o que falta e atualiza nome, preço, limites e recursos
-- pelo tier. NÃO mexe nos IDs de preço do Stripe já gravados: eles são de cada
-- ambiente e entram à parte (docs/release/ligar-operacao.md):
--
--   update public."Plan" set "stripePriceIdMonthly" = 'price_…',
--                           "stripePriceIdYearly"  = 'price_…'
--    where tier = 'PRO';
--
-- Não é migração de propósito: os testes pgTAP criam os próprios planos, e o
-- tier é único. Rodar com a conexão direta (porta 5432):
--   psql "<conexão DIRETA :5432>" -f supabase/seed/planos.sql
-- ============================================================================

insert into public."Plan" as p
  (id, name, tier, "priceMonthly", "priceYearly", "maxUsers", "maxTransPerMonth", "maxAccounts", "maxBudgets", features)
values
  (gen_random_uuid()::text, 'Gratuito', 'FREE', 0, 0, 1, 100, 3, 5,
   '["Transações básicas", "Orçamentos", "Relatórios simples"]'::jsonb),
  -- 129,99 = ~36% de desconto sobre 12 x 16,99 (203,88). Tiers do Play (não
  -- aceita 16,90). Pro é individual/casal (2 membros); colaboração de time é o
  -- gancho exclusivo do Business. 0 = ilimitado.
  (gen_random_uuid()::text, 'Pro', 'PRO', 16.99, 129.99, 2, 0, 20, 0,
   '["Tudo do Gratuito", "Transações ilimitadas", "Casal — até 2 membros", "IA e previsão financeira", "Exportação de relatórios", "Alertas automáticos"]'::jsonb),
  (gen_random_uuid()::text, 'Business', 'BUSINESS', 79.90, 799.00, 0, 0, 0, 0,
   '["Tudo do Pro", "Membros ilimitados", "Múltiplas organizações", "API access", "Suporte prioritário", "Relatórios customizados", "Auditoria completa"]'::jsonb)
on conflict (tier) do update set
  name               = excluded.name,
  "priceMonthly"     = excluded."priceMonthly",
  "priceYearly"      = excluded."priceYearly",
  "maxUsers"         = excluded."maxUsers",
  "maxTransPerMonth" = excluded."maxTransPerMonth",
  "maxAccounts"      = excluded."maxAccounts",
  "maxBudgets"       = excluded."maxBudgets",
  features           = excluded.features;

select tier, name, "priceMonthly", "priceYearly", "maxUsers",
       coalesce("stripePriceIdMonthly", '—') as stripe_mensal
  from public."Plan" order by "priceMonthly";
