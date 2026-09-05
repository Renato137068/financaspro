# Deploy billing Edge — checklist

Depois das melhorias de monetização (portal, cancel, org-invite, Resend, RPC de convite).

## 1. Migration

```bash
npx supabase db push
# inclui 20260903140000_fp_accept_org_invitation.sql
```

## 2. Functions

```bash
npx supabase functions deploy stripe-checkout
npx supabase functions deploy stripe-portal
npx supabase functions deploy stripe-cancel
npx supabase functions deploy org-invite
npx supabase functions deploy welcome-trial
npx supabase functions deploy stripe-webhook --no-verify-jwt
npx supabase functions deploy play-verify
npx supabase functions deploy play-rtdn --no-verify-jwt
```

## 3. Secrets

```bash
npx supabase secrets set STRIPE_SECRET_KEY=sk_live_...
npx supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
npx supabase secrets set APP_URL=https://seu-dominio
npx supabase secrets set BILLING_ALLOWED_ORIGINS=https://seu-dominio,capacitor://localhost
npx supabase secrets set RESEND_API_KEY=re_...
npx supabase secrets set EMAIL_FROM="FinançasPro <noreply@seu-dominio>"
npx supabase secrets set PLAY_PACKAGE_NAME=com.financaspro.mobile
npx supabase secrets set PLAY_RTDN_SECRET=...
# + GOOGLE_PLAY_SERVICE_ACCOUNT_JSON conforme runbook Play
```

## 4. Stripe Dashboard

Webhook → `https://<PROJECT_REF>.supabase.co/functions/v1/stripe-webhook`

Eventos: `invoice.payment_succeeded`, `invoice.payment_failed`,
`customer.subscription.updated`, `customer.subscription.deleted`,
`checkout.session.completed`.

## 5. Smoke manual

1. Checkout web Pro → trial 7 dias
2. Portal / cancel no paywall (assinante Stripe)
3. Equipe → convidar e-mail (Recebe Resend se key setada)
4. Abrir `?invite=TOKEN` com a conta convidada
5. Banner PAST_DUE: simular `invoice.payment_failed` no Stripe test

**Nota:** o client **não** faz fallback para insert direto se `org-invite` estiver
ausente (404/503). Sem deploy da function, o convite falha de propósito — gate
PRO+/assentos/e-mail ficam garantidos.

## 6. Play Console

Trial 7 dias nos SKUs Pro (ver `docs/play-store-billing-runbook.md`).
Ficha: `docs/play-store-ficha.md` (sem “sem cadastro”).

## Migrations da v12 (quota v2 + Pro de boas-vindas)

```bash
npx supabase db push
```

Duas migrations novas, nesta ordem:

1. `20260904120000_quota_v2_limites_por_profundidade.sql` — tira o teto de
   transações, sobe contas para 5 e cria as colunas de limite novas em
   `fp_plan_limit_config`.
2. `20260904140000_welcome_trial.sql` — cria `fp_welcome_trial_grant` (uma
   concessão por usuário, para sempre) e faz `fp_plan_tier` **respeitar
   `trialEndsAt`**.

> A segunda parte do item 2 não é detalhe. `fp_plan_tier` aceitava `TRIALING`
> sem olhar a data. Para assinatura do Stripe isso funciona porque o webhook
> vira o status; o Pro de boas-vindas é entitlement nosso e não tem webhook
> nenhum, então **sem essa migration um trial de 14 dias vira PRO vitalício**.
> Não faça deploy da `welcome-trial` sem ela.

Smoke depois do push:

```sql
-- deve devolver FREE, não PRO
select public.fp_plan_tier('<uid-com-trial-vencido>');
```
