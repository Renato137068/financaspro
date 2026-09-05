# Runbook — Assinaturas na Play Store (Google Play Billing)

Guia clique-a-clique para ligar as assinaturas do FinançasPro no Google Play.
O **código já está pronto** (verificação real na Google API, webhook RTDN e
reconciliação). Aqui é só a parte de **console** — que só você pode fazer,
porque envolve login, aceite de termos e configuração de cobrança.

> **Como usar com o Claude:** faça um passo por vez. Ao final de cada fase há um
> checkpoint **📸 "Me mostre"** — mande um print ou o que apareceu na tela, e eu
> confiro antes de você seguir.

## Valores de referência (já decididos — use exatamente estes)

| Item | Valor |
|---|---|
| Package name | `com.financaspro.mobile` |
| Backend (API) | `https://financaspro-web-production.up.railway.app` *(confirme a sua URL real no Railway → Settings → Networking)* |

**Produtos de assinatura (IDs exatos — o código depende deles):**

| Product ID | Preço | Período |
|---|---|---|
| `financaspro.pro.monthly` | R$ 16,99 | mensal |
| `financaspro.pro.yearly` | R$ 129,99 | anual |

- **Só estes 2.** Não crie produtos Business — o app não oferece esse plano.
- **Trial de 7 dias** nos dois produtos Pro.
- Se digitar um ID diferente de um caractere que seja, o backend não reconhece o
  produto. Copie e cole.

---

## Fase 0 — Pré-requisitos (confirme antes de começar)

- [ ] Conta no **Google Play Console** ativa (taxa única de US$25 já paga).
- [ ] App **FinançasPro** criado, com o AAB já subido em **Teste interno**
      (você já tem isto).
- [ ] Backend no ar no Railway (veja `docs/deploy-railway-neon-upstash.md`).
      Cheque: abra `https://SUA-API/health` → deve responder OK.

📸 **Me mostre:** a URL do `/health` respondendo, pra confirmarmos o backend antes.

---

## Fase 1 — Criar os 2 produtos de assinatura (Pro mensal + anual)

Play Console → seu app → menu lateral **Monetizar → Produtos → Assinaturas**.

Para **cada** um dos 2 produtos:

1. Clique **Criar assinatura**.
2. **ID do produto:** cole o ID exato da tabela (ex.: `financaspro.pro.monthly`).
   ⚠️ O ID **não pode ser alterado depois de criado** — confira antes de salvar.
3. **Nome:** algo legível (ex.: "Pro — Mensal"). Esse texto o usuário vê.
4. Salve. Agora, dentro da assinatura, crie um **plano base (base plan)**:
   - **ID do plano base:** ex.: `mensal` (ou `anual`).
   - **Tipo:** *Recorrente automático*.
   - **Período de cobrança:** **Mensal** para os `.monthly`, **Anual** para os
     `.yearly`.
   - **Preço:** o da tabela (defina para o **Brasil / BRL**; se quiser outros
     países, o Play converte, mas foque no Brasil primeiro).
   - **Ative** o plano base.

Repita até os 2 existirem, cada um com **um** plano base.

> **Só Pro mensal e anual.** Não crie SKUs Business — o paywall do app não
> mostra esse plano (`SHOW_BUSINESS_PLAN: false`).

### Trial de 7 dias (só nos dois Pro)

Ainda dentro de `financaspro.pro.monthly` e `financaspro.pro.yearly`:

1. Aba **Ofertas** → **Criar oferta** no plano base.
2. Tipo de oferta: **Teste gratuito (free trial)**.
3. Duração: **7 dias**.
4. Elegibilidade: **novos assinantes** (padrão).
5. Ative a oferta.

📸 **Me mostre:** a lista das 2 assinaturas Pro com status **Ativo**, e as ofertas de
trial nos dois.

---

## Fase 2 — Conta de serviço + acesso à Google Play Developer API

Isso é o que deixa o **backend confirmar** com o Google se uma compra é real.

### 2a. Vincular um projeto do Google Cloud

1. Play Console → **Configurações → Acesso via API** (*API access*).
2. Se pedir, **vincule/crie um projeto do Google Cloud** (pode criar um novo ali
   mesmo). Aceite a vinculação.

### 2b. Criar a conta de serviço

1. Na mesma tela **Acesso via API**, clique **Criar conta de serviço** → isso te
   leva ao **Google Cloud Console**.
2. No Google Cloud: **Criar conta de serviço**
   - Nome: ex.: `financaspro-billing`.
   - **Não** precisa conceder papéis (roles) do Cloud aqui — pode pular.
   - Finalizar.
3. Abra a conta de serviço criada → aba **Chaves (Keys)** → **Adicionar chave →
   Criar nova chave → JSON** → baixa um arquivo `.json`.
   🔒 **Esse arquivo é uma credencial.** Guarde com cuidado, **não** suba pro
   GitHub. Ele vira a env `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`.

### 2c. Dar permissão à conta de serviço no Play Console

1. Volte ao Play Console → **Acesso via API** → a conta de serviço deve aparecer
   listada → **Conceder acesso**.
   (Ou em **Usuários e permissões → Convidar**, usando o e-mail da conta de
   serviço, que é algo como `financaspro-billing@...iam.gserviceaccount.com`.)
2. Em **Permissões da conta**, marque ao menos:
   - **Ver dados financeiros, pedidos e respostas de cancelamento.**
   - **Gerenciar pedidos e assinaturas.**
3. Salve/Convide.

> ⚠️ **Armadilha que já custou horas (05/set/2026).** O Play Console tem duas
> abas de permissão: **Permissões do app** e **Permissões da conta**. Marcar
> "Administrador do app" preenche a primeira e deixa a segunda **vazia** — e
> `purchases.subscriptionsv2.get` é endpoint **financeiro**, que exige
> permissão de conta. O sintoma é um **401** (não 403) e a correção é marcar
> as permissões na aba **Permissões da conta**. Detalhes na seção
> "401 da Play Developer API" mais abaixo.

📸 **Me mostre:** a conta de serviço listada com acesso concedido. **Não** me
mande o conteúdo do JSON — só me diga que baixou.

---

## Fase 3 — Notificações em tempo real (RTDN via Pub/Sub)

É o que faz renovação, cancelamento, reembolso e falha de pagamento atualizarem
o acesso **sozinhos**. É também o único caminho de revogação que não depende de
o usuário abrir o app — e é server-side puro, **não precisa de AAB novo**.

- **Projeto GCP:** `financaspro-493718`
- **Endpoint:** `https://nubvlksibmpryltkfpei.supabase.co/functions/v1/play-rtdn`
- **Código:** `supabase/functions/play-rtdn/index.ts`

A função aceita três formas de autenticação, nesta ordem de preferência:
**OIDC do Pub/Sub** (recomendado), header `x-rtdn-secret`, e `?secret=` na query
(deprecado — a URL vaza em log de proxy). Sem nenhuma configurada ela **recusa
tudo com 503**, de propósito. O roteiro abaixo usa OIDC.

### 3a. Criar o tópico Pub/Sub

Cloud Console → **Pub/Sub → Tópicos → Criar tópico**. Nome: `play-rtdn`.
Deixe "Adicionar uma assinatura padrão" **desmarcado** (criamos a push no 3c).

### 3b. Deixar o Google Play publicar no tópico

Sem isso o Play recusa salvar o tópico na Fase 3e.

Tópico → aba **Permissões** → **Adicionar principal**:

| Campo | Valor |
|---|---|
| Principal | `google-play-developer-notifications@system.gserviceaccount.com` |
| Papel | **Publicar mensagens em um tópico** (`roles/pubsub.publisher`) |

> ⚠️ **Armadilha do console em português (verificada em 05/set/2026).** A busca de
> papéis retorna **dois itens com o nome idêntico "Editor pub/sub"**. Só a
> descrição os diferencia:
>
> | Descrição no console | Papel real | Usar? |
> |---|---|---|
> | "Modificar tópicos e inscrições. Publicar e consumir mensagens." | `roles/pubsub.editor` | ❌ amplo demais |
> | "Publicar mensagens em um tópico." | `roles/pubsub.publisher` | ✅ este |
>
> Busque por `Publicador do Pub/Sub` para que os dois apareçam lado a lado e
> escolha pela descrição, nunca pelo nome.

### 3c. Conta de serviço do push + assinatura

O Pub/Sub assina cada push com um token OIDC. Precisamos de uma SA para isso —
**não reutilize a `financaspro-billing`**: aquela é a identidade que *lê* a API
do Play e tem permissão financeira; esta só assina chamadas de webhook. Papéis
separados, blast radius separado.

1. **IAM → Contas de serviço → Criar**: `play-rtdn-push`. **Sem papéis no
   projeto** — pule a etapa 2 do formulário e clique em "Criar e fechar".
2. Tópico `play-rtdn` → **Criar assinatura**:

| Campo | Valor |
|---|---|
| ID | `play-rtdn-push` |
| Tipo de entrega | **Push** |
| URL do endpoint | `https://nubvlksibmpryltkfpei.supabase.co/functions/v1/play-rtdn` |
| Ativar autenticação | ✅ |
| Conta de serviço | `play-rtdn-push@financaspro-493718.iam.gserviceaccount.com` |
| Público-alvo (audience) | deixe vazio (se preencher, replique em `PLAY_RTDN_AUDIENCE`) |
| **Desencapsulamento de payload** | ❌ **deixe DESMARCADO** |
| Prazo de confirmação | 60s (o padrão é 10s) |
| Repetição | Recuo exponencial, mín. 10s / máx. 600s |
| **Período de expiração** | ✅ **Nunca expira** |

> ⚠️ **Duas armadilhas de padrão, ambas silenciosas:**
>
> - **Expiração.** O padrão é *expirar após 31 dias de inatividade*. Num app de
>   volume baixo, um mês sem nenhuma notificação **apaga a assinatura** e o RTDN
>   para sem aviso nenhum. Marque "Nunca expira".
> - **Desencapsulamento de payload.** Se marcado, o Pub/Sub entrega só os dados
>   decodificados, e `decodeEnvelope` (que lê `body.message.data`) recebe lixo.
>   Deixe desmarcado.

> ℹ️ **Você NÃO precisa conceder "Criador de token" manualmente.** Ao criar a
> assinatura autenticada pelo console, o Google concede sozinho o papel **Agente
> de serviço do Cloud Pub/Sub** para `service-423766743990@gcp-sa-pubsub.iam.gserviceaccount.com`
> sobre a `play-rtdn-push` — é o que permite cunhar o token OIDC. Confira em
> Contas de serviço → selecione `play-rtdn-push` → **Gerenciar o acesso**.
> (Só no caminho via `gcloud` a concessão é manual.)

### 3d. Secrets no Supabase

**Dashboard → Project Settings → Edge Functions → Secrets** (não use PowerShell):

```
PLAY_RTDN_SERVICE_ACCOUNT = play-rtdn-push@financaspro-493718.iam.gserviceaccount.com
PLAY_RTDN_AUDIENCE        = (só se você definiu audience no 3c)
```

Depois **redeploy**, porque instância quente segura o env antigo:

```bash
npx supabase functions deploy play-rtdn --no-verify-jwt --project-ref nubvlksibmpryltkfpei
```

> ⚠️ `--no-verify-jwt` é obrigatório: é chamada server-to-server, sem JWT de
> usuário. A autenticação real é o OIDC validado dentro da função.

### 3e. Apontar o Play para o tópico

Play Console → app → **Monetizar → Configuração de monetização** → seção
**Notificações de desenvolvedor em tempo real**:

- Nome completo do tópico: `projects/financaspro-493718/topics/play-rtdn`
- ✅ Ativar notificações em tempo real
- Salvar → **Enviar notificação de teste**

Se o Play recusar salvar, quase sempre é o passo **3b** faltando.

### 3f. Validar

> ✅ **Executado com sucesso em 05/set/2026.** A notificação de teste do Play
> chegou e a `play-rtdn` respondeu **HTTP 200** (visível em Edge Functions →
> play-rtdn → **Invocations**). Não foi necessário redeploy da função: o secret
> novo foi lido na primeira invocação, porque não havia instância quente.

A notificação de teste vem como `testNotification`, **sem**
`subscriptionNotification` — então `handleRtdn` responde
`{handled:false, reason:"sem-subscription-notification"}` com HTTP 200. Isso é
**sucesso**: prova que autenticação, decodificação e idempotência funcionaram.

Confira em **Supabase → Edge Functions → play-rtdn → Logs**:

| O que aparece | Significado |
|---|---|
| 200 `sem-subscription-notification` | ✅ tudo certo, era a notificação de teste |
| 403 `forbidden` | OIDC não bateu: e-mail da SA errado no secret, ou audience divergente |
| 503 `nao-configurado` | nenhum secret chegou na função — faltou o redeploy do 3d |
| nada nos logs | o Play não está publicando: revise 3b e o nome do tópico em 3e |

Teste de ponta a ponta com assinatura real: cancele a assinatura de teste em
**Play Store → Pagamentos e assinaturas**, e confirme que a linha vira
`status: CANCELED`:

```sql
select status, "currentPeriodEnd", "updatedAt"
from "Subscription" where "stripeSubId" like 'play:%'
order by "updatedAt" desc limit 1;
```

## Fase 4 — Variáveis de ambiente no Railway

> 🕰️ **Legado.** O billing roda hoje em **Supabase Edge Functions** (projeto
> `nubvlksibmpryltkfpei`) e os secrets são definidos pelo **Dashboard do
> Supabase**, não pelo Railway — veja a Fase 3d e `docs/deploy-billing-edge.md`.
> A Fase 4 fica aqui só enquanto o backend Express não for aposentado de vez.
> Os **valores** continuam válidos; muda o lugar onde se coloca.


Nos **dois** serviços (web **e** worker), em **Variables**, adicione:

| Variável | Valor |
|---|---|
| `PLAY_PACKAGE_NAME` | `com.financaspro.mobile` |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | **cole o conteúdo inteiro** do `.json` da Fase 2b (uma linha só, entre aspas se o Railway pedir) |
| `PLAY_RTDN_SECRET` | um segredo forte — gere com o comando abaixo |

Gerar o segredo (rode local e copie a saída):

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

- Use **o mesmo valor** aqui e na URL do push do Pub/Sub (Fase 3a).
- 🔒 **Nunca** commite o segredo nem o JSON no Git.

Depois de salvar, o Railway redeploya sozinho.

📸 **Me mostre:** as 3 variáveis criadas (pode borrar os valores) e o deploy
concluído.

---

## Fase 5 — Testar ponta a ponta (sem gastar dinheiro real)

1. Play Console → **Configurações → Testes de licença** (*License testing*):
   adicione o **e-mail Google** que você usa no celular de teste. Testadores de
   licença **não são cobrados** de verdade.
2. Garanta que esse mesmo e-mail está na **trilha de Teste interno** do app.
3. No celular, instale a versão da trilha interna, abra o FinançasPro e faça a
   compra do **Pro**:
   - Deve aparecer o **trial de 7 dias**.
   - Após confirmar, o app chama o backend, que **verifica no Google** e libera
     o **PRO**.
4. **Teste o cancelamento:** Play Store → Assinaturas → cancelar. Em minutos o
   RTDN chega no webhook e o acesso passa a expirar no fim do período.

📸 **Me mostre:** a tela de compra com o trial, e depois os logs do Railway
(`/api/v1/play-billing/rtdn` e `/api/v1/billing/play/.../verify`). Eu confirmo se
o entitlement gravou certo.

---

## Se algo der errado (me chame com o print)

| Sintoma | Causa provável |
|---|---|
| App diz "produto não encontrado" | ID digitado diferente da tabela, ou produto ainda **inativo** / trilha não publicada |
| `verify` responde 503 `play-api-nao-configurada` | falta o secret `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` no Supabase |
| `verify` responde 402 `assinatura-nao-ativa` | o Google diz que a compra não está ativa (token de teste antigo, ou compra pendente) |
| `play-rtdn` responde 403 `forbidden` | OIDC não bateu: `PLAY_RTDN_SERVICE_ACCOUNT` diferente da SA do push, ou audience divergente (Fase 3d) |
| `play-rtdn` responde 503 `nao-configurado` | nenhum secret de auth chegou na função — faltou o redeploy depois de setar (Fase 3d) |
| Notificação de teste não chega | permissão **Pub/Sub Publisher** faltando no tópico (Fase 3b), ou nome do tópico errado no Play (Fase 3e) |
| `verify` responde 502 `google-play-api-falhou:401` | permissão da conta de serviço no Play — veja a seção dedicada abaixo |
| `verify` responde 500 `service-account-invalida` | JSON do secret corrompido — **nunca** setar via PowerShell `$(Get-Content …)`; use o Dashboard do Supabase |
| App dá "Failed to fetch" ao chamar a function | CORS: o header `apikey` precisa estar em `Access-Control-Allow-Headers` |

> **Nuance conhecida:** o plugin Android pega a **primeira oferta** do produto.
> Com o trial ativo, confirme no teste que a compra do Pro entra com os 7 dias —
> se comportar estranho, me avise que a gente refina a seleção de oferta no
> código.

---

## 401 da Play Developer API (`google-play-api-falhou:401`)

**Resolvido em 05/set/2026.** Vale a pena ler antes de sair mexendo em AAB,
chave ou código — nada disso era o problema.

### Por que o 401 engana

A `androidpublisher` devolve **401 para falha de permissão**, não 403. Isso faz
o erro parecer autenticação (chave ruim, escopo errado, JSON corrompido) quando
na verdade é **autorização**. O corpo da resposta é que diferencia — e ele já é
logado por `_shared/google-play.ts`:

```ts
console.error("Google Play Developer API falhou", res.status, detail.slice(0, 300));
```

Leia em **Supabase Dashboard → Edge Functions → play-verify → Logs**:

| Corpo do erro | Causa real |
|---|---|
| `The current user has insufficient permissions...` (`domain: androidpublisher`) | permissão da conta de serviço no Play |
| `projectNotLinked` | projeto Cloud não vinculado em Play Console → Configuração → Acesso à API |
| `Request had invalid authentication credentials` (`UNAUTHENTICATED`) | token OAuth ruim: chave revogada, SA desativada, escopo errado |
| 404 em **JSON** | o `packageName` não existe nesta conta de desenvolvedor |

> **Atalho de diagnóstico:** se as métricas da API aparecem no projeto Cloud
> (`financaspro-493718`) com erro, o OAuth funcionou e a request foi atribuída
> ao projeto certo. Isso já descarta chave, escopo e projeto errado — sobra
> permissão do lado do Play.

### A causa raiz que tivemos

A SA `financaspro-billing@financaspro-493718.iam.gserviceaccount.com` estava
**Ativa**, com **13 permissões de app** em `com.financaspro.mobile` e
**zero permissões de conta**. `subscriptionsv2.get` exige permissão financeira
de conta. Marcar Administrador nas **duas** abas resolveu em minutos.

### Ordem de investigação (do mais barato ao mais caro)

1. Ler o corpo do erro nos logs do `play-verify`. Decide tudo abaixo.
2. Rodar `scripts/play-sa-check.mjs` (ver adiante) — separa "SA sem permissão"
   de "purchaseToken com problema", coisa que o app não consegue distinguir.
3. Play Console → Usuários e permissões → a SA → aba **Permissões da conta**:
   marcar **Ver dados financeiros, pedidos e respostas da pesquisa de
   cancelamento** e **Gerenciar pedidos e assinaturas**.
4. Confirmar que o app está na **mesma conta de desenvolvedor** onde a SA foi
   convidada (multi-conta é ponto cego clássico).
5. Só então: chave nova para a mesma SA → SA nova do zero.

### O que NÃO fazer

- ❌ **Reconvidar a SA repetidamente.** Cada convite reinicia o relógio de
  propagação. Mudança de permissão é *edição*, não novo convite, e propaga em
  **minutos** — não nas 24h do convite inicial.
- ❌ **Redeploy da function** esperando que resolva. O Play checa autorização a
  cada request; o `tokenCache` de `google-play.ts` guarda só a identidade da SA.
  Redeploy só é necessário ao **trocar o secret** (instância quente segura o env
  antigo).
- ❌ **Gerar AAB novo ou comprar de novo.** O 401 é 100% server-side. Use
  **Restaurar compras** com a compra que já existe.
- ❌ **Dar papéis IAM (Owner/Editor) à SA no Cloud.** A autorização da
  `androidpublisher` é inteiramente do lado do Play; isso só polui o
  diagnóstico.

### Validar a SA fora do app

`scripts/play-sa-check.mjs` assina o JWT com `node:crypto` (mesma lógica da Edge
Function), pega o access token e faz probes independentes. Imprime **só**
`client_email`, status HTTP e `reason` — nunca a chave, nunca o purchaseToken,
então a saída é segura para colar em chat ou issue.

```powershell
cd C:\Users\renat\Downloads\financaspro

# localizar a chave
Get-ChildItem C:\Users\renat\Downloads -Filter *.json |
  Where-Object { (Get-Content $_.FullName -Raw -ErrorAction SilentlyContinue) -match '"type"\s*:\s*"service_account"' } |
  Select-Object FullName

node scripts/play-sa-check.mjs --key "C:\caminho\da\chave.json"
node scripts/play-sa-check.mjs --key "C:\caminho\da\chave.json" --token <purchaseToken>
```

Leitura:

| Saída | Significado |
|---|---|
| `[OAuth] 200 OK` | JSON, `private_key`, assinatura RS256 e escopo estão corretos |
| `A1 = 200` | a SA enxerga o app — permissão OK |
| `A1 = 401` | permissão ainda faltando ou propagando |
| `A2 = 403 "Please migrate to the new publishing API"` | **esperado e inofensivo** — `inappproducts` é o endpoint legado, o código não usa |
| `B = 200` | a assinatura está ativa e legível; o Pro vai gravar |

⚠️ O path correto do probe A é `/applications/{pkg}/subscriptions` — **sem**
`monetization` no meio. Com o path errado a Google devolve um **404 em HTML**
(página de erro), que não diz nada sobre permissão.

---

## Revogação de entitlement — como o Pro é retirado

**Contexto (05/set/2026).** Ao ligar o Play Billing descobrimos que
`revokePlayEntitlement` só era alcançável por `handleRtdn` ← `play-rtdn` ←
Pub/Sub. Com o Pub/Sub não configurado, **nenhum caminho revogava**: quem
cancelasse, pedisse reembolso ou tivesse o cartão recusado ficava com
`status: ACTIVE` no banco e Pro para sempre. O `_activeStatus`
(`js/billing.js`) libera o tier só com `status === 'ACTIVE'`, sem olhar
`currentPeriodEnd`, então a data vencida não segurava nada.

Três caminhos hoje, em ordem de confiabilidade:

| Caminho | Quando roda | Cobre |
|---|---|---|
| **RTDN** (Pub/Sub → `play-rtdn`) | push do Google, em segundos | tudo: cancelamento, reembolso, hold, renovação |
| **Reconciliação ao abrir Config** (`INIT_BILLING._reconciliarPlay`) | quando o usuário abre a aba Config, no máx. 1×/6h | tudo, mas depende de o usuário ir até lá |
| **Botão "Restaurar compras"** | clique manual | tudo, mas ninguém clica sem motivo |

Os dois últimos passam pelo `play-verify`, que desde 05/set **revoga** quando o
Google responde `!entitled`, em vez de só lançar 402 — a revogação é feita
apenas se o `purchaseToken` pertencer àquela org (`findByPlayPurchaseToken`).

> RTDN continua sendo o caminho certo: é o único que não depende de o usuário
> abrir o app, e é **server-side puro** — não exige AAB novo. A reconciliação
> no boot é rede de segurança, não substituto.

### Onde mexer

- Revogação no 402: `supabase/functions/_shared/play-billing.ts` → `verifyPurchase`
- Reconciliação: `js/modules/init-billing.js` → `_reconciliarPlay`
  (throttle de 6h em `localStorage['fp-play-reconcilia']`, silenciosa por design)
- Revogação em si: `supabase/functions/_shared/db.ts` → `revokePlayEntitlement`
  (filtra `stripeSubId LIKE 'play:%'`, nunca toca numa assinatura Stripe)

### Deploy

> ⚠️ **Use `npx`.** O CLI do Supabase é uma **devDependency do projeto**
> (`supabase ^2.116.0` no `package.json`), não um programa global — `supabase`
> solto no PowerShell devolve *"não é reconhecido como nome de cmdlet"*. Rode
> sempre a partir da raiz do repositório. Se pedir login: `npx supabase login`.
> O aviso `WARNING: Docker is not running` é inofensivo — Docker só é necessário
> para rodar functions localmente, não para publicar.

```bash
# Patch de backend — vale para todos os usuários na hora
npx supabase functions deploy play-verify --project-ref nubvlksibmpryltkfpei
supabase functions deploy play-rtdn  --no-verify-jwt --project-ref nubvlksibmpryltkfpei
```

⚠️ A reconciliação é **código do app**: só chega ao usuário num AAB novo.

> ⚠️ **Ela NÃO roda no boot** (verificado no AAB 11.3.14-vc37, 05/set/2026).
> `scripts/bundle-app.cjs` põe `init-billing.js`, `billing.js` e
> `play-billing.js` no chunk **lazy `conta`**, carregado por
> `mudarAba('config')`. Logo, no app empacotado o `INIT_BILLING.init()` — e com
> ele o `_reconciliarPlay` — só executa quando o usuário abre a aba **Config**.
> Em dev, com os scripts soltos no `index.html`, roda no boot e a diferença não
> aparece: é uma divergência dev/produção fácil de não perceber.
>
> Consequência: trate-a como rede **terciária**, atrás do RTDN e da revogação
> no 402. Para aproximá-la do boot seria preciso disparar `LAZY.load('conta')`
> alguns segundos após a inicialização, ou extrair esse caminho para um módulo
> que carregue cedo.

---

## Referências

- Setup de infra (Railway/Neon/Upstash): `docs/deploy-railway-neon-upstash.md`
- Build do AAB: `docs/build-aab-runbook.md`
- Código (Express, legado): `backend/routes/play-billing.js`,
  `backend/domain/services/play-billing.service.js`, `backend/lib/google-play-api.js`,
  webhook em `backend/app.js`.
- Código (Supabase Edge Functions, **atual**): `supabase/functions/play-verify/index.ts`,
  `supabase/functions/play-rtdn/index.ts`, `supabase/functions/_shared/google-play.ts`,
  `supabase/functions/_shared/play-billing.ts`, `supabase/functions/_shared/db.ts`.
- Deploy das functions: `docs/deploy-billing-edge.md`
- Diagnóstico da conta de serviço: `scripts/play-sa-check.mjs`

> ℹ️ As Fases 4 e 5 acima ainda descrevem o Railway. O billing roda hoje em
> **Supabase Edge Functions** (projeto `nubvlksibmpryltkfpei`), com os secrets
> `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` e `PLAY_PACKAGE_NAME` definidos pelo
> **Dashboard** do Supabase.
