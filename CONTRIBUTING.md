# Contribuindo com o Sobra

Este documento descreve como o código deste repositório é escrito, testado e
aceito. Ele existe para que decisões repetidas não precisem ser rediscutidas a
cada pull request.

## Ambiente

```bash
npm ci
cp .env.example .env
npm run db:generate
npm run db:migrate
npm run dev          # frontend em :3000
npm run backend:dev  # API em :4000
```

Node 18+ e npm 9+. O Postgres só é necessário para o backend completo; o
frontend funciona offline sem API — esse é um requisito de produto, não um
detalhe de implementação.

## Antes de abrir um PR

```bash
npm run lint:changed   # zero avisos no que você tocou
npm test               # suítes de frontend e backend
npm run build          # precisa passar
npm run check:bundle   # orçamento de peso
```

O CI roda tudo isso mais `npm audit`, os testes de integração HTTP, o
verificador de sinks de XSS e a suíte E2E do Playwright.

## Testes

O projeto tem **duas suítes Jest separadas**, com configurações próprias:

| Suíte | Config | Ambiente | Módulos |
|---|---|---|---|
| Frontend | `jest.frontend.config.cjs` | jsdom | CommonJS (`require`) |
| Backend | `jest.backend.config.cjs` | node | ESM nativo |

Elas não podem rodar no mesmo processo: o backend precisa de
`--experimental-vm-modules` para usar `jest.unstable_mockModule`, e essa flag
faria o Jest tratar todo `.js` como ESM — quebrando os `require()` do frontend,
já que o `package.json` raiz declara `"type": "module"`. Por isso `npm test`
executa as duas em sequência.

### Cobertura

Os limiares em cada config são **pisos calibrados sobre a medição real**, não
metas aspiracionais. Duas regras:

1. **Nunca baixe um piso para fazer o CI passar.** Se a cobertura caiu, ou o
   teste que faltou é legítimo, ou o código novo não foi testado.
2. **Suba o piso quando a cobertura subir.** É assim que a dívida diminui de
   forma irreversível.

Atenção a um detalhe do Jest: arquivos com limiar próprio saem do grupo
`global`. O número global descreve apenas o *restante* — hoje, a camada de UI
do frontend e as rotas do backend.

### O que testar

Priorize, nesta ordem:

1. Regras que movem dinheiro ou expõem dados de outro usuário.
2. Caminhos de erro — é onde os bugs sobrevivem.
3. Contratos entre camadas (o que o repositório monta antes de chamar o Prisma).

Testes estáticos como `tests/backend/routes-guard.test.js` e
`tests/sw-precache.test.js` valem tanto quanto os de comportamento: eles impedem
que a *próxima* rota ou o *próximo* asset nasçam desprotegidos.

## Estilo de código

### Backend

ESM, camadas explícitas:

```
routes/       → HTTP: validação de entrada, status codes
domain/services/    → regra de negócio
domain/repositories/ → acesso ao Prisma
lib/          → utilitários sem estado
middleware/   → transversais (auth, rate limit, csrf, validação)
```

Uma rota nunca fala com o Prisma direto. Um repositório nunca lança `AppError`
de regra de negócio.

**Todo handler async usa `asyncHandler`.** Sem ele, um `throw` vira
`unhandledRejection` e o `server.js` responde a isso encerrando o processo —
um erro de credenciais derrubaria a API.

**Toda rota com path param usa `validateParams`.** Um `:id` que não é UUID
chega ao Prisma e vira 500; validado na borda, vira 400. Há um teste que falha
se você esquecer.

### Frontend

O frontend ainda é um app clássico multi-script com estado em globais. Isso é
dívida conhecida e está sendo migrada para ES Modules — veja
`docs/adr/0002-migracao-frontend-es-modules.md`.

Enquanto isso:

- Ordem de carregamento em `index.html` importa. Dependências antes.
- Escape obrigatório: `escHtml()` em qualquer texto de usuário que vá para
  `innerHTML`. O CI verifica isso (`npm run security:xss`).
- Nada de `console.log` — use `OBS` (`js/utilities/observability.js`).
  `console.warn` e `console.error` são permitidos e sobrevivem à minificação.
- Depois de alterar dados: `salvarDados()` e então `renderTudo()`.

## Lint

`npm run lint` reporta a dívida existente como avisos. `npm run lint:changed`
roda com `--max-warnings 0` **apenas nos arquivos que o PR toca**.

A assimetria é intencional: elevar `no-undef` a erro hoje quebraria o build por
causa de centenas de globais legítimos do padrão atual; deixá-lo em aviso para
sempre faria a dívida crescer. O gate congela o passado e exige limpeza do
presente.

## Segurança

Regras que não se negociam:

- Senhas: PBKDF2-SHA256 com o número de iterações do `CONFIG`, salt novo por
  usuário, comparação em tempo constante.
- Refresh tokens são gravados como SHA-256 — o valor em claro nunca persiste.
- Reuso de refresh token revoga **toda** a família de sessões.
- Respostas de erro de login são indistinguíveis entre "e-mail não existe" e
  "senha errada", inclusive no tempo de resposta.
- Config de usuário sincronizada passa por `sanitizeUserConfig` — material do
  PIN nunca sai do dispositivo.
- Nada de segredo em código. `.env` é ignorado pelo git e há teste que verifica.

## Commits

Padrão convencional, em português:

```
feat(billing): checkout anual com desconto
fix(auth): jti único no refresh token
perf(sw): precache só do app shell
test(backend): suíte unitária de auth.service
docs(adr): decisão sobre migração para ES Modules
```

O escopo é o módulo afetado. A mensagem descreve o efeito, não o arquivo.

## Decisões arquiteturais

Mudanças estruturais são registradas em `docs/adr/`. Se você está prestes a
introduzir uma dependência nova, mudar a fronteira entre camadas ou escolher
entre duas abordagens com trade-offs relevantes, escreva um ADR antes do
código. O formato está em `docs/adr/0001-registro-de-decisoes.md`.
