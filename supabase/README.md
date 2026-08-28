# Supabase — RLS e testes de policy

Segurança da migração para Supabase (ver `docs/migracao-supabase-plano.md`).
O **Prisma continua dono do schema** (as tabelas); aqui mora só a camada de
segurança (RLS) e seus testes.

```
supabase/
  migrations/20260828120000_rls_policies.sql   # habilita RLS + policies
  tests/rls_policies.test.sql                  # pgTAP: prova isolamento
```

## Ordem de aplicação (importante)

A RLS depende das tabelas existirem. A ordem é:

1. `prisma migrate deploy` — cria as tabelas no Postgres do Supabase.
2. Aplicar `migrations/20260828120000_rls_policies.sql` — liga a RLS.
3. `supabase test db` — roda os testes de policy.

> ⚠️ **Nunca** libere dado real antes dos testes de policy passarem. Uma policy
> errada num app financeiro vaza dado de todos os usuários.

## Rodando localmente (antes de ter o projeto na nuvem)

Precisa do [Supabase CLI](https://supabase.com/docs/guides/cli) + Docker.

```bash
# sobe um Supabase local (Postgres + Auth) em Docker
supabase start

# cria as tabelas no banco local a partir do schema Prisma
DATABASE_URL="postgresql://postgres:postgres@localhost:54322/postgres" \
  npx prisma migrate deploy

# aplica a RLS
psql "postgresql://postgres:postgres@localhost:54322/postgres" \
  -f supabase/migrations/20260828120000_rls_policies.sql

# roda os testes de RLS (pgTAP)
supabase test db
```

## O que os testes provam

`tests/rls_policies.test.sql` monta duas contas (Alice e Bob) e uma organização
da Alice, e então verifica:

- Alice vê só os dados dela + os da org onde é membro.
- Bob (de fora) **não vê** nada da Alice nem da org dela — nem por id direto.
- Bob **não consegue** atualizar linha da Alice (0 linhas), nem inserir em nome
  dela (erro `42501` de RLS).
- Planos são leitura pública.
- **Nem a dona da org** cria `Subscription` pelo cliente — billing é exclusivo
  das Edge Functions (`service_role`, que ignora RLS).

O mesmo padrão "dono OU membro da org" cobre `Transaction`, `Account`, `Budget`
e `RecurringTransaction` (as policies são geradas em laço no migration).

## Ainda falta (fases seguintes)

- **Trigger de auth** (`auth.users` → cria linha em `User`) — Fase 3, junto da
  mudança no schema Prisma que remove `passwordHash`/`passwordSalt`/`totp*`
  (o Supabase Auth passa a cuidar disso). SQL pronto em
  `docs/migracao-supabase-plano.md`.
- **Edge Functions** de billing (Stripe + Play) — Fase 5.
