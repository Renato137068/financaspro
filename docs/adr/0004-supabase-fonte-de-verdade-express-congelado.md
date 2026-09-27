# ADR 0004 — Tornar o Supabase a fonte de verdade e congelar a API Express

- **Status:** aceito
- **Data:** 2026-09-27

## Contexto

O FinançasPro tem dois backends mantidos em paralelo:

- **API Express** (`backend/`, ~8,6 mil linhas, 514 testes): auth própria com
  JWT, rotas REST de transações/contas/orçamentos/sync, billing Stripe e Google
  Play, Open Finance (Belvo) e workers BullMQ.
- **Supabase**: Auth, acesso direto do app às tabelas via PostgREST protegido
  por RLS, e Edge Functions de billing (`supabase/functions/`).

O app que vai para a Play Store (build de nuvem) usa só o Supabase: login por
`SUPA_AUTH`, sincronização por `SB.from(...)` e compra pelas Edge Functions.
Mesmo assim, toda regra de cobrança estava escrita duas vezes, com duas suítes
de teste e dois lugares para divergir em silêncio:

| Assunto | Express | Supabase |
|---|---|---|
| Stripe (checkout, portal, cancelamento, webhook) | `backend/domain/services/billing.service.js` | `supabase/functions/_shared/stripe-billing.ts` + `stripe-*` |
| Google Play (verificação, RTDN) | `backend/domain/services/play-billing.service.js` | `supabase/functions/_shared/play-billing.ts` + `play-*` |
| Autenticação | `backend/routes/auth.js` (JWT próprio) | Supabase Auth |
| Sincronização | `backend/routes/sync.js` | `js/core/supabase-sync.js` direto nas tabelas, com RLS |
| Organizações e convites | `backend/routes/orgs.js` | `js/core/supabase-billing.js` + `org-invite` |

A auditoria de 27/09/2026 (achado M3) apontou a duplicidade como custo fixo em
toda mudança de billing.

## Decisão

1. **O Supabase é a fonte de verdade** para autenticação, dados do usuário,
   billing e organizações. Funcionalidade nova de backend nasce em Edge Function
   ou em migração SQL de `supabase/migrations/`, nunca em `backend/`.
2. **A API Express fica congelada.** Não recebe funcionalidade nova. Recebe só
   correção de segurança enquanto existir. Seus testes continuam no CI: o código
   segue no repositório e não pode apodrecer sem aviso até ser removido.
3. **O Prisma continua dono do schema.** As tabelas que o Supabase usa são
   criadas por `prisma/migrations/` (ver `supabase/README.md`). Congelar o
   Express não congela o `schema.prisma`: mudança de tabela continua sendo
   migração Prisma, e a RLS da tabela nova vai em `supabase/migrations/` (o
   pgTAP `rls_coverage` falha se faltar).

### O que só existe no Express

Antes de remover `backend/`, estas peças precisam de destino:

- **Open Finance (Belvo)** — `backend/lib/open-finance/`, rota
  `/api/v1/open-finance`. Hoje desligado no app (`FEATURE_OPEN_FINANCE: false`).
  Se voltar, é portado para Edge Function.
- **Workers BullMQ** — `backend/workers/`:
  - `recurring` (materializa recorrentes): no app, o próprio cliente já
    materializa as devidas ao abrir.
  - `retention` (expurgo de `Session`, `VerificationToken`, `Invitation`,
    `JobLog`, `AuditLog`): as três primeiras são tabelas da auth própria; o
    equivalente no Supabase é retenção por `pg_cron` ou pela própria função,
    como já faz `obs-ingest`.
  - `billing-reconcile` (reconsulta assinaturas da Play): o RTDN do
    `play-rtdn` cobre o fluxo normal; a reconciliação periódica não tem
    equivalente e precisa de `pg_cron` + Edge Function se for mantida.
  - `email`: e-mails de billing já saem das Edge Functions via Resend.

## Consequências

- Uma regra de cobrança passa a ter um lugar só para mudar e testar.
- A web servida pela mesma origem do Express (`window.location.origin` como
  API em `DADOS._apiBaseUrl`) continua funcionando, mas é caminho legado; o app
  da loja não usa.
- Proibido: rota nova em `backend/routes/`, serviço novo em
  `backend/domain/services/`, ou correção de regra de billing aplicada só no
  Express.
- A remoção de `backend/` é um passo futuro e separado, depois de decidir o
  destino de cada item da lista acima.

## Alternativas consideradas

- **Express como principal.** Daria controle total do servidor e hospedaria a
  web junto, mas exigiria migrar o app da loja (login, sync e compra) para a
  API, reescrever a RLS como autorização na aplicação e operar servidor, Redis e
  workers. Descartada: o caminho de produção já é o Supabase.
- **Manter os dois.** É o estado atual; o custo é justamente o que motivou a
  decisão.
- **Apagar o Express agora.** Perderia Open Finance e os workers sem
  substituto. Congelar primeiro deixa a remoção para quando cada peça tiver
  destino.
