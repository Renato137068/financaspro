# Execução no Supabase — passo a passo ordenado

Roteiro para ligar um projeto Supabase ao app: schema, regras de acesso (RLS),
Edge Functions e segredos. Faça na ordem. Detalhes de cada parte:
`supabase/README.md` (RLS e testes do banco) e `supabase/functions/README.md`
(funções e segredos).

Legenda: 🧑 = você (precisa da conta) · 🤖 = comando do repo.

> **Migrações só pelo `scripts/deploy-supabase.cjs`.** Ele roda
> `supabase db push`, que registra cada migração aplicada em
> `supabase_migrations.schema_migrations` e aplica só as que faltam, em ordem.
> Não aplique arquivo de `supabase/migrations/` com `psql` nem pelo SQL Editor:
> o `db push` seguinte não sabe que ela entrou, tenta de novo e falha (algumas
> migrações antigas não são reexecutáveis, e uma delas regrava limites de
> plano antes de falhar).

---

## Fase 1 — Projeto e schema

1. 🧑 **Criar o projeto** em supabase.com. Anote de **Settings → API**:
   `Project URL`, `anon key`, `service_role key`; de **Settings → Database**: a
   senha do Postgres e a **connection string direta** (porta 5432; o pooler,
   6543, não serve para migração).

2. 🤖 **Tabelas do Prisma** (migrações em `prisma/migrations/`). As migrações
   do Supabase dependem delas, então vêm antes, uma vez por projeto novo:
   ```bash
   DATABASE_URL="<conexão DIRETA :5432>" npm run db:migrate:prod
   ```

3. 🤖 **Migrações do Supabase** (RLS, gatilhos, cotas, 2FA, agendamentos, tudo
   em `supabase/migrations/`), pelo mesmo script do release:
   ```bash
   export SUPABASE_ACCESS_TOKEN=<token da conta> SUPABASE_PROJECT_REF=<REF> SUPABASE_DB_PASSWORD=<senha>
   node scripts/deploy-supabase.cjs --dry-run        # mostra os comandos
   node scripts/deploy-supabase.cjs --so-migracoes   # link + db push
   npx supabase migration list                       # confere: local e remoto iguais
   ```
   Se a produção já recebeu alguma migração por `psql` (roteiros antigos
   mandavam), o `migration list` mostra a linha só do lado local. Não rode o
   arquivo de novo: marque como aplicada e siga.
   ```bash
   npx supabase migration repair --status applied <versão>   # ex.: 20260828120000
   ```

4. 🤖 **Semear os planos** (Gratuito, Pro e Business). Não é migração: é um
   seed reexecutável, que atualiza preço e limites sem apagar os IDs de preço
   do Stripe já gravados. Rode pelo SQL Editor do painel (cole o arquivo) ou:
   ```bash
   psql "<conexão DIRETA :5432>" -f supabase/seed/planos.sql
   ```

5. 🤖 **Testes do banco** antes de liberar dado real (Postgres local, sem tocar
   na produção; ver `supabase/README.md`):
   ```bash
   INTEGRATION_TEST_DATABASE_URL="postgresql://..." npm run test:db:ci
   ```
   ⛔ **Não libere dado real antes destes testes passarem.**

---

## Fase 2 — Auth

6. 🧑 No painel **Authentication → Providers**: habilitar e-mail/senha (e o que
   mais quiser) e configurar os templates de e-mail. O gatilho que cria a
   linha em `User` para cada conta nova já vem nas migrações (passo 3).

7. 🤖 **Front**: `SUPABASE_URL` e `SUPABASE_ANON_KEY` entram no build por
   `scripts/inject-supabase-env.cjs` (vazios, o app segue só local).

---

## Fase 3 — Edge Functions (cobrança)

8. 🧑 **Deploy das funções**: pelo workflow de release (tag `vX.Y.Z`, ver
   `docs/release/entrega-continua.md`), que roda o mesmo script, ou à mão:
   ```bash
   node scripts/deploy-supabase.cjs --so-funcoes
   ```
   O script sabe quais sobem com `--no-verify-jwt` (webhooks, cron e
   relatório de erro); não publique função à mão sem essa lista.

9. 🧑 **Segredos** (lista completa em `supabase/functions/README.md`):
   `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, `PLAY_PACKAGE_NAME`,
   `PLAY_RTDN_SERVICE_ACCOUNT`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
   `APP_URL`, `BILLING_RECONCILE_SECRET`.

10. 🧑 **Stripe dashboard**: endpoint de webhook →
    `https://<REF>.supabase.co/functions/v1/stripe-webhook`, assinando os
    eventos listados em `supabase/functions/README.md`.

11. 🧑 **Play Console / Pub/Sub** (runbook `docs/play-store-billing-runbook.md`):
    a URL de push é só
    `https://<REF>.supabase.co/functions/v1/play-rtdn`, **sem** `?secret=` (a
    função recusa segredo na URL com 403: URL vai para log de proxy e de
    plataforma). A autenticação é o token OIDC que o próprio Pub/Sub assina:
    ```bash
    gcloud pubsub subscriptions update <SUB> \
      --push-auth-service-account=<SA>@<PROJETO>.iam.gserviceaccount.com
    npx supabase secrets set PLAY_RTDN_SERVICE_ACCOUNT=<SA>@<PROJETO>.iam.gserviceaccount.com
    # só se você definiu audience no push:
    npx supabase secrets set PLAY_RTDN_AUDIENCE=<audience>
    ```
    A função confere o token no Google e exige que o e-mail seja o da conta de
    serviço configurada. O segredo `PLAY_RTDN_SECRET` existe só para chamada
    que você mesmo dispara (staging, `curl`), sempre no header
    `x-rtdn-secret`; o Pub/Sub não manda header próprio. Sem nenhum dos dois
    configurados, a função recusa tudo (503).

12. 🧑 **Reconciliação diária** (`billing-reconcile`, agendada pelo `pg_cron`
    nas migrações): habilite as extensões `pg_cron` e `pg_net` (**Database →
    Extensions**) e grave no Vault do projeto `fp_project_url` e
    `fp_billing_reconcile_secret` (o mesmo valor de `BILLING_RECONCILE_SECRET`).
    Sem eles, o agendamento roda, avisa no log do banco e não chama nada.

---

## Fase 4 — Conferir

13. 🧑 Testar multi-dispositivo (entrar em dois aparelhos, lançar num, ver no
    outro) e uma compra de teste na Play.
14. 🧑 `npx supabase migration list` depois de cada release: local e remoto
    devem bater.
