# FinançasPro

App de finanças pessoais com PWA e app Android. Funciona sem conta (dados só no aparelho) e, com conta, sincroniza pelo Supabase (Auth, Postgres com RLS e Edge Functions de billing). Frontend em JavaScript vanilla; schema do banco em Prisma. Não há servidor próprio: regra de servidor é SQL ou Edge Function no Supabase, e a web é hospedagem estática ([ADR 0007](docs/adr/0007-remocao-do-express.md)).

## Funcionalidades

- Dashboard mensal de receitas, despesas e saldo
- Cadastro de transações, contas, orçamentos e recorrências
- Extrato com filtros; exportação local livre; na nuvem FREE limitada, Pro ilimitada
- Conta na nuvem com Supabase Auth (e-mail/senha, verificação em duas etapas)
- Sincronização entre aparelhos pelo Supabase, com RLS por usuário/organização
- Organizações, planos e assinatura (Google Play e Stripe) via Edge Functions

## Requisitos

- Node.js 22+
- npm 9+
- Postgres 16 (só para rodar as migrações e os testes pgTAP localmente)
- Android Studio (apenas para build Play Store)

## Setup local

```bash
npm ci
npm run dev          # frontend (Vite, porta 3000), contra o Supabase de js/core/config.js
```

Banco local (opcional, para migrações e pgTAP):

```bash
DATABASE_URL="postgresql://usuario:senha@localhost:5432/financaspro" npm run db:migrate
INTEGRATION_TEST_DATABASE_URL="postgresql://…" npm run test:db:ci
psql "postgresql://…" -f supabase/seed/planos.sql   # planos Gratuito/Pro/Business
```

## Rodando

```bash
npm run dev          # frontend (Vite, porta 3000)
npm run start:dist   # o build de produção (dist/), como a hospedagem serve
```

No Windows, os atalhos de duplo clique (servidor local, modo celular, índice das auditorias) ficam em `scripts/windows/`.

## Qualidade

```bash
npm test
npm run lint
npm run build
```

O CI roda lint, testes e build em Node 22 e 24.

## Arquitetura

| Pasta | Conteúdo |
|-------|----------|
| `index.html` | Shell principal do app |
| `css/` | Design system, layouts, componentes |
| `js/core/` | Config, persistência, store, validações |
| `js/modules/` | Inicialização por área da interface |
| `js/services/` | Actions e serviços reutilizáveis |
| `supabase/` | RLS, funções SQL, tarefas agendadas, Edge Functions e testes pgTAP |
| `prisma/` | Schema e migrações (dono das tabelas) |
| `tests/` | Unidade, app inteiro em jsdom (`tests/app-*`) e segurança estática |
| `e2e/` | Playwright contra o build de produção |
| `android/` | Projeto Capacitor (gerado após `cap add android`) |

Arquitetura: [`docs/ARQUITETURA_SAAS.md`](docs/ARQUITETURA_SAAS.md) · Decisões: [`docs/adr/`](docs/adr/)  
Publicação Android: [`docs/PLAY_STORE.md`](docs/PLAY_STORE.md)  
Auditorias (com índice): [`docs/auditorias/`](docs/auditorias/)

## PWA e Android

- `manifest.json` — instalável como app web
- `sw.js` — cache offline (incremente `CACHE_NAME` ao alterar assets)
- `capacitor.config.json` — wrapper nativo para Play Store

```bash
npm run icons:generate   # PNGs a partir de icons/logo.svg
npm run android:sync     # build web + sync Capacitor
npm run android:open     # abrir no Android Studio
```

## Segurança

- Nunca use segredos padrão em produção
- `.env` está no `.gitignore`
- API com Helmet, rate limit, Zod e JWT HttpOnly para refresh token

## Licença

MIT — Renato José Soares
