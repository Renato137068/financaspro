# Plano de Migração para Supabase (BaaS nativo)

**Decisão estratégica (2026-08-28):** trocar o backend Express (Railway + Neon +
Upstash) — que **nunca foi ativado em produção** (`API_BASE_URL` vazio, app é
local-first) — por **Supabase**: Postgres + Auth + Storage + Realtime, com o
frontend falando **direto** via `supabase-js` protegido por **RLS**, e
**Edge Functions** só para o que precisa de segredo (billing Stripe + Play).

Objetivos do usuário: familiaridade com Supabase, simplificar/baratear infra,
auth/storage/realtime prontos.

> ⚠️ **App continua funcionando o tempo todo.** Como é local-first (IndexedDB),
> a migração constrói a camada de nuvem em paralelo; nada quebra durante o
> caminho.

---

## Arquitetura alvo

```
┌─────────────────────────┐
│  App (local-first, IDB) │
│  js/core/dados.js       │──── supabase-js (Auth JWT) ───┐
└─────────────────────────┘                               │
                                                          ▼
                                        ┌──────────────────────────────┐
                                        │  Supabase                     │
                                        │  • Postgres + RLS  (dados)    │
                                        │  • Auth            (login)    │
                                        │  • Storage         (OCR)      │
                                        │  • Realtime        (opcional) │
                                        │  • Edge Functions (Deno):     │
                                        │      - stripe-webhook         │
                                        │      - stripe-checkout        │
                                        │      - play-verify            │
                                        │      - play-rtdn (webhook)    │
                                        └──────────────────────────────┘
```

Aposenta: **Neon** (→ Postgres do Supabase), **Upstash/Redis + BullMQ**
(→ `pg_cron` / Edge Functions agendadas), **Railway** (→ Edge Functions).

---

## Disposição das tabelas

O schema Prisma continua a **fonte da verdade das tabelas** (rodamos as
migrations Prisma contra o Postgres do Supabase). RLS e triggers entram como
**migrations SQL à parte** (Prisma não gerencia RLS).

| Tabela | Destino |
|---|---|
| `User` | **Manter, enxugar.** `id` passa a referenciar `auth.users.id`. Remover `passwordHash`, `passwordSalt`, `totpSecret`, `totpEnabled` → Supabase Auth + MFA cuidam disso. |
| `Session`, `VerificationToken` | **Remover.** Supabase Auth gerencia refresh token, verificação de e-mail e reset de senha. |
| `Transaction`, `Account`, `Budget`, `RecurringTransaction` | **Manter.** RLS "dono OU membro da org". |
| `UserConfig`, `OpenFinanceConnection`, `SyncOp` | **Manter.** RLS "dono". |
| `Organization`, `OrganizationMember`, `Invitation` | **Manter.** RLS por participação/role. |
| `Plan` | **Manter.** RLS: leitura pública; escrita só `service_role`. |
| `Subscription`, `UsageRecord`, `Invoice` | **Manter.** RLS: leitura para membros da org; escrita só via Edge Function (`service_role`). |
| `StripeWebhookEvent`, `JobLog`, `AuditLog` | **Manter, internas.** Sem acesso do cliente; só `service_role`. |

---

## Modelo de segurança RLS (a parte crítica)

**Regra de ouro:** RLS **negado por padrão**. Habilitar em toda tabela e escrever
policies explícitas. Uma policy errada num app financeiro **vaza dado de todos** —
por isso cada uma terá teste automatizado (ver Fase 4).

Funções auxiliares (evitam repetição e recursão):

```sql
-- Usuário é membro da org?
create or replace function public.is_org_member(target_org uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public."OrganizationMember" m
    where m."orgId" = target_org and m."userId" = auth.uid()
  );
$$;

-- Usuário tem papel de gestão (OWNER/ADMIN) na org?
create or replace function public.is_org_admin(target_org uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public."OrganizationMember" m
    where m."orgId" = target_org and m."userId" = auth.uid()
      and m.role in ('OWNER','ADMIN')
  );
$$;
```

Exemplo — `Transaction` (o padrão "dono OU membro da org"):

```sql
alter table public."Transaction" enable row level security;

create policy tx_select on public."Transaction" for select using (
  "userId" = auth.uid() or ("orgId" is not null and public.is_org_member("orgId"))
);
create policy tx_insert on public."Transaction" for insert with check (
  "userId" = auth.uid() and ("orgId" is null or public.is_org_member("orgId"))
);
create policy tx_update on public."Transaction" for update using (
  "userId" = auth.uid() or ("orgId" is not null and public.is_org_admin("orgId"))
);
create policy tx_delete on public."Transaction" for delete using (
  "userId" = auth.uid() or ("orgId" is not null and public.is_org_admin("orgId"))
);
```

> Colunas ficam em camelCase (padrão do Prisma) e são referenciadas entre aspas
> nas policies. Billing e webhooks escrevem com `service_role`, que **ignora RLS**
> por design — por isso a lógica sensível fica só em Edge Functions.

Vínculo com o Auth — ao criar usuário no Supabase Auth, um trigger cria a linha
em `User`:

```sql
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public."User" (id, email, name, role, active)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', new.email), 'USER', true);
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

---

## Edge Functions (billing — precisa de segredo)

Deno/TypeScript. Reaproveitam a lógica que **já escrevemos** (JS puro, portável):

| Function | Origem no código atual | Segredo |
|---|---|---|
| `play-verify` | `backend/domain/services/play-billing.service.js` + `backend/lib/google-play-api.js` | `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` |
| `play-rtdn` (webhook) | webhook em `backend/app.js` + `handleRtdn` | `PLAY_RTDN_SECRET` |
| `stripe-webhook` | `backend/domain/services/billing.service.js` (`handleWebhook`) | `STRIPE_WEBHOOK_SECRET` |
| `stripe-checkout` | criação de sessão de checkout | `STRIPE_SECRET_KEY` |

Escrevem em `Subscription`/`Invoice` com `service_role` (ignora RLS). Segredos
ficam nos **secrets do Supabase**, nunca no cliente.

Reconciliação periódica (hoje o worker BullMQ) → **`pg_cron`** chamando uma Edge
Function agendada, ou o próprio `reconcileExpiries` portado.

---

## Sync local-first → Supabase

Hoje `dados.js` sincroniza contra `/api/v1/sync`. Passa a usar `supabase-js`
direto (`upsert`/`select` com RLS). A idempotência via `SyncOp` dá lugar a
`upsert` por `id` + resolução por `updatedAt`. O núcleo local (IndexedDB) e o
guard `_apiAtiva()` continuam — só troca o "back" de Express para Supabase.

---

## Fases (o que EU faço × o que VOCÊ faz)

| # | Fase | Eu | Você |
|---|---|---|---|
| 1 | **Projeto + schema** | Aponto Prisma pro Supabase; gero as migrations | Cria projeto no Supabase; me passa URL + anon key (o `service_role` fica só nos secrets) |
| 2 | **RLS + trigger de auth** | Escrevo as migrations SQL de RLS + testes de policy | Revisa/roda a migration |
| 3 | **Auth** | Integro `supabase-js` no login do front; removo auth custom | Configura provedores/e-mail no painel |
| 4 | **Sync** | Reescrevo a camada de sync do `dados.js` p/ Supabase | Testa multi-dispositivo |
| 5 | **Edge Functions billing** | Porto play-verify, play-rtdn, stripe-* p/ Deno | `supabase functions deploy` + secrets |
| 6 | **Storage + Realtime** | OCR no Storage; realtime onde ajudar | — |
| 7 | **Desligar infra antiga** | Removo Express/BullMQ/Railway do repo | Cancela Neon/Upstash/Railway |

---

## Riscos & mitigações

1. **RLS incorreta vaza dados financeiros** (risco nº 1). → Negado por padrão +
   suíte de testes de policy (tenta ler dados de outro usuário/org e espera 0
   linhas) antes de qualquer dado real.
2. **Perda do hardening de auth (Fase 7)** — pbkdf2, lockout, jti/iss/aud. →
   Supabase Auth cobre a maior parte; reativar rate-limit/lockout via config do
   Supabase.
3. **Deno ≠ Node nas Edge Functions.** → `jsonwebtoken`/`fetch` têm equivalentes
   Deno; a lib do Google é pequena e será portada com teste.
4. **Testes de backend (487)** — os do Express saem; os de regra de negócio
   (billing) migram como testes das Edge Functions.

---

## Impacto no que já fizemos

- **Play Billing (verify + RTDN):** a lógica é reaproveitada; muda o *empacotamento*
  (Express → Edge Function) e a **URL do webhook** no runbook do Play Console
  passa a ser a da Edge Function `play-rtdn` (não a do Railway).
- **`docs/play-store-billing-runbook.md`:** continua válido em Play Console;
  só atualizar a URL de push do Pub/Sub e onde vão os segredos (secrets do
  Supabase em vez de envs do Railway) quando chegarmos à Fase 5.
- **Preços dos planos:** inalterados — o seed vira um `insert` no Postgres do
  Supabase.

---

## Próximo passo

**Fase 1.** Você cria o projeto no Supabase (login com GitHub) e me passa a
**Project URL** e a **anon/public key**. Eu já deixo as migrations Prisma prontas
pra apontar pra lá. O `service_role key` você guarda — ele só entra nos secrets
das Edge Functions, nunca no código nem no cliente.
