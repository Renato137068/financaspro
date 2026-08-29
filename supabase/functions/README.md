# Edge Functions — Billing (Google Play)

Port do Play Billing do backend Express para Supabase Edge Functions (Deno).
A lógica é a mesma já testada no Express — muda o empacotamento.

```
functions/
  _shared/google-play.ts   # OAuth2 conta de serviço (RS256 via Web Crypto) + subscriptionsv2.get
  _shared/db.ts            # cliente service_role + entitlement (reusa "stripeSubId" = play:<token>)
  _shared/play-billing.ts  # verifyPurchase / syncFromToken / handleRtdn
  play-verify/index.ts     # POST autenticado (app) — verifica compra, exige OWNER da org
  play-rtdn/index.ts       # webhook público do Pub/Sub — renova/revoga
```

## Secrets (Supabase → Project Settings → Edge Functions → Secrets)

| Secret | Uso |
|---|---|
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | JSON da conta de serviço (verificação na Google API) |
| `PLAY_PACKAGE_NAME` | `com.financaspro.mobile` |
| `PLAY_RTDN_SECRET` | segredo do webhook (mesmo valor na URL do push do Pub/Sub) |

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são injetados automaticamente.

## Deploy

```bash
# play-verify exige JWT do usuário (autenticada) — padrão, mantém verify_jwt
supabase functions deploy play-verify

# play-rtdn é server-to-server (Pub/Sub) — SEM JWT de usuário
supabase functions deploy play-rtdn --no-verify-jwt

supabase secrets set GOOGLE_PLAY_SERVICE_ACCOUNT_JSON="$(cat conta-servico.json)"
supabase secrets set PLAY_PACKAGE_NAME=com.financaspro.mobile
supabase secrets set PLAY_RTDN_SECRET=<seu-segredo>
```

## Muda no runbook do Play Console

A URL de push do Pub/Sub (em `docs/play-store-billing-runbook.md`, Fase 3) passa
a ser a da Edge Function — não mais o Railway:

```
https://<PROJECT_REF>.supabase.co/functions/v1/play-rtdn?secret=<PLAY_RTDN_SECRET>
```

E o app chama, no lugar da API antiga, com o JWT do usuário logado:

```
POST https://<PROJECT_REF>.supabase.co/functions/v1/play-verify
Authorization: Bearer <supabase access token>
{ "orgId": "...", "productId": "financaspro.pro.monthly", "purchaseToken": "..." }
```

## Ainda a fazer

- Stripe (`stripe-webhook`, `stripe-checkout`) — mesmo padrão, na sequência.
- Testes: portar os casos de `tests/backend/play-billing.service.test.js` para
  testes de function (Deno test) contra um Supabase local.
- Não executado neste ambiente (sem Deno/Supabase); pronto para `deno check` e
  deploy quando o projeto existir.
