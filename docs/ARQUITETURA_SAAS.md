# FinançasPro — Arquitetura

Retrato do sistema em 27/09/2026 (versão 11.3.18). As decisões que explicam o
porquê de cada escolha estão em [`docs/adr/`](adr/).

## Visão geral

```text
 App (PWA / Android via Capacitor)
 ├─ scripts clássicos em js/  →  app.bundle.js (eager) + js/lazy/*.bundle.js
 ├─ ES Modules (js/esm/ponte.js e o que importa)  →  js/index-<hash>.js (Vite)
 ├─ dados no aparelho: localStorage + IndexedDB (cifragem opcional AES-GCM)
 └─ com conta: Supabase
      ├─ Auth (e-mail/senha, TOTP)
      ├─ PostgREST direto nas tabelas, protegido por RLS
      └─ Edge Functions: billing Stripe/Play, convites, trial, relatórios de erro
 Schema das tabelas: Prisma (prisma/migrations)  ·  RLS e funções: supabase/migrations
 API Express (backend/): legado congelado — ADR 0004
```

O app funciona sem conta (modo local, dados só no aparelho). Com conta, os
mesmos dados sincronizam com o Supabase.

## Frontend

- **Scripts clássicos com globais.** Cada `var NOME = {…}` no topo de um
  arquivo de `js/` é global, e a ordem das tags em `index.html` define as
  dependências. A migração para ES Modules está em
  [ADR 0002](adr/0002-migracao-frontend-es-modules.md). O ESLint aplica
  `no-undef` com a lista gerada em `config/frontend-globals.json`
  (`npm run globals:update`; o CI confere com `check:globals`).
- **ES Modules pela ponte** ([ADR 0005](adr/0005-ponte-es-modules-entrada-vite.md)).
  `js/esm/ponte.js` é o único `<script type="module">`: importa os módulos
  migrados (`CATEGORIA_VISUAL`, `TRANSACTION_SERVICE`, `BUDGET_SERVICE`,
  `INSIGHT_ACOES`, `DADOS_EXPRESS`, `FORM_SUGESTOES`) e os publica em `window`
  para os scripts clássicos. Módulo novo nasce aqui.
- **Mixins para quebrar arquivos grandes.** Um pedaço coeso de um objeto
  clássico sai para um ES Module e volta por `Object.assign` no fim do
  arquivo original, sem mudar quem chama: `dados-express.js` (cliente da API
  Express, congelado) em `DADOS`, `form-sugestoes.js` (autocategorização e
  autocomplete) em `INIT_FORM`. Dentro de um chunk lazy o pedaço continua
  script clássico, no mesmo chunk: `config-backup.js` e `config-bancos.js`
  em `INIT_CONFIG`. Nos testes, `tests/helpers/esm-como-script.cjs` os roda via
  `vm` sem mudar as posições dos caracteres (cobertura V8).
- **Organização:** `js/core/` (config, dados, store, sync, utilidades de base),
  `js/services/` (regras puras), `js/modules/init-*.js` (telas),
  `js/utilities/` (transversais: OBS, funil, cifragem local, foco),
  `js/components/` (gráficos).
- **Build** (`npm run build`): Vite para CSS/HTML e para a entrada ESM, depois
  `scripts/bundle-app.cjs` concatena e minifica os scripts clássicos em
  `vendor.bundle.js` (supabase-js, lucide) e `app.bundle.js`, e separa os
  chunks lazy.
- **Chunks lazy** (`LAZY_CHUNKS` em `scripts/bundle-app.cjs`), carregados por
  `LAZY.load()` ou `INIT_NAVIGATION._ensureChunk()` na primeira abertura da
  tela: previsão, relatórios, anexos, metas, assinaturas, patrimônio,
  extrato, orçamento, config (Perfil), simulador, onboarding e `conta`
  (paywall, Play Billing, 2FA, Open Finance).
  `tests/lazy-chunks.test.js` exige um carregador para cada chunk.
- **Orçamento do bundle** (`npm run check:bundle`): o teto só desce,
  travado por `tests/bundle-budget-teto.test.js`. O código eager do app é a
  soma de `app.bundle.js` e da entrada ESM.
- **Service worker** (`sw.js`, gerado por `scripts/generate-sw-cache.cjs`):
  precache seletivo do app shell ([ADR 0003](adr/0003-precache-seletivo-service-worker.md));
  nada de origem cruzada entra no cache. Desligado no app nativo.
- **CSP de produção** endurecida no build (`scripts/harden-csp.cjs`): sem
  `unsafe-inline` em script; `connect-src` só com o Supabase.

## Dados no aparelho

- `DADOS` (`js/core/dados.js`) é a única porta de leitura e escrita. O
  cliente da API Express legada fica à parte, em `js/core/dados-express.js`.
  Lançamentos ficam no localStorage e migram para o IndexedDB acima de ~2.500
  itens ou 3 MB.
- **Cifragem opcional** (`js/utilities/local-crypto.js`): AES-GCM com chave
  PBKDF2 (600 mil iterações) sobre localStorage, IndexedDB e anexos. Sem frase
  própria, a chave fica no aparelho; a interface diz isso.
- **Dinheiro em centavos** nas somas (`UTILS.somarMoeda`), datas por
  componentes locais (sem deriva de fuso).
- **Fila de persistência** (`js/core/persist-queue.js`) e merge entre abas e
  aparelhos (`js/core/sync-merge.js`), com modal de conflito.

## Nuvem (Supabase)

- **Auth:** `js/core/supabase.js` (`SUPA_AUTH`), sessão persistida no aparelho,
  TOTP opcional com códigos de recuperação.
- **Sync:** `js/core/supabase-sync.js` lê e grava direto nas tabelas
  (`Transaction`, `Account`, `Budget`, `RecurringTransaction`, `UserConfig`),
  sempre filtrado pela RLS.
- **Organizações e plano:** `js/core/supabase-billing.js` (`Organization`,
  `OrganizationMember`, `Invitation`, `Subscription`, `Plan`). As cotas do plano
  grátis são aplicadas no banco por triggers (`supabase/migrations/*quota*`).
- **Edge Functions** (`supabase/functions/`, Deno): `play-verify`, `play-rtdn`,
  `stripe-checkout`, `stripe-portal`, `stripe-cancel`, `stripe-resume`,
  `stripe-webhook`, `org-invite`, `welcome-trial`, `obs-ingest`. Deploy e
  secrets em `supabase/functions/README.md`.
- **Schema:** o Prisma cria as tabelas; `supabase/migrations/` liga a RLS e
  define funções e triggers. Tabela nova sem RLS reprova o pgTAP
  `rls_coverage`.
- **Relatórios de erro:** o OBS envia erros (sanitizados, sem valores nem
  e-mail) para `obs-ingest`, que grava em `fp_client_error` com retenção de 30
  dias. O usuário desliga no Perfil.

## API Express (legado)

`backend/` — Express, Prisma, JWT próprio, BullMQ. **Congelada** pelo
[ADR 0004](adr/0004-supabase-fonte-de-verdade-express-congelado.md): sem
funcionalidade nova, só correção de segurança. Veja
[`backend/README.md`](../backend/README.md) para o que ainda só existe lá.

## Android

Capacitor 8 (`capacitor.config.json`, `android/`). `allowBackup=false`, sem
cleartext, R8 ligado, depuração desligada, targetSdk 36. Biometria, tela
segura (FLAG_SECURE) no login/PIN e Google Play Billing por plugin nativo.

## Qualidade

| Camada | Onde | O que prova |
|---|---|---|
| Unidade (frontend) | `tests/*.test.js` (Jest + jsdom) | regras de negócio, com os módulos reais carregados por `tests/helpers/carregar-script.cjs` |
| App inteiro | `tests/app-*.test.js` + `tests/helpers/app-jsdom.cjs` | telas reais (Novo lançamento, login, paywall) com todos os scripts do `index.html` |
| Unidade (backend) | `tests/backend/` (Jest ESM) | API Express e o sanitizador de `obs-ingest` |
| Banco | `supabase/tests/*.test.sql` (pgTAP) | RLS, cotas, MFA, relatórios de erro |
| Ponta a ponta | `e2e/*.spec.cjs` (Playwright) | build de produção num navegador, incluindo axe e chunks lazy |

O CI (`.github/workflows/ci.yml`, Node 22 e 24) roda build, lint (com
`no-undef` no frontend), `npm audit`, orçamento do bundle, contraste WCAG,
dívida de tokens CSS, varredura de XSS, testes com pisos de cobertura, pgTAP e
E2E.
