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
  obs-ingest/index.ts       # público — relatórios de erro → fp_client_error; aviso de uso → fp_app_sessao_dia
  billing-reconcile/index.ts # pg_cron (diário) — confere Play e Stripe com a loja; segredo no header
  _shared/reconcile.ts      # reconcilePlay / reconcileStripe (usados pelo billing-reconcile)
  _shared/segredo.ts        # comparação de segredo em tempo constante (play-rtdn, billing-reconcile)
  _shared/obs-sanitize.js   # allowlist de contexto + máscara de e-mail/valores (testado no Jest)
```

## Secrets (Supabase → Project Settings → Edge Functions → Secrets)

| Secret | Uso |
|---|---|
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | JSON da conta de serviço (verificação na Google API) |
| `PLAY_PACKAGE_NAME` | `com.financaspro.mobile` |
| `PLAY_RTDN_SERVICE_ACCOUNT` | **preferido** — e-mail da service account do push do Pub/Sub (autenticação OIDC, nada secreto na URL) |
| `PLAY_RTDN_AUDIENCE` | (opcional) audience configurada no push, se você definiu uma |
| `PLAY_RTDN_SECRET` | alternativa — segredo compartilhado **só** no header `x-rtdn-secret` (`?secret=` foi removido — vaza em logs) |
| `STRIPE_SECRET_KEY` | chave secreta do Stripe (checkout + webhook) |
| `STRIPE_WEBHOOK_SECRET` | signing secret do endpoint de webhook do Stripe |
| `APP_URL` | origem permitida para success/cancel do checkout (anti-open-redirect) |
| `BILLING_ALLOWED_ORIGINS` | (opcional) origens extras, separadas por vírgula |
| `RESEND_API_KEY` | (opcional) envia e-mails de billing/convite; sem chave = só log |
| `EMAIL_FROM` | (opcional) remetente Resend, ex. `FinançasPro <noreply@dominio>` |
| `BILLING_RECONCILE_SECRET` | segredo do header `x-fp-cron-secret` da `billing-reconcile`; o mesmo valor vai no Vault como `fp_billing_reconcile_secret` (ver `docs/release/ligar-operacao.md`) |

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são injetados automaticamente.

## Deploy

Pelo workflow de release (tag `vX.Y.Z`, `docs/release/entrega-continua.md`) ou à
mão, com o mesmo script. Ele publica toda pasta daqui que tem `index.ts` (as que
começam com `_` são código compartilhado) e passa `--no-verify-jwt` só às que
recebem chamada sem JWT de usuário — `play-rtdn` e `stripe-webhook`
(server-to-server) e `obs-ingest` (`navigator.sendBeacon` não envia header de
auth). Cada uma dessas diz isso no cabeçalho do `index.ts`, e o teste
`tests/release-cd.test.js` confere que a lista do script bate.

```bash
node scripts/deploy-supabase.cjs --dry-run   # confere os comandos
node scripts/deploy-supabase.cjs             # db push + todas as funções
node scripts/deploy-supabase.cjs --so-funcoes
```

No dashboard do Stripe, aponte o endpoint de webhook para
`https://<PROJECT_REF>.supabase.co/functions/v1/stripe-webhook` e assine os
eventos: `invoice.payment_succeeded`, `invoice.payment_failed`,
`customer.subscription.updated`, `customer.subscription.deleted`,
`checkout.session.completed`.

Biblioteca: `npm:stripe@22.6.2`, API `2026-08-26.dahlia` (antes: `stripe@16`
pelo esm.sh, API `2024-06-20`). Nessa API a fatura aponta a assinatura em
`parent.subscription_details` e o período atual mora no item da assinatura;
`stripe-billing.ts` lê os dois formatos, porque o corpo do webhook vem na
versão configurada no endpoint. Conferência no modo de teste do Stripe:
`docs/release/ligar-operacao.md`, passo 9.

O `supabase-js` também vem do npm com versão exata
(`npm:@supabase/supabase-js@2.117.2`, a mesma do app). Nenhuma dependência
das funções passa pelo esm.sh.

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

`?secret=` **não é mais aceito** (nem Edge nem Express). Use OIDC ou
`x-rtdn-secret`. Com nenhum mecanismo configurado a função recusa com 503.

E o app chama, no lugar da API antiga, com o JWT do usuário logado:

```
POST https://<PROJECT_REF>.supabase.co/functions/v1/play-verify
Authorization: Bearer <supabase access token>
{ "orgId": "...", "productId": "financaspro.pro.monthly", "purchaseToken": "..." }
```

## Testes

`npm run test:edge` e `npm run check:edge-types` (precisam do Deno 2; o CI
roda os dois no job "Edge Functions (Deno)"
e o workflow de release roda antes de publicar). Os testes ficam em `_testes/`
e executam os módulos de verdade — `play-billing.ts`, `stripe-billing.ts`,
`db.ts`, `google-play.ts` e os handlers de `stripe-webhook` e `play-rtdn` —
com dublês trocados pelo import map de `_testes/deno.json`:

```
_testes/dubles/banco.ts       # banco em memória com a API encadeada do supabase-js
_testes/dubles/supabase-js.ts # adminClient() devolve esse banco
_testes/dubles/stripe.ts      # Stripe falso que registra cada chamada
_testes/stripe-sdk.test.ts    # a biblioteca do Stripe de verdade ("stripe-real"), com a API simulada por fetch falso
_testes/dubles/rede.ts        # fetch falso: OAuth e Play API do Google, tokeninfo, Resend
```

Nenhum teste sai para a rede (uma URL sem rota falha o teste); a única
descarga é a do pacote `npm:stripe` pelo próprio Deno, antes de os testes rodarem. O JWT da conta
de serviço é assinado de verdade, com uma chave RSA gerada no teste. Os casos
vieram de `tests/backend/*billing*.test.js` (o Express congelado), mais os que
só existem aqui: sandbox só com opt-in, pacote vindo da env, chave legada
truncada, compra anulada, OIDC do Pub/Sub, liberação do claim quando o
processamento falha.

## Ainda a fazer

- Sem `RESEND_API_KEY`, `notify()` só loga (dev/CI). Em produção, configure Resend.
