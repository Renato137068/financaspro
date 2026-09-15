# E2E Supabase — caminho de produção (staging)

O CI principal roda toda a suíte E2E em **modo piloto** (`fp-force-local=1`), com
o transporte Supabase **desligado**. Ou seja: o caminho que o usuário do beta
realmente usa — registrar/logar/sincronizar via Supabase — é o único **sem
cobertura automatizada** ponta-a-ponta.

Este runbook liga essa cobertura. O spec já existe
(`e2e/auth-supabase-ui.spec.cjs`) e o workflow dedicado
(`.github/workflows/e2e-supabase.yml`) sobe o app em **modo cloud apontando para
um Supabase de staging** e faz **login de verdade**. Ele roda **sob demanda**
(Actions → *E2E Supabase (staging)* → *Run workflow*), não trava PRs e não bate
no Supabase a cada push. Sem os secrets, o job vira um no-op explícito.

> ⚠️ Use um projeto Supabase **de staging**, nunca o de produção. O teste cria
> sessão com contas de teste; você não quer esse tráfego (nem usuários de teste)
> no banco dos seus usuários reais.

---

## 1. Criar o projeto Supabase de staging

1. https://supabase.com/dashboard → **New project** (ex.: `financaspro-staging`).
2. Aplique o mesmo schema/migrations do projeto de produção (as migrations em
   `supabase/` — via `supabase db push` apontando para o projeto de staging, ou
   rodando os SQLs manualmente).
3. Em **Project Settings → API**, anote:
   - **Project URL** → vira o secret `E2E_SUPABASE_URL`
   - **anon public key** → vira o secret `E2E_SUPABASE_ANON_KEY`

## 2. Criar as contas de teste

Em **Authentication → Users → Add user** (no projeto de staging):

1. Conta **sem MFA**: e-mail + senha → `E2E_SUPABASE_EMAIL` / `E2E_SUPABASE_PASSWORD`.
2. (Opcional) Conta **com MFA TOTP**: crie a conta, habilite TOTP e guarde o
   *secret* do autenticador → `E2E_SUPABASE_MFA_EMAIL` /
   `E2E_SUPABASE_MFA_PASSWORD` / `E2E_SUPABASE_TOTP_SECRET`.

> **Importante:** desligue a confirmação de e-mail para essas contas, senão o
> login trava esperando o clique no link. Em **Authentication → Providers →
> Email**, desative *Confirm email* no projeto de staging (ou marque os usuários
> de teste como confirmados ao criá-los).

## 3. Configurar os secrets no GitHub

Repositório → **Settings → Secrets and variables → Actions → New repository
secret**. Nomes exatos (o workflow os lê por esses nomes):

| Secret | Obrigatório | Serve para |
|---|---|---|
| `E2E_SUPABASE_URL` | ✅ | Build aponta para o Supabase de staging |
| `E2E_SUPABASE_ANON_KEY` | ✅ | idem (chave anônima pública) |
| `E2E_SUPABASE_EMAIL` | ✅ p/ login | Conta de teste sem MFA |
| `E2E_SUPABASE_PASSWORD` | ✅ p/ login | Senha dessa conta |
| `E2E_SUPABASE_MFA_EMAIL` | opcional | Conta de teste com TOTP |
| `E2E_SUPABASE_MFA_PASSWORD` | opcional | Senha da conta com TOTP |
| `E2E_SUPABASE_TOTP_SECRET` | opcional | Secret TOTP (gera o código no teste) |

- Só `URL` + `ANON_KEY`: rodam os testes de **UI estática** (login real pulado).
- `+ EMAIL` + `PASSWORD`: roda o **login real sem MFA**.
- `+` os três de MFA: roda também o **login com TOTP**.

## 4. Rodar

**GitHub → Actions → E2E Supabase (staging) → Run workflow.**

O job:
1. Builda em modo cloud injetando a URL/anon de staging no `config.js`.
2. Instala o Chromium do Playwright.
3. Roda `e2e/auth-supabase-ui.spec.cjs` (UI + login real + MFA quando houver).
4. Publica o `playwright-report` como artefato (7 dias).

Se os secrets faltarem, o job termina **verde** com um aviso (`::warning::`) —
não é falha.

## 5. Rodar localmente (opcional)

```bash
export SUPABASE_URL="https://SEU-STAGING.supabase.co"
export SUPABASE_ANON_KEY="<anon key de staging>"
node scripts/set-build-mode.cjs cloud
npm run build

export E2E_SUPABASE=1
export E2E_EMAIL="conta-teste@exemplo.com"
export E2E_PASSWORD="<senha>"
# Chromium do ambiente, se o download do Playwright estiver indisponível:
# export PW_CHROMIUM=/opt/pw-browsers/chromium/chrome-linux/chrome
npx playwright test --config playwright.config.cjs e2e/auth-supabase-ui.spec.cjs
```

> Depois de buildar em cloud, lembre de `node scripts/set-build-mode.cjs local`
> e/ou `node scripts/inject-supabase-env.cjs --clear` se não quiser deixar o
> `config.js` alterado no seu checkout local.

## Notas de manutenção

- **Primeira execução real ainda não foi validada** (o harness foi montado sem
  um Supabase de staging à mão). Espere ajustar detalhes na 1ª rodada — em
  especial os seletores de login em `auth-supabase-ui.spec.cjs` e a política de
  confirmação de e-mail do projeto.
- O spec desliga o `fp-force-local` no grupo de *login real* (`test.use({
  storageState: { cookies: [], origins: [] } })`) para o transporte Supabase
  ficar ativo — sem isso o app sobe em modo local e o login Supabase nem existe.
- Se algum dia quiser rodar isso a cada semana, descomente o bloco `schedule`
  no workflow.
