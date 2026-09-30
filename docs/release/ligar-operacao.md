# Ligar a operação

O código do deploy por tag, dos relatórios de erro, do painel de saúde e dos
testes de cobrança já está no repositório e testado. Nada disso vale em
produção até alguém com acesso às contas ligar. São passos únicos, nesta
ordem (cada um destrava o seguinte), e cada um diz como conferir que deu
certo.

A reauditoria de 30/09 (`docs/auditorias/auditoria-completa-2026-09-30.html`)
conta isto como a etapa 1 do roadmap: sem estes passos, a nota de CI/CD e de
observabilidade não passa do que o código sozinho garante.

## 1. Ambiente `production` no GitHub

*Settings → Environments → New environment* → `production`.

- **Required reviewers:** você. Sem isso, qualquer um que crie uma tag publica.
- **Secrets** (os nomes exatos estão no cabeçalho de `.github/workflows/release.yml`):
  `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`,
  `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
  `ANDROID_KEY_PASSWORD` e, para enviar à Play, `PLAY_SERVICE_ACCOUNT_JSON`.

`ANDROID_KEYSTORE_BASE64` sai de `base64 -w0 upload.jks` (no Windows:
`[Convert]::ToBase64String([IO.File]::ReadAllBytes("upload.jks"))`). A
keystore em si nunca entra no repositório.

**Conferir:** *Settings → Environments → production* lista os segredos e o revisor.

## 2. Supabase: migrações e funções

Pela primeira tag (passo 5) ou antes, à mão, de uma máquina com o
[Supabase CLI](https://supabase.com/docs/guides/cli) logado:

```bash
SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_REF=... SUPABASE_DB_PASSWORD=... \
  node scripts/deploy-supabase.cjs --dry-run   # confere os comandos
# sem --dry-run para aplicar
```

Isso aplica as migrações pendentes, entre elas `20260927120000_client_error_log`
(relatórios de erro), `20260930120000_saude_telemetria` (painel) e
`20261001120000_prisma_migrations_rls`, e publica as Edge Functions, entre
elas a `obs-ingest`.

**Conferir:**
- *Supabase → Advisors → Security*: sem aviso de "RLS disabled in public".
- *SQL Editor*: `select * from saude.versao_resumo;` responde (vazio no começo).
- *Edge Functions*: `obs-ingest` aparece com "Verify JWT" desligado.

## 3. Painel de saúde

Crie o papel de leitura e o segredo do alerta diário, como em
`docs/observabilidade/painel-saude.md` (seção "Configurar o segredo").

**Conferir:** *Actions → Saúde do app → Run workflow*. O job sai verde e o
resumo mostra as tabelas. Sem o segredo, ele sai verde mas avisa que pulou.

## 4. Play Console: Segurança dos dados

Declare o que o app coleta, com as respostas prontas em
`docs/play-store-data-safety.md` (seção A.1): "Registros de falhas /
Diagnóstico" e "Outros dados de desempenho do app", os dois como coletados,
não compartilhados e não vinculados à conta.

**Conferir:** o formulário fica "Concluído" e o app não recebe aviso de
divergência depois do envio da versão.

## 5. Primeira release por tag

```bash
npm run versao:subir -- patch
git commit -am "chore(release): vX.Y.Z"
git tag vX.Y.Z && git push --follow-tags
```

Aprove o ambiente `production` quando o GitHub pedir. Detalhes em
[`entrega-continua.md`](entrega-continua.md).

**Conferir:** os três jobs verdes; o AAB `financaspro-vX.Y.Z.aab` anexado ao
GitHub Release; a versão na faixa de teste interno da Play.

## 6. Smoke em aparelho

Abra uma issue com o template **Release** e siga
[`smoke-aparelho.md`](smoke-aparelho.md) com o AAB da faixa interna, em um
aparelho real. Só promova a versão com todos os itens marcados.

**Conferir:** a issue fechada, com o aparelho e a versão anotados.

## 7. Alias de privacidade

Crie um endereço no domínio (ex.: `privacidade@` o domínio do app)
encaminhando para quem responde, e troque as três menções em
`privacidade.html` (é mudança de texto; peça que eu faça, passando o
endereço). O e-mail pessoal continua funcionando, mas um alias sobrevive a
troca de pessoa e passa mais confiança.

## 8. URLs públicas

De uma máquina com internet: `npm run check:pre-beta`. Ele confere o
alcance do projeto Supabase, os segredos de billing, o `assetlinks.json` e a
política de privacidade publicados. Daqui (rede do agente) esses itens
ficam como "não verificado", nunca como aprovados.

**Conferir:** nenhum item "não verificado" nem "falhou" na saída.

## 9. Stripe no modo de teste

As Edge Functions usam o `stripe@22.6.2` com a API `2026-08-26.dahlia`
(`supabase/functions/_shared/stripe.ts`). Os testes cobrem a biblioteca de
verdade com a API simulada (`supabase/functions/_testes/stripe-sdk.test.ts`)
e os dois formatos de webhook (o antigo, 2024-06-20, e o novo), mas só a API
do Stripe confere preço, cliente e sessão de verdade. Antes de ligar o
modo live:

1. No painel do Stripe em **modo de teste**, crie o endpoint de webhook
   apontando para `https://<PROJECT_REF>.supabase.co/functions/v1/stripe-webhook`,
   com os cinco eventos de `supabase/functions/README.md` e a versão da API
   `2026-08-26.dahlia` (o código lê as duas, mas o endpoint novo deve nascer
   na versão da biblioteca).
2. Grave `STRIPE_SECRET_KEY` (`sk_test_...`) e `STRIPE_WEBHOOK_SECRET` do
   endpoint de teste nos segredos das Edge Functions, e os `price_...` de
   teste em `Plan.stripePriceIdMonthly`/`stripePriceIdYearly`.
3. No app web, logado como dono da org, assine o Pro com o cartão
   `4242 4242 4242 4242`.
4. No Stripe, cancele pelo portal (botão "Gerenciar" do app) e depois
   cancele de vez pelo painel.

**Conferir:**
- Passo 3: a linha da org em `Subscription` fica com `stripeSubId` `sub_...`,
  `status` `TRIALING` e `currentPeriodStart`/`currentPeriodEnd` preenchidos
  (é o campo que mudou de lugar na API nova).
- Passo 4: `cancelAtPeriodEnd` vira `true` e, no cancelamento de vez,
  `status` vira `CANCELED` e o e-mail de cancelamento chega ao cliente (com
  `RESEND_API_KEY` configurada).
- *Stripe → Developers → Webhooks → endpoint*: todas as entregas com 200.
- Opcional, com um *Test clock* passando do fim do teste grátis: a fatura
  paga cria a linha em `Invoice` e a assinatura vai para `ACTIVE`.
