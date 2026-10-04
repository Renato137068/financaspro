# Contribuindo com o FinançasPro

Este documento descreve como o código deste repositório é escrito, testado e
aceito. Ele existe para que decisões repetidas não precisem ser rediscutidas a
cada pull request.

## Ambiente

```bash
npm ci
npm run dev          # frontend em :3000
```

Node 22+ e npm 9+. Não há servidor próprio para subir: login, dados e cobrança
falam com o Supabase ([ADR 0007](docs/adr/0007-remocao-do-express.md)). O
Postgres local só é necessário para as migrações e os testes pgTAP.

## Antes de abrir um PR

```bash
npm run lint:changed   # zero avisos no que você tocou
npm test               # suíte Jest
npm run build          # precisa passar
npm run check:bundle   # orçamento de peso
```

O CI roda tudo isso mais `npm audit`, o verificador de sinks de XSS, os testes
das Edge Functions, o pgTAP e a suíte E2E do Playwright.

## Testes

A suíte Jest (`jest.frontend.config.cjs`, jsdom, testes em CommonJS) carrega os
arquivos de `js/` e o JavaScript puro das Edge Functions pelo
`tests/helpers/carregar-script.cjs`.

Fora do Jest, duas suítes que o CI também roda:

| Suíte | Comando | Precisa de |
|---|---|---|
| Edge Functions (a cobrança de produção) | `npm run test:edge` e `npm run check:edge-types` | Deno 2 |
| Banco: RLS, cotas, MFA, painel de saúde | `npm run test:db:ci` | Postgres 16 com pgTAP |

Edge Function nova que mexe com dinheiro ganha teste de comportamento em
`supabase/functions/_testes/` (ver `supabase/functions/README.md`), não teste
que lê o código como texto.

### Cobertura

Os limiares em cada config são **pisos calibrados sobre a medição real**, não
metas aspiracionais. Duas regras:

1. **Nunca baixe um piso para fazer o CI passar.** Se a cobertura caiu, ou o
   teste que faltou é legítimo, ou o código novo não foi testado.
2. **Suba o piso quando a cobertura subir.** É assim que a dívida diminui de
   forma irreversível.

Atenção a um detalhe do Jest: arquivos com limiar próprio saem do grupo
`global`. O número global descreve apenas o *restante* — hoje, a camada de UI.

### O que testar

Priorize, nesta ordem:

1. Regras que movem dinheiro ou expõem dados de outro usuário.
2. Caminhos de erro — é onde os bugs sobrevivem.
3. Contratos entre camadas (o que o app manda ao Supabase e o que ele devolve).

Testes estáticos como `tests/retencao-politica.test.js` e
`tests/sw-precache.test.js` valem tanto quanto os de comportamento: eles impedem
que a *próxima* tabela ou o *próximo* asset nasçam desprotegidos.

## Estilo de código

### Servidor

**Regra de servidor é SQL ou Edge Function no Supabase** — SQL em
`supabase/migrations/` (com RLS e teste pgTAP em `supabase/tests/`) ou Edge
Function em `supabase/functions/` (com teste em `supabase/functions/_testes/`).
Servidor Node próprio para regra de negócio é proibido
([ADR 0007](docs/adr/0007-remocao-do-express.md)); o que não couber nos dois
vira um ADR novo.

- Função SQL chamável pelo app: `security definer` só quando precisa, com
  `search_path` fixo, e `revoke execute` de `anon` quando não é pública.
- Tarefa agendada (`pg_cron`) que chama Edge Function leva segredo no Vault e a
  função confere o cabeçalho em tempo constante (`supabase/functions/_shared/segredo.ts`).
- O schema continua no Prisma (`prisma/schema.prisma`): tabela nova entra lá,
  com migração, e ganha prazo de retenção (`tests/retencao-politica.test.js`).

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

- Login, senha e 2FA são do Supabase Auth: o app não guarda nem compara senha.
- Toda tabela exposta tem RLS, e o pgTAP prova que um usuário não lê nem altera
  o dado de outro.
- Segredo compartilhado (webhook, RTDN, agendamento) é comparado em tempo
  constante.
- Material do PIN nunca sai do dispositivo: o sync remove `pinHash` e afins
  antes de mandar a configuração (`js/core/supabase-sync.js`).
- Nada de segredo em código. `.env` é ignorado pelo git e há teste que verifica;
  segredos de produção ficam nas Edge Functions (Secrets) e no Vault.

## Commits

Padrão convencional, em português:

```
feat(billing): checkout anual com desconto
fix(auth): jti único no refresh token
perf(sw): precache só do app shell
test(edge): reconciliação da Play pergunta ao Google antes de revogar
docs(adr): decisão sobre migração para ES Modules
```

O escopo é o módulo afetado. A mensagem descreve o efeito, não o arquivo.

## Decisões arquiteturais

Mudanças estruturais são registradas em `docs/adr/`. Se você está prestes a
introduzir uma dependência nova, mudar a fronteira entre camadas ou escolher
entre duas abordagens com trade-offs relevantes, escreva um ADR antes do
código. O formato está em `docs/adr/0001-registro-de-decisoes.md`.
