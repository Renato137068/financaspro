# FinancasPro - Arquitetura SaaS

## 1. Analise da arquitetura atual

### Mapa de dependencia

```text
index.html
  -> config.js
  -> categorizador.js
  -> categorias.js -> DADOS
  -> aprendizado.js -> DADOS
  -> parser.js
  -> score.js
  -> pipeline.js -> PARSER, CATEGORIZADOR, SCORE, DOM
  -> dados.js -> localStorage, API HTTP, sessao, CONFIG
  -> utils.js -> CONFIG, DOM, localStorage probe
  -> state.js -> DADOS
  -> transactionService.js -> puro
  -> budgetService.js -> TRANSACTION_SERVICE
  -> healthService.js -> localStorage, DADOS, CONFIG_USER
  -> domUtils.js -> DOM
  -> validations.js -> CONFIG, UTILS
  -> transacoes.js -> DADOS, UTILS, TRANSACTION_SERVICE, APP_STATE
  -> contas.js -> DADOS, UTILS, DOM
  -> orcamento.js -> DADOS, TRANSACOES, BUDGET_SERVICE, APP_STATE
  -> automacao.js -> DADOS, TRANSACOES, CATEGORIAS, DOM
  -> render.js -> TRANSACOES, ORCAMENTO, UTILS, DOM
  -> insights.js -> DADOS, TRANSACOES
  -> config-user.js -> DADOS, UTILS, DOM
  -> pin.js -> DADOS, DOM, WebCrypto
  -> authController.js -> DADOS, APP_BOOTSTRAP, UTILS, DOM
  -> app-bootstrap.js -> inicializa todos
  -> init.js -> eventos, modais, import/export, formularios
  -> shortcuts.js -> DOM
  -> sw-register.js -> service worker
```

### Problemas encontrados

- `init.js` concentra responsabilidades demais: autenticacao, formularios, modais, import/export, navegacao e funcoes utilitarias de UI.
- `DADOS` mistura persistencia local, chamadas de API, sessao, migracao e sincronizacao.
- `TRANSACOES`, `UTILS` e `ORCAMENTO` duplicavam regras financeiras de validacao, filtro e agregacao.
- Dependencias globais ocultas: os modulos dependem da ordem dos `<script>` e de objetos globais (`DADOS`, `UTILS`, `TRANSACOES`).
- Persistencia local nao tinha schema central para colecoes; parte de orcamento e recorrentes fica dentro de `config`.
- UI chama regras diretamente; isso dificulta levar a mesma regra para backend.

### Mudancas ja aplicadas

- Criado `js/transactionService.js` com funcoes puras para criar transacao, filtrar, calcular saldo e agregacoes.
- Criado `js/budgetService.js` com funcoes puras para limites e status de orcamento.
- Criado `js/state.js` com store central simples e `subscribe`.
- `transacoes.js`, `orcamento.js` e `dados.js` foram adaptados para usar as novas camadas sem quebrar compatibilidade.
- Criado `js/authController.js`; autenticacao/sessao saiu de `init.js`.
- Criado `js/healthService.js`; checagem de storage/backup saiu de `init.js`.

## 2. Auditoria da camada de dados

### Estado atual

- `localStorage`:
  - `fp-transacoes`
  - `fp-config`
  - `fp-contas`
  - `aprendizado_historico`
  - `_rascunho_transacao`
  - `fp-api-token`
  - `fp-api-user`
- Backend local atual:
  - `.data/financaspro.json`
  - API Node em `backend/server.js`

### Riscos

- Sem constraint real: `localStorage` aceita qualquer shape.
- Sem backup automatico versionado.
- Quota do navegador pode falhar.
- Alteracoes simultaneas em abas diferentes podem sobrescrever dados.
- Token em `localStorage` facilita roubo por XSS; em SaaS real, preferir session cookie httpOnly ou SDK Supabase.
- `config` acumula preferencias, orcamentos, PIN e recorrentes; isso dificulta migracao.

### Schema JSON alvo

```json
{
  "schemaVersion": 3,
  "user": {
    "id": "uuid",
    "name": "Renato",
    "email": "renato@email.com",
    "currency": "BRL",
    "theme": "light",
    "createdAt": "2026-05-05T00:00:00.000Z",
    "updatedAt": "2026-05-05T00:00:00.000Z"
  },
  "categories": [
    {
      "id": "uuid",
      "userId": "uuid",
      "type": "despesa",
      "slug": "alimentacao",
      "name": "Alimentacao",
      "color": "#10b981",
      "active": true,
      "createdAt": "2026-05-05T00:00:00.000Z"
    }
  ],
  "transactions": [
    {
      "id": "uuid",
      "userId": "uuid",
      "type": "despesa",
      "amount": 150.5,
      "categoryId": "uuid",
      "date": "2026-05-05",
      "description": "Mercado",
      "accountId": "uuid",
      "cardId": null,
      "source": "manual",
      "createdAt": "2026-05-05T00:00:00.000Z",
      "updatedAt": "2026-05-05T00:00:00.000Z"
    }
  ],
  "budgets": [
    {
      "id": "uuid",
      "userId": "uuid",
      "categoryId": "uuid",
      "month": "2026-05",
      "limitAmount": 800,
      "createdAt": "2026-05-05T00:00:00.000Z",
      "updatedAt": "2026-05-05T00:00:00.000Z"
    }
  ]
}
```

### Estrategia de migracao

1. Ler `fp-transacoes`, `fp-config`, `fp-contas`.
2. Criar categorias padrao por slug e manter mapa `slug -> categoryId`.
3. Converter `transacoes[].tipo` para `transactions[].type`.
4. Converter `transacoes[].valor` para `transactions[].amount`.
5. Converter `config.orcamentos` para linhas de `budgets`.
6. Gravar snapshot migrado com `schemaVersion: 3`.
7. Manter fallback por uma versao: se backend falhar, app ainda le localStorage legado.

## 3. Backend de baixo custo

Opcao recomendada: Supabase.

### Arquitetura

```text
SPA Vanilla JS
  -> Supabase Auth
  -> Supabase Postgres + Row Level Security
  -> Edge Functions futuras para rotinas sensiveis
  -> Storage opcional para anexos/importacoes
```

### Tabelas

```sql
profiles (
  id uuid primary key references auth.users(id),
  name text not null,
  currency text not null default 'BRL',
  theme text not null default 'light',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)

categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  type text not null check (type in ('receita', 'despesa')),
  slug text not null,
  name text not null,
  color text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(user_id, slug, type)
)

accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  name text not null,
  type text not null,
  created_at timestamptz not null default now()
)

transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  type text not null check (type in ('receita', 'despesa')),
  amount numeric(14,2) not null check (amount > 0),
  category_id uuid references categories(id),
  account_id uuid references accounts(id),
  card_id uuid references accounts(id),
  date date not null,
  description text,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)

budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  category_id uuid not null references categories(id),
  month text not null,
  limit_amount numeric(14,2) not null check (limit_amount > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, category_id, month)
)
```

Todas as tabelas devem ter RLS:

```sql
using (auth.uid() = user_id)
with check (auth.uid() = user_id)
```

### Endpoints REST alvo

Com Supabase, os endpoints podem ser PostgREST:

```text
POST   /auth/v1/signup
POST   /auth/v1/token?grant_type=password
POST   /auth/v1/logout
GET    /rest/v1/profiles?id=eq.{userId}
PATCH  /rest/v1/profiles?id=eq.{userId}
GET    /rest/v1/categories
POST   /rest/v1/categories
PATCH  /rest/v1/categories?id=eq.{id}
GET    /rest/v1/accounts
POST   /rest/v1/accounts
GET    /rest/v1/transactions?date=gte.{inicio}&date=lte.{fim}
POST   /rest/v1/transactions
PATCH  /rest/v1/transactions?id=eq.{id}
DELETE /rest/v1/transactions?id=eq.{id}
GET    /rest/v1/budgets?month=eq.{yyyy-mm}
POST   /rest/v1/budgets
PATCH  /rest/v1/budgets?id=eq.{id}
```

## 4. Desacoplamento de regras

Implementado agora:

- `TRANSACTION_SERVICE.createTransaction`
- `TRANSACTION_SERVICE.calculateBalance`
- `TRANSACTION_SERVICE.summarizeMonth`
- `TRANSACTION_SERVICE.summarizeByCategory`
- `BUDGET_SERVICE.setBudget`
- `BUDGET_SERVICE.getStatus`

Proximo corte:

- mover import/export de `init.js` para `importExportService.js`;
- mover modais para `modalController.js`.

## 5. Estado

Implementado agora:

```text
APP_STATE.getState()
APP_STATE.setState(patch)
APP_STATE.subscribe(listener)
APP_STATE.hydrateFromDados()
```

Proximo corte:

- `RENDER` deve receber estado como argumento em vez de chamar `TRANSACOES` e `ORCAMENTO` diretamente.
- `DADOS` deve virar adapter: `localStorageAdapter` e `apiAdapter`.

## 6. Performance e estrutura

### Estrutura alvo

```text
src/
  app/
    bootstrap.js
    state.js
  domain/
    transactionService.js
    budgetService.js
    categoryService.js
  data/
    localStorageAdapter.js
    supabaseAdapter.js
    repository.js
  ui/
    render/
    controllers/
  styles/
    style.css
```

### Build recomendado

- Vite.
- Entrada unica: `src/app/bootstrap.js`.
- Beneficios: ordem de dependencias explicita, minificacao, cache busting, ambiente `.env`.

## 7. Seguranca

### Fluxo real

1. Usuario cria conta no Supabase Auth.
2. Supabase retorna sessao.
3. Frontend guarda sessao via SDK.
4. Todas as consultas usam JWT do Supabase.
5. RLS garante que cada usuario so ve seus dados.

### Tokens

- Evitar token manual em `localStorage` no SaaS final.
- Preferir SDK Supabase com refresh token gerenciado.
- CSP mantido restrito.
- Sanitizar todo HTML gerado por strings.

## 8. Roadmap priorizado

### Fase 1 - estabilizar sistema atual

- Concluir services puros para categorias, contas e recorrentes.
- Quebrar `init.js` em controllers.
- Remover duplicidade de regras em `UTILS`.
- Criar export de backup versionado.

### Fase 2 - introduzir backend

- Criar projeto Supabase.
- Aplicar schema SQL e RLS.
- Criar `supabaseAdapter.js`.
- Migrar login/cadastro para Supabase Auth.
- Migrar dados locais para tabelas remotas.

### Fase 3 - escalar

- Vite + estrutura `src/`.
- Testes unitarios nos services puros.
- Auditoria de performance.
- Observabilidade minima: erros, falhas de sync, tempo de carregamento.
