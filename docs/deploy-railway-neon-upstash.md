# Runbook de Deploy — FinançasPro (Railway + Neon + Upstash)

> Stack recomendada para **dev solo em fase de testes**. Custo inicial ~US$ 5–10/mês
> (bancos em free tier; só o serviço Node é pago). Objetivo: colocar o backend num
> HTTPS público para **ligar login e premium** no app Android.

## Arquitetura

```
┌─────────────────────┐         ┌──────────────────────────────┐
│ App Android (APK)   │ HTTPS   │ Railway                      │
│ Capacitor           ├────────►│  • Serviço WEB  (server.js)  │
│ origin https://localhost      │  • Serviço WORKER (workers)  │
└─────────────────────┘         └───────┬───────────────┬──────┘
                                        │               │
                                  DATABASE_URL      REDIS_URL
                                        │               │
                                 ┌──────▼─────┐   ┌──────▼──────┐
                                 │ Neon (PG)  │   │ Upstash     │
                                 │ free tier  │   │ Redis (TLS) │
                                 └────────────┘   └─────────────┘
```

- **2 serviços no Railway** a partir do **mesmo repo**: um web (a API) e um worker
  (tarefas recorrentes, e-mail, reconciliação de billing).
- **Postgres** externo no **Neon**; **Redis** externo no **Upstash**.

## Pré-requisitos
- Repo no **GitHub** (Railway faz deploy a partir dele).
- Contas gratuitas: **Neon**, **Upstash**, **Railway** (login com GitHub).
- `openssl` disponível (para gerar segredos).

---

## Passo 1 — Postgres no Neon
1. Crie um projeto em neon.tech (região mais perto: `AWS us-east` ou `sa-east`).
2. Copie a **connection string**. Use a **direct** (sem `-pooler` no host) para o
   `DATABASE_URL` — o `prisma migrate deploy` usa advisory locks que o pooler não
   suporta. Garanta o sufixo `?sslmode=require`.
   ```
   postgresql://USER:PASS@ep-xxxx.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
> ⚠️ O free tier do Neon **suspende após inatividade**; a 1ª requisição depois de
> ocioso tem um "cold start" de ~1s. Ok para testes.

## Passo 2 — Redis no Upstash
1. Crie um banco Redis em upstash.com (região perto da do Railway).
2. Copie a URL no formato **`rediss://`** (TLS). O `ioredis` ativa TLS
   automaticamente ao ver `rediss://`.
   ```
   rediss://default:SENHA@xxx.upstash.io:6379
   ```
> Mantenha a política de eviction padrão (`noeviction`) — é o que o BullMQ espera.

## Passo 3 — Serviço WEB no Railway
1. **New Project → Deploy from GitHub repo** → selecione o repo.
2. O Railway detecta o **`Dockerfile`** e o usa. O Docker já faz, no boot:
   `npm run build` → `prisma generate` → `prisma migrate deploy` → `node backend/server.js`.
3. Em **Variables**, cole as variáveis do Passo 5.
4. Em **Settings → Networking → Generate Domain** → esse HTTPS é a sua **API_BASE_URL**
   (ex.: `https://financaspro-web-production.up.railway.app`).

## Passo 4 — Serviço WORKER no Railway
1. No **mesmo projeto**: **New → GitHub Repo** (o mesmo repo) para criar um 2º serviço.
2. Em **Settings → Deploy → Custom Start Command**, sobrescreva para:
   ```
   node backend/workers/index.js
   ```
3. Dê a ele as **mesmas variáveis** do serviço web (use *Shared Variables* do Railway
   para não duplicar). Ele **não** precisa gerar domínio.
> Sem o worker: transações recorrentes, e-mails e reconciliação de assinatura não rodam.
> Dá para adicionar depois, mas é recomendado desde já.

## Passo 5 — Variáveis de ambiente

**Obrigatórias** (o backend recusa subir em produção sem elas):

| Variável | Valor | Como obter |
|----------|-------|-----------|
| `NODE_ENV` | `production` | fixo |
| `DATABASE_URL` | string do Neon | Passo 1 |
| `REDIS_URL` | `rediss://...` do Upstash | Passo 2 |
| `JWT_ACCESS_SECRET` | aleatório | `openssl rand -base64 48` |
| `JWT_REFRESH_SECRET` | aleatório (diferente) | `openssl rand -base64 48` |
| `CORS_ORIGIN` | `https://localhost` | origem do app Android (Capacitor) |

**Necessárias para o app funcionar bem cross-site:**

| Variável | Valor | Porquê |
|----------|-------|--------|
| `COOKIE_SAME_SITE` | `None` | o app é cross-site; sem isto o cookie de sessão **não persiste** |
| `APP_URL` | a URL HTTPS do web | usada em e-mails e portal |
| `TOTP_ENCRYPTION_KEY` | `openssl rand -base64 32` | necessária se algum usuário ativar 2FA |

**Para e-mails de verificação (recomendado — ex.: Resend):**

| Variável | Exemplo |
|----------|---------|
| `SMTP_HOST` | `smtp.resend.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | `resend` |
| `SMTP_PASS` | *API key do Resend* |
| `SMTP_FROM` | `FinançasPro <no-reply@seu-dominio>` |

**Para premium via Google Play (quando for ativar):**

| Variável | Valor |
|----------|-------|
| `PLAY_PACKAGE_NAME` | `com.financaspro.mobile` |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | JSON da conta de serviço (Passo 8) |

**Opcionais:** `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PUBLISHABLE_KEY`
(cartão na web), `METRICS_TOKEN` (protege `/metrics`), `BELVO_*` / `PLUGGY_*` (Open Finance).

> `CORS_ORIGIN` aceita **lista separada por vírgula**. Para testar também a web
> servida pelo Railway, use `https://localhost,https://SEU-web.up.railway.app`.

## Passo 6 — Pós-deploy (uma vez)
1. **Healthcheck:** abra `https://SUA-API/health` — deve responder OK (banco + Redis).
2. **Semear os planos** (senão o paywall fica vazio): rode uma vez, num terminal com
   o `DATABASE_URL` de produção exportado (ou via *one-off command* do Railway):
   ```bash
   npm run billing:seed
   ```
3. Migrações rodam sozinhas no boot (Dockerfile). Manual, se precisar: `npm run db:migrate:prod`.

## Passo 7 — Conectar o app Android (eu faço)
1. Aponto `CONFIG.API_BASE_URL` em [js/core/config.js](../js/core/config.js) para a URL da API.
2. Subo o `versionCode` para **12**, recompilo o AAB e publico no teste interno.
3. A partir daí, **login/cadastro e o paywall premium aparecem** no app.

## Passo 8 — Premium via Play Billing (etapa separada)
1. **Play Console → Monetizar → Produtos → Assinaturas**, criar 4 produtos com estes IDs
   exatos (o app já os referencia):
   - `financaspro.pro.monthly`
   - `financaspro.pro.yearly`
   - `financaspro.business.monthly`
   - `financaspro.business.yearly`
2. Criar uma **conta de serviço** no Google Cloud com acesso à *Google Play Android
   Developer API*, vinculá-la na Play Console (Usuários e permissões / Acesso via API),
   baixar o JSON → `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`.

---

## Gotchas / troubleshooting
- **Login não persiste no app:** quase sempre é `COOKIE_SAME_SITE` ≠ `None` ou a API
  sem HTTPS. O Railway já dá HTTPS; garanta `COOKIE_SAME_SITE=None`.
- **CORS bloqueado:** `CORS_ORIGIN` precisa bater **exatamente** com a origem do app
  (`https://localhost`, sem barra no fim).
- **Paywall vazio:** faltou rodar `npm run billing:seed`.
- **Erro de migração no Neon:** use a URL **direct** (sem `-pooler`) no `DATABASE_URL`.
- **Cold start Neon:** 1ª chamada após ocioso é lenta — normal no free tier.

## Custo recap (aprox., confirmar preço atual)
| Item | Custo/mês |
|------|-----------|
| Neon Postgres (free) | US$ 0 |
| Upstash Redis (free) | US$ 0 |
| Railway (web + worker) | ~US$ 5–10 |
| Google Play (assinaturas) | 15% da receita |
| **Total inicial** | **~US$ 5–10** |
