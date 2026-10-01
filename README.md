# FinançasPro

App de finanças pessoais com PWA e app Android. Funciona sem conta (dados só no aparelho) e, com conta, sincroniza pelo Supabase (Auth, Postgres com RLS e Edge Functions de billing). Frontend em JavaScript vanilla; schema do banco em Prisma. A API Express em `backend/` é legado congelado ([ADR 0004](docs/adr/0004-supabase-fonte-de-verdade-express-congelado.md)).

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
- Postgres (backend completo)
- Redis opcional (filas/workers)
- Android Studio (apenas para build Play Store)

## Setup local

```bash
npm ci
cp .env.example .env
npm run db:generate
npm run db:migrate
```

Configure pelo menos:

```bash
DATABASE_URL="postgresql://usuario:senha@localhost:5432/financaspro"
JWT_ACCESS_SECRET="troque-este-segredo"
JWT_REFRESH_SECRET="troque-este-segredo-tambem"
CORS_ORIGIN="http://localhost:3000"
APP_URL="http://localhost:4000"
```

Seeds opcionais:

```bash
npm run db:seed
npm run billing:seed
```

## Rodando

```bash
npm run dev          # frontend (Vite, porta 3000)
npm run backend:dev  # API (porta 4000)
npm run worker:dev   # workers (opcional)
```

Com Docker:

```bash
npm run docker:up
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
| `supabase/` | RLS, funções SQL, Edge Functions e testes pgTAP |
| `prisma/` | Schema e migrações (dono das tabelas) |
| `backend/` | API Express — legado congelado, ver `backend/README.md` |
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
