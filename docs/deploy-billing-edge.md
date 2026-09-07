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

---

## Migrations da v13 (correções da auditoria pré-beta)

```bash
# Antes de tudo: confira se o que está no repositório é o que está no banco.
npx supabase migration list
```

Esse `list` não é formalidade. A migration `20260904120000_quota_v2` foi
**editada depois de já ter sido aplicada**, e `db push` não reaplica migration
registrada — o arquivo passou a descrever um estado que o banco pode não ter.
Se os hashes divergirem, não edite a antiga: o delta vem na v13 abaixo.

```bash
npx supabase db push
```

Três migrations, nesta ordem:

1. `20260906120000_fp_plan_tier_precedencia.sql` — `fp_plan_tier` passa a
   resolver pelo **melhor** plano (BUSINESS > PRO > FREE), com `joinedAt` só
   como desempate. Antes ordenava só por `joinedAt asc`, e como toda org nasce
   com uma Subscription FREE ACTIVE, quem era convidado para uma org Pro
   continuava com limites de FREE — o segundo assento do Pro não entregava nada.
2. `20260906130000_quota_userconfig_sem_travar.sql` — o trigger de `UserConfig`
   para de recusar o **INSERT**. O grandfather lia `OLD.data`, que no INSERT não
   existe; quem chegava com estado local acima do limite tinha a linha recusada
   para sempre (sem linha, a próxima tentativa também era INSERT), e junto ia
   toda a config — renda, tema, onboarding. O UPDATE continua recusando aumento.
   A mesma migration reafirma `fp_plan_limit_config` de forma idempotente,
   fechando a dúvida do `migration list` acima.

Smoke depois do push:

```sql
-- Convidado de org Pro tem que devolver PRO, mesmo com org própria mais antiga.
select public.fp_plan_tier('<uid-do-convidado>');

-- Primeira gravação de config acima do limite tem que passar (estado herdado).
-- Aumento posterior tem que continuar levantando QUOTA_EXCEEDED:goal.
```

## Secret novo: `PLAY_SANDBOX_ENABLED`

```bash
# NÃO defina em produção. Só na faixa de testes internos, se precisar.
npx supabase secrets set PLAY_SANDBOX_ENABLED=1
```

O modo sandbox aceitava qualquer `purchaseToken` começando com `GPA.test.`
sempre que `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` estivesse **ausente**. Isso
transformava esquecimento de configuração em permissão: sem o service account,
ninguém conseguia pagar (503 nas compras reais) e qualquer um conseguia não
pagar (30 dias de Pro sem verificação). Agora o sandbox exige opt-in explícito,
e a falta do service account volta a ser o que é — erro de configuração.

**Confira antes de abrir a faixa de testes:**

```bash
npx supabase secrets list | grep -E 'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON|PLAY_PACKAGE_NAME|PLAY_SANDBOX_ENABLED'
```

`GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` presente e `PLAY_SANDBOX_ENABLED` ausente é
a combinação correta para produção.

---

## Testar o RTDN

O `play-rtdn` é por onde renovação, cancelamento, revogação e estorno chegam.
Ele nunca é exercitado por um teste de compra comum, então vale testar sozinho.

### Do Play Console

Monetização → Assinaturas → **Enviar notificação de teste**. A resposta esperada
agora é explícita:

```json
{"ok":true,"handled":true,"tipo":"teste","reason":"notificacao-de-teste-do-play-console"}
```

Antes ela vinha como `handled:false, reason:"sem-subscription-notification"`, o
que parecia endpoint quebrado quando estava funcionando.

### Por curl, sem esperar o Google

Com `PLAY_RTDN_SECRET` definido (o header não trafega em log de URL):

```bash
DADOS=$(printf '%s' '{"subscriptionNotification":{"notificationType":2,"purchaseToken":"<TOKEN_REAL>"}}' | base64 -w0)

curl -i -X POST "https://<PROJETO>.supabase.co/functions/v1/play-rtdn" \
  -H "x-rtdn-secret: $PLAY_RTDN_SECRET" \
  -H 'Content-Type: application/json' \
  -d "{\"message\":{\"messageId\":\"teste-1\",\"data\":\"$DADOS\"}}"
```

Como ler a resposta:

| Resposta | Significa |
|---|---|
| `handled:true` + `entitled:true` | reconsultou o Google e renovou o entitlement |
| `handled:true` + `entitled:false` | revogou — é o que tem que acontecer no estorno |
| `handled:false, reason:"token-desconhecido"` | **o token não está no banco**: o `play-verify` não gravou a compra. Toda notificação dessa assinatura vai cair aqui em silêncio |
| `403` | segredo errado ou ausente |
| `503` | nem `PLAY_RTDN_SERVICE_ACCOUNT` nem `PLAY_RTDN_SECRET` configurados |
| `duplicate:true` | messageId repetido — a idempotência funcionou |

Repetir o mesmo `messageId` deve devolver `duplicate:true`. Se devolver
`ok:true` duas vezes, a idempotência não está de pé.

### Cenários já cobertos

Estes foram exercitados com Deno e um banco de mentira (envelopes reais do
Pub/Sub, Google mockado) e estão travados por `tests/play-rtdn-notificacoes.test.js`:

- sem mecanismo de auth → 503, falha fechada
- segredo ausente/errado → 403; certo → processa
- `GET` → 405; envelope ilegível → 204 (reconhece, não entra em loop de reentrega)
- renovação → grava entitlement; revogação → revoga
- cancelamento com ciclo pago em aberto → mantém Pro com `cancelAtPeriodEnd`
- `messageId` repetido → `duplicate:true`
- estorno (`voidedPurchaseNotification`) → reconsulta e revoga
