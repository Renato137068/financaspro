# Entrega contínua por tag

Uma tag `vX.Y.Z` publica a versão inteira pelo workflow
[`.github/workflows/release.yml`](../../.github/workflows/release.yml):

1. **Verificar** — a tag é a versão do `package.json`
   (`scripts/release-tag.cjs`), versões alinhadas (`check:version`), lint,
   testes do frontend, testes das Edge Functions (`test:edge`), build,
   orçamento do bundle e `npm audit`.
2. **Supabase** — `scripts/deploy-supabase.cjs`: `db push` das migrações e o
   deploy de toda Edge Function (as que recebem chamada sem JWT de usuário com
   `--no-verify-jwt`).
3. **Android** — build, `cap sync`, `bundleRelease` assinado com a keystore de
   upload, conferência da assinatura, AAB anexado a um GitHub Release e, se
   configurado, enviado à faixa de **teste interno** da Play.

Antes da primeira tag, o que só o dono das contas pode fazer (ambiente
`production`, segredos, painel, Play Console) está em
[`ligar-operacao.md`](ligar-operacao.md).

Depois disso vem o [smoke em aparelho](smoke-aparelho.md) com o AAB da faixa
interna; só então a versão é promovida (à mão, no Play Console).

O CD de antes (`deploy.yml`) continua: constrói a imagem Docker da API a cada
push na `main`.

## Cortar uma release

```bash
npm run versao:subir -- patch      # ou minor, major, X.Y.Z
git commit -am "chore(release): vX.Y.Z"
git tag vX.Y.Z
git push --follow-tags
```

O script (`scripts/subir-versao.cjs`) sobe a versão nos quatro lugares que o
`check:version` confere: `package.json` (e o lock), `versionName` e
`versionCode` (+1; a Play recusa repetir) no `build.gradle`, `CONFIG.VERSION`
e o `CACHE_NAME` do service worker. O `npm version` não serve: só conhece o
`package.json` e cria a tag antes dos outros.

Se a tag não bater com a versão do app, o primeiro job falha antes de publicar
qualquer coisa. Para republicar uma tag existente (ex.: o job da Play caiu):
*Actions → Release → Run workflow* com a tag.

## Configuração (uma vez)

**Ambiente `production`** (*Settings → Environments*): crie-o com *Required
reviewers*. Os jobs de Supabase e Android esperam essa aprovação — criar uma
tag não publica nada sozinho.

**Segredos do ambiente `production`:**

| Segredo | O que é |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | token pessoal do Supabase (*Account → Access Tokens*) |
| `SUPABASE_PROJECT_REF` | id do projeto (o `xxxx` de `xxxx.supabase.co`) |
| `SUPABASE_DB_PASSWORD` | senha do Postgres do projeto (para o `db push`) |
| `ANDROID_KEYSTORE_BASE64` | a keystore de upload em base64: `base64 -w0 financaspro-upload.jks` |
| `ANDROID_KEYSTORE_PASSWORD` | senha da keystore |
| `ANDROID_KEY_ALIAS` | alias da chave (`financaspro` no runbook) |
| `ANDROID_KEY_PASSWORD` | senha da chave |
| `PLAY_SERVICE_ACCOUNT_JSON` | *(opcional)* JSON da conta de serviço com acesso de release no Play Console; sem ele, o AAB fica só no GitHub Release |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | *(opcionais)* sobrescrevem o projeto embutido no build |

A keystore chega ao runner só durante o job e é apagada no fim; o
`.gitignore` segue barrando `*.jks` e `keystore.properties`.

## O que não é automático (de propósito)

- **Segredos das Edge Functions** (`supabase secrets set …`): mudam raramente e
  são de produção; seguem à mão ([`supabase/functions/README.md`](../../supabase/functions/README.md)).
- **Promoção na Play** (interno → fechado → produção): depende do smoke em
  aparelho.
