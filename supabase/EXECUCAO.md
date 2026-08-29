# Execução da migração — passo a passo ordenado

Roteiro único que amarra tudo que já está no repo (schema Prisma, RLS, testes,
Edge Functions) numa sequência executável. Faça na ordem. Detalhes de cada
parte: `supabase/README.md` (RLS) e `supabase/functions/README.md` (functions).

Legenda: 🧑 = você (precisa da conta) · 🤖 = eu faço (código, quando o projeto existir).

---

## Fase 1 — Projeto + schema + RLS

1. 🧑 **Criar o projeto** em supabase.com (login com GitHub). Anote de
   **Settings → API**: `Project URL`, `anon key`, `service_role key`. De
   **Settings → Database**: a **connection string**.

   > ⚠️ Prisma usa DUAS conexões: **migrations** exigem a conexão **direta**
   > (porta 5432); o runtime usa o **pooler** (6543). Para os comandos abaixo,
   > use a **direta**.

2. 🤖 **Criar as tabelas** (migrations Prisma já versionadas em `prisma/migrations/`):
   ```bash
   DATABASE_URL="<conexão DIRETA :5432>" npm run db:migrate:prod
   ```

3. 🤖 **Semear os planos** (com os preços recalibrados) e dados base:
   ```bash
   DATABASE_URL="<conexão DIRETA :5432>" npm run billing:seed
   ```

4. 🤖 **Aplicar a RLS**:
   ```bash
   psql "<conexão DIRETA :5432>" -f supabase/migrations/20260828120000_rls_policies.sql
   ```

5. 🤖 **Rodar os testes de RLS** (precisa do Supabase CLI + Docker, ou pgTAP no banco):
   ```bash
   supabase test db
   ```
   ⛔ **Não libere dado real antes destes testes passarem.**

---

## Fase 2 — Auth

6. 🤖 **Trigger de auth** (`auth.users` → cria linha em `User`) — SQL pronto em
   `docs/migracao-supabase-plano.md`. Vai junto de uma **migration Prisma** que
   torna `passwordHash`/`passwordSalt`/`totp*` opcionais (o Supabase Auth passa
   a cuidar). Faço via edição do `schema.prisma` + `db:migrate` para não gerar
   drift.

7. 🧑 No painel **Authentication → Providers**: habilitar e-mail/senha (e o que
   mais quiser). Configurar templates de e-mail.

8. 🤖 **Front**: adicionar `SUPABASE_URL` + `SUPABASE_ANON_KEY` em
   `js/core/config.js` (vazios por padrão, como o `API_BASE_URL`) e ligar o
   `supabase-js` no login. App segue local-first se ficarem vazios.

---

## Fase 3 — Edge Functions (billing)

9. 🧑 **Deploy** (Play + Stripe):
   ```bash
   supabase functions deploy play-verify
   supabase functions deploy stripe-checkout
   supabase functions deploy play-rtdn      --no-verify-jwt
   supabase functions deploy stripe-webhook --no-verify-jwt
   ```

10. 🧑 **Secrets** (lista completa em `supabase/functions/README.md`):
    `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, `PLAY_PACKAGE_NAME`, `PLAY_RTDN_SECRET`,
    `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `APP_URL`.

11. 🧑 **Stripe dashboard**: endpoint de webhook →
    `https://<REF>.supabase.co/functions/v1/stripe-webhook`, assinando os 5
    eventos listados no README.

12. 🧑 **Play Console** (runbook `docs/play-store-billing-runbook.md`, Fase 3):
    a URL de push do Pub/Sub passa a ser
    `https://<REF>.supabase.co/functions/v1/play-rtdn?secret=<PLAY_RTDN_SECRET>`.

13. 🤖 **Front**: apontar a compra do app para a function `play-verify` e o
    checkout web para `stripe-checkout`.

---

## Fase 4 — Sync

14. 🤖 Reescrever a camada de sync do `js/core/dados.js` para `supabase-js`
    (`upsert`/`select` com RLS) no lugar de `/api/v1/sync`. Núcleo local
    (IndexedDB) e o guard `_apiAtiva()` continuam.

15. 🧑 Testar multi-dispositivo.

---

## Fase 5 — Desligar a infra antiga

16. 🤖 Remover do repo: backend Express, workers BullMQ, Dockerfile do Railway.
17. 🧑 Cancelar Neon, Upstash e Railway.
18. 🤖 (Opcional) Emails reais: trocar o stub `notify()` das functions por Resend.

---

## Estado atual (o que já está pronto no repo)

| Item | Arquivo | Executado? |
|---|---|---|
| Plano de arquitetura | `docs/migracao-supabase-plano.md` | — |
| RLS + testes pgTAP | `supabase/migrations/…rls_policies.sql`, `supabase/tests/…` | ❌ (sem Postgres no ambiente) |
| Edge Functions Play | `supabase/functions/play-*`, `_shared/*` | ❌ (sem Deno no ambiente) |
| Edge Functions Stripe | `supabase/functions/stripe-*`, `_shared/stripe*` | ❌ |

Tudo revisado à mão; nada rodado aqui. A execução começa na **Fase 1**, que
depende do projeto Supabase.
