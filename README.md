# FinançasPro

App de finanças pessoais com PWA, experiência mobile/Android e API SaaS opcional. Frontend em JavaScript vanilla; backend com Express, Prisma/Postgres, JWT, Redis/BullMQ e Stripe (opcional).

## Funcionalidades

- Dashboard mensal de receitas, despesas e saldo
- Cadastro de transações, contas, orçamentos e recorrências
- Extrato com filtros, exportação e suporte offline
- Autenticação via API com access/refresh token
- Sincronização local/remota quando a API está configurada
- Base SaaS com organizações, planos, billing e workers

## Requisitos

- Node.js 18+
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

## Qualidade

```bash
npm test
npm run lint
npm run build
```

O CI roda lint, testes e build em Node 18 e 20.

## Arquitetura

| Pasta | Conteúdo |
|-------|----------|
| `index.html` | Shell principal do app |
| `css/` | Design system, layouts, componentes |
| `js/core/` | Config, persistência, store, validações |
| `js/modules/` | Inicialização por área da interface |
| `js/services/` | Actions e serviços reutilizáveis |
| `backend/` | API Express (rotas, services, middlewares) |
| `prisma/` | Schema e migrações |
| `tests/` | Testes unitários e segurança estática |
| `android/` | Projeto Capacitor (gerado após `cap add android`) |

Documentação SaaS: [`docs/ARQUITETURA_SAAS.md`](docs/ARQUITETURA_SAAS.md)  
Publicação Android: [`docs/PLAY_STORE.md`](docs/PLAY_STORE.md)

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
