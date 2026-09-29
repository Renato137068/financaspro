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
  migrados e os publica em `window` para os scripts clássicos. Módulo novo
  nasce aqui. Já migrados: as bases `CONFIG` e `UTILS`, o núcleo puro de
  `js/core` (`PASSWORD_POLICY`, `VALIDATIONS`, `FINANCE_CONTRACT`,
  `SYNC_MERGE`, `SESSION_LOG`, `IDB_KV`, `CATEGORIA_VISUAL`, `TELAS`, `LAZY`,
  `DOMUTILS`), a infraestrutura de eventos e persistência (`EVENT_BUS`,
  `EVENTS`, `DOM_SAFE`, `PERSIST_QUEUE`, `FINANCE_RECONCILER`), utilitários (`LOCAL_CRYPTO`, `FUNIL`, `TablistKeyboard`,
  `compartilharTextoUI`), o domínio de lançamentos (`TRANSACOES`, `ORCAMENTO`,
  `CATEGORIES`, `AUTO_CATEGORIZER`, `CATEGORIZADOR`, `APRENDIZADO`, `PARSER`,
  `SCORE`, `PIPELINE`), contas e compromissos (`CONTAS`, `CARTOES`,
  `RECORRENTES`, `COMPROMISSOS`, `CONTAS_PAGAR`, `CALENDARIO`, `PROJECAO`),
  resumos e análise (`RESUMO_MENSAL`, `RESUMO_ANUAL`, `PLANO_METAS`,
  `AI_ENGINE`), os services (transação, orçamento, `HEALTH_SERVICE`),
  `INSIGHT_ACOES`, `DADOS_EXPRESS`, `FORM_SUGESTOES` e a UI sem estado
  (`SETUP_GUIDE`, `SHORTCUTS`, `SKELETON`, `MICRO`, `SYNC_INDICATOR`) e os
  componentes de `js/components/` (cada um exporta o seu objeto e
  `components/ui.js` monta o `UI`), além de `ALERTAS`, `INSIGHTS` e
  `CONFIG_USER`, e a renderização do painel (`RENDER_CORE`,
  `RENDERER_BASE`, `RENDER_DASHBOARD`, `RENDER`; o renderer herda do
  `RENDERER_BASE` por `Object.create` e chama os métodos pelo nome, não por
  `this`), a navegação (`INIT_NAVIGATION`, `mudarAba`), os modais
  (`INIT_MODALS`), o PIN (`PIN_SECURITY` e as funções de tela) e o formulário
  (`INIT_FORM`; o mixin `FORM_SUGESTOES` importa `INIT_FORM` e se copia para
  ele, e não o contrário, para o `Object.assign` nunca ver o mixin ainda não
  inicializado), o billing (`BILLING`) e a autenticação (`authController`,
  `AUTH_BIOMETRIC`), o bootstrap (`APP_BOOTSTRAP`), o lembrete diário, a
  tela de contas a pagar e o núcleo de estado e boot (`APP_STORE`,
  `APP_STATE`, `ACTIONS`, `SYNC_ENGINE`, `LIFECYCLE`, `LIFECYCLE_BOOT`) e a
  camada de dados (`DADOS`, importado por 34 módulos). O
  `LIFECYCLE` é a raiz de composição e importa quase o app inteiro; quem é
  folha (ex.: `HEALTH_SERVICE`) o lê tarde, por `window`, para não puxar
  tudo. Pelo mesmo motivo o `DADOS` acha o `CONFIG_USER` (UI: importa
  navegação e formulário) por `window`, só no clique de "Exportar backup".
  Seguem clássicos:
  - o que depende da posição na página: `pin-guard.js` (sem `defer`, antes
    do primeiro paint), `lucide-init.js` (lê o vendor do lucide, que carrega
    depois da ponte), `fp-secure-screen.js`, `sw-register.js`,
    `capacitor-init.js` e `supabase-billing.js` (lê `DADOS`, `SB` e
    `SUPA_AUTH` ao carregar);
  - o `init.js`: é a camada de compatibilidade dos scripts clássicos
    (`fpAlert`, `atualizarDashboard`, `setFiltroCat`…). Como módulo, o
    domínio (contas, cartões, pipeline) passaria a importar a UI inteira só
    para avisar o painel;
  - `focus-trap.js` e `aria-live.js` (classes: a regra do `this` ainda não
    distingue método de classe de método de objeto);
  - o que mora em chunk lazy. Ciclo de import entre migrados é aceito quando nenhum dos
  dois usa o outro no carregamento (navegação ↔ alertas, navegação ↔
  preferências, formulário ↔ microinterações). Código que roda na carga não
  pode depender do outro lado de um ciclo: quem for avaliado primeiro o veria
  sem inicializar. O `DADOS` fecha ciclos com quase todo o domínio (ele
  importa quem avisa ao gravar: `TRANSACOES`, `RENDER`, `APP_STORE`…); o
  único import que ele lê na carga é o `DADOS_EXPRESS`, que só ele importa. Entre eles a dependência é `import`, e nenhum usa `this`
  fora dos mixins: módulo roda em modo estrito, e método passado como
  callback perde o `this` (`tests/esm-fundacao.test.js` trava as duas
  regras; o conversor dos testes também roda em modo estrito). A ordem de
  boot também é travada: o mesmo teste avalia o grafo inteiro da ponte com
  cada global clássico virando um getter que anota quem o leu, e com o
  documento em 'interactive', como no navegador. Na mesma passada, cada
  `const`/`let` exportado fica em "zona morta" até o módulo terminar
  (`executarModulo(..., { tdz })`): ler, até por `typeof`, um módulo que
  ainda está carregando reprova o teste, como seria ReferenceError no
  navegador. Nos testes os
  módulos dividem um contexto só, então função auxiliar de topo fica dentro
  de uma IIFE (nome de topo repetido entre módulos reprova o teste).
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
- **Telas fora do `index.html`** ([ADR 0006](adr/0006-telas-lazy-fora-do-index.md)).
  Toda tela de chunk lazy (Extrato, Orçamento, o Perfil e suas sub-telas, a
  casca do Simulador) mora em `telas/<chunk>/<tela>.html`. `npm run
  telas:gerar` produz `js/telas/<chunk>.js`, que vem com o chunk e preenche a
  casca do `index.html` via `TELAS` (`js/core/telas.js`); `check:telas` no CI.
  O `index.html` fica com o resumo, o formulário de lançamento e o login.
  Código do núcleo que escreve numa tela lazy escuta `fp:tela-carregada`:
  biometria e 2FA (Segurança), billing (plano, exportação, Extrato), Open
  Finance (Conexões), sessão e botão de sair (Perfil), atalho `/` (Extrato).
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
