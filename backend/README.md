# backend/ — API Express (legado, congelada)

> **Congelada desde 27/09/2026.** O Supabase é a fonte de verdade para
> autenticação, dados, billing e organizações — ver
> [`docs/adr/0004-supabase-fonte-de-verdade-express-congelado.md`](../docs/adr/0004-supabase-fonte-de-verdade-express-congelado.md).

O que isso significa na prática:

- **Nada novo aqui.** Rota, serviço ou worker novo nasce em
  `supabase/functions/` (Edge Function) ou em `supabase/migrations/` (SQL).
- **Correção de segurança, sim.** Enquanto o código existir, falha de segurança
  é corrigida — e, se for regra de billing, também no equivalente em
  `supabase/functions/_shared/`.
- **Os testes seguem no CI** (`tests/backend/`, smoke, API e integração) para o
  código não apodrecer sem aviso até ser removido.
- **O schema continua no Prisma** (`prisma/`): as tabelas do Supabase nascem das
  migrações Prisma. Congelar a API não congela o `schema.prisma`.

## O que só existe aqui

Antes de remover esta pasta, cada item precisa de destino (detalhes no ADR):

| Peça | Onde | Situação |
|---|---|---|
| Open Finance (Belvo) | `lib/open-finance/`, `routes/open-finance.js` | desligado no app (`FEATURE_OPEN_FINANCE: false`) |
| Worker de recorrentes | `workers/recurring.worker.js` | o app já materializa no cliente |
| Worker de retenção | `workers/retention.worker.js` | tabelas da auth própria; Supabase precisaria de `pg_cron` |
| Reconciliação da Play | `workers/billing-reconcile.worker.js` | sem equivalente; RTDN cobre o fluxo normal |
| Worker de e-mail | `workers/email.worker.js` | Edge Functions já enviam via Resend |
