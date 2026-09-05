# Edge Functions — Billing (Google Play + Stripe)

Port do billing do backend Express para Supabase Edge Functions (Deno).
A lógica é a mesma já testada no Express — muda o empacotamento.

```
functions/
  _shared/google-play.ts    # OAuth2 conta de serviço (RS256 via Web Crypto) + subscriptionsv2.get
  _shared/db.ts             # cliente service_role + entitlement (reusa "stripeSubId" = play:<token>)
  _shared/play-billing.ts   # verifyPurchase / syncFromToken / handleRtdn
  _shared/stripe.ts         # cliente Stripe (fetch client) + anti-open-redirect + notify(stub)
  _shared/stripe-billing.ts # createCheckout / createPortal / cancelSubscription / processStripeEvent
  play-verify/index.ts      # POST autenticado (app) — verifica compra Play, exige OWNER
  play-rtdn/index.ts        # webhook público do Pub/Sub — renova/revoga
  stripe-checkout/index.ts  # POST autenticado (web) — cria sessão de checkout, exige OWNER
  stripe-portal/index.ts    # POST autenticado (web) — Customer Portal Stripe, exige OWNER
  stripe-cancel/index.ts    # POST autenticado (web) — cancel_at_period_end, exige OWNER
  org-invite/index.ts       # POST autenticado — convite + e-mail Resend, exige ADMIN/OWNER
  stripe-webhook/index.ts   # webhook público do Stripe (assinatura via Web Crypto)
```

## Secrets (Supabase → Project Settings → Edge Functions → Secrets)

| Secret | Uso |
|---|---|
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | JSON da conta de serviço (verificação na Google API) |
| `PLAY_PACKAGE_NAME` | `com.financaspro.mobile` |
| `PLAY_RTDN_SERVICE_ACCOUNT` | **preferido** — e-mail da service account do push do Pub/Sub (autenticação OIDC, nada secreto na URL) |
| `PLAY_RTDN_AUDIENCE` | (opcional) audience configurada no push, se você definiu uma |
| `PLAY_RTDN_SECRET` | alternativa — segredo compartilhado; envie no header `x-rtdn-secret`. Na query string (`?secret=`) ainda funciona, mas é deprecado |
| `STRIPE_SECRET_KEY` | chave secreta do Stripe (checkout + webhook) |
| `STRIPE_WEBHOOK_SECRET` | signing secret do endpoint de webhook do Stripe |
| `APP_URL` | origem permitida para success/cancel do checkout (anti-open-redirect) |
| `BILLING_ALLOWED_ORIGINS` | (opcional) origens extras, separadas por vírgula |
| `RESEND_API_KEY` | (opcional) envia e-mails de billing/convite; sem chave = só log |
| `EMAIL_FROM` | (opcional) remetente Resend, ex. `FinançasPro <noreply@dominio>` |

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são injetados automaticamente.

## Deploy

```bash
# Autenticadas (JWT do usuário) — mantêm verify_jwt padrão
supabase functions deploy play-verify
supabase functions deploy stripe-checkout
supabase functions deploy stripe-portal
supabase functions deploy stripe-cancel
supabase functions deploy org-invite

# Server-to-server (Pub/Sub e Stripe) — SEM JWT de usuário
supabase functions deploy play-rtdn      --no-verify-jwt
supabase functions deploy stripe-webhook --no-verify-jwt

supabase secrets set GOOGLE_PLAY_SERVICE_ACCOUNT_JSON="$(cat conta-servico.json)"
supabase secrets set PLAY_PACKAGE_NAME=com.financaspro.mobile
supabase secrets set PLAY_RTDN_SECRET=<seu-segredo>
supabase secrets set STRIPE_SECRET_KEY=sk_live_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
supabase secrets set APP_URL=https://seu-dominio
supabase secrets set RESEND_API_KEY=re_...
supabase secrets set EMAIL_FROM="FinançasPro <noreply@seu-dominio>"
```

No dashboard do Stripe, aponte o endpoint de webhook para
`https://<PROJECT_REF>.supabase.co/functions/v1/stripe-webhook` e assine os
eventos: `invoice.payment_succeeded`, `invoice.payment_failed`,
`customer.subscription.updated`, `customer.subscription.deleted`,
`checkout.session.completed`.

## Muda no runbook do Play Console

A URL de push do Pub/Sub (em `docs/play-store-billing-runbook.md`, Fase 3) passa
a ser a da Edge Function — não mais o Railway:

```
https://<PROJECT_REF>.supabase.co/functions/v1/play-rtdn
```

Autentique o push por **OIDC**, não por segredo na URL — a URL aparece em log de
proxy, de plataforma e de erro, e um segredo em log deixa de ser segredo:

```bash
gcloud pubsub subscriptions update <SUB> \
  --push-auth-service-account=<SA>@<PROJETO>.iam.gserviceaccount.com

supabase secrets set PLAY_RTDN_SERVICE_ACCOUNT=<SA>@<PROJETO>.iam.gserviceaccount.com
```

O caminho antigo (`?secret=<PLAY_RTDN_SECRET>`) continua aceito para não derrubar
integração existente, e registra um aviso no log a cada chamada. Com nenhum dos
dois configurados a função passa a recusar tudo com 503 — antes ela aceitava
qualquer POST quando o segredo estava vazio.

E o app chama, no lugar da API antiga, com o JWT do usuário logado:

```
POST https://<PROJECT_REF>.supabase.co/functions/v1/play-verify
Authorization: Bearer <supabase access token>
{ "orgId": "...", "productId": "financaspro.pro.monthly", "purchaseToken": "..." }
```

## Ainda a fazer

- Sem `RESEND_API_KEY`, `notify()` só loga (dev/CI). Em produção, configure Resend.
- Testes: portar os casos de `tests/backend/*billing*.test.js` para testes de
  function (Deno test) contra um Supabase local.
