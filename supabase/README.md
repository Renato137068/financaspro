# Supabase — banco, regras de acesso e testes

Segurança e regras do servidor do app na nuvem. As tabelas principais vêm das
migrações do Prisma (`prisma/migrations/`); tudo o que é do Supabase (RLS,
gatilhos, cotas, 2FA, tarefas agendadas, tabelas `fp_*`) mora em
`supabase/migrations/`. Passo a passo de instalação num projeto novo:
`supabase/EXECUCAO.md`.

```
supabase/
  migrations/   # SQL do Supabase, aplicado em ordem pelo `supabase db push`
  tests/        # pgTAP: um arquivo por assunto (lista abaixo)
  seed/         # planos.sql (seed reexecutável, não é migração)
  functions/    # Edge Functions (cobrança, convites, relatórios de erro)
```

## Ordem de aplicação

A RLS depende das tabelas existirem:

1. `prisma migrate deploy` (`npm run db:migrate:prod`) cria as tabelas.
2. `node scripts/deploy-supabase.cjs --so-migracoes` aplica `supabase/migrations/`
   pelo `supabase db push`, que registra o que já rodou. Nunca com `psql`:
   ver `supabase/EXECUCAO.md`.
3. Os testes abaixo passam antes de qualquer dado real.

> ⚠️ **Nunca** libere dado real antes dos testes de policy passarem. Uma policy
> errada num app financeiro vaza dado de todos os usuários.

## Rodando os testes do banco

Postgres 16 local com pgTAP (pacote `postgresql-16-pgtap`, ou o SQL do pgTAP
que o script carrega sozinho), sem Docker:

```bash
INTEGRATION_TEST_DATABASE_URL="postgresql://..." npm run test:db:ci
# Pule com SKIP_PGTAP=1
```

O script `scripts/test-supabase-pgtap.cjs` (o mesmo do CI) aplica as migrações
do Prisma, o stub de `auth.*` (`supabase/tests/_ci_auth_stub.sql`), as
migrações de `supabase/migrations/` em ordem e roda cada `*.test.sql` de
`supabase/tests/`. Reprova com qualquer `not ok` ou plano que não fechou. Use
um banco vazio e descartável: os testes rodam em transação e desfazem tudo,
mas as migrações ficam.

Com o Supabase CLI e Docker, `supabase start` e `supabase test db` também
servem.

## O que os testes provam

| Arquivo | O que prova |
|---|---|
| `rls_coverage.test.sql` | nenhuma tabela de `public` sem RLS; `_prisma_migrations` fechada para `anon` e `authenticated` |
| `rls_policies.test.sql` | isolamento entre duas contas e uma org: quem é de fora não vê, não edita nem insere em nome de outro; ninguém cria `Subscription` pelo cliente |
| `rls_initplan.test.sql` | as regras das tabelas financeiras e as de 2FA estão na forma indexável (calculadas uma vez por consulta); OWNER, MEMBER, VIEWER e quem é de fora veem e editam o que devem; 2FA aplicado pela própria tabela |
| `mfa_aal2.test.sql` | conta com TOTP verificado não passa com sessão AAL1; as 14 tabelas com dado do usuário têm a regra RESTRICTIVE |
| `mfa_recovery.test.sql` | códigos de recuperação do 2FA: só emitidos em AAL2, guardados só como hash, de outra conta recusados, usáveis em AAL1 pelo dono |
| `mfa_recovery_rate_limit.test.sql` | teto de tentativas no consumo de código de recuperação |
| `quota_enforcement.test.sql` | limites do plano gratuito no banco (contas, orçamentos, recorrentes, metas e contas a pagar; lançamentos sem teto), PRO acima deles, `service_role` livre |
| `org_invite_accept.test.sql` | função de aceitar convite existe e `authenticated` pode executá-la |
| `delete_own_account.test.sql` | exclusão da própria conta apaga `User` e login, tira os dados pessoais do `AuditLog` dela, não toca na outra conta e recusa sem login |
| `agendamentos.test.sql` | retenção (`fp_purge_retention`) e disparo da reconciliação de cobrança |
| `client_error_log.test.sql` | relatórios de erro do app: RLS fechada, escrita só pela Edge Function |
| `saude_telemetria.test.sql` | telemetria do painel de saúde: tabela fechada ao cliente, soma de avisos, funil da semana, leitura pelo schema `saude` |
| `saude_erros_frequentes.test.sql` | ranking de erros frequentes do painel de saúde |

O mesmo padrão "dono OU membro da org" cobre `Transaction`, `Account`, `Budget`
e `RecurringTransaction` (as regras são geradas em laço na migração).

## Testes das Edge Functions

Ficam em `supabase/functions/_testes/` (Deno, banco em memória, Stripe e Google
falsos) e rodam com `npm run test:edge`; `npm run check:edge-types` confere os
tipos de cada função contra as dependências reais. Detalhes em
`supabase/functions/README.md`.
