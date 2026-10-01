# Hospedagem da versão web

A versão web é um site estático: o `dist/` que `npm run build` gera tem tudo,
e login, dados e cobrança falam direto com o Supabase. Não há servidor do
app para manter (ADR 0007: o Express saiu).

**Recomendação: Cloudflare Pages.** Plano gratuito sem limite de banda, HTTPS
e domínio próprio, e lê o `dist/_headers` (cabeçalhos de segurança e de
cache). O Netlify lê o mesmo arquivo e serve igual; qualquer outro host
estático funciona, mas aí os cabeçalhos de `config/hospedagem/_headers`
precisam ser configurados à mão no painel dele.

## 1. Criar o projeto

*Cloudflare → Workers & Pages → Create → Pages → Connect to Git* →
`Renato137068/financaspro`.

| Campo | Valor |
|---|---|
| Production branch | `main` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Variável `NODE_VERSION` | `22` |

`SUPABASE_URL` e `SUPABASE_ANON_KEY` são opcionais: sem elas, o build usa o
projeto gravado em `js/core/config.js`. Com elas (outro projeto, staging),
`scripts/inject-supabase-env.cjs` grava os valores no build e a CSP acompanha.

**Conferir:** o deploy termina verde e a URL `*.pages.dev` abre o app.

## 2. Domínio

*Projeto → Custom domains → Set up a domain* → `app.financaspro.com`. O
domínio é o que o app Android (App Links), a política de privacidade da Play
e o retorno do Stripe usam.

**Conferir:**
- `https://app.financaspro.com/.well-known/assetlinks.json` responde JSON
  (sem redirecionar para `index.html`);
- `https://app.financaspro.com/privacidade.html#exclusao-de-conta` abre;
- `curl -sI https://app.financaspro.com/ | grep -i -E 'strict-transport|x-frame|frame-ancestors'`
  mostra os três cabeçalhos.

## 3. Supabase e Stripe apontando para o domínio

- *Supabase → Authentication → URL Configuration*: **Site URL**
  `https://app.financaspro.com` e o mesmo endereço em **Redirect URLs** (os
  links de confirmação de e-mail e de troca de senha voltam para cá).
- *Supabase → Edge Functions → Secrets*: `APP_URL=https://app.financaspro.com`
  (o checkout do Stripe só aceita voltar para essa origem).

**Conferir:** pedir "Esqueci a senha" na web e o link do e-mail abrir a tela
de nova senha em `app.financaspro.com`; `npm run check:pre-beta` sem item
"falhou".

## 4. Desligar o servidor antigo

Só depois do passo 2 conferido: se a web estava sendo servida pelo Express
(Railway ou outro), desligue o serviço e o worker, e apague o Redis. Os
workers já têm substitutos no Supabase (`docs/release/ligar-operacao.md`,
seção "Tarefas agendadas").
