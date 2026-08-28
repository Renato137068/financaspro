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
| `financaspro.pro.monthly` | R$ 16,90 | mensal |
| `financaspro.pro.yearly` | R$ 129,00 | anual |
| `financaspro.business.monthly` | R$ 79,90 | mensal |
| `financaspro.business.yearly` | R$ 799,00 | anual |

- **Trial de 7 dias** só nos dois produtos **Pro**.
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

## Fase 1 — Criar os 4 produtos de assinatura

Play Console → seu app → menu lateral **Monetizar → Produtos → Assinaturas**.

Para **cada** um dos 4 produtos:

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

Repita até os 4 existirem, cada um com **um** plano base.

> **Por que 4 produtos separados** (e não 2 com dois planos cada): o código
> mapeia o tier pelo *product ID* inteiro (`...pro.monthly`, `...pro.yearly`).
> Manter 4 IDs deixa o backend simples e correto.

### Trial de 7 dias (só nos dois Pro)

Ainda dentro de `financaspro.pro.monthly` e `financaspro.pro.yearly`:

1. Aba **Ofertas** → **Criar oferta** no plano base.
2. Tipo de oferta: **Teste gratuito (free trial)**.
3. Duração: **7 dias**.
4. Elegibilidade: **novos assinantes** (padrão).
5. Ative a oferta.

📸 **Me mostre:** a lista das 4 assinaturas com status **Ativo**, e as ofertas de
trial nos dois Pro.

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

📸 **Me mostre:** a conta de serviço listada com acesso concedido. **Não** me
mande o conteúdo do JSON — só me diga que baixou.

---

## Fase 3 — Notificações em tempo real (RTDN via Pub/Sub)

Isso faz renovação / cancelamento / reembolso atualizarem o acesso sozinhos.

### 3a. Criar o tópico Pub/Sub

1. Google Cloud Console (mesmo projeto) → **Pub/Sub → Tópicos → Criar tópico**.
   - Nome: ex.: `play-rtdn`.
2. Abra o tópico → **Criar assinatura (subscription)**:
   - Tipo de entrega: **Push**.
   - **URL do endpoint:**
     ```
     https://SUA-API/api/v1/play-billing/rtdn?secret=SEU_SEGREDO
     ```
     Troque `SUA-API` pela URL real do Railway e `SEU_SEGREDO` pelo valor da
     Fase 4 (o `PLAY_RTDN_SECRET`).
3. **Permissão:** o Google Play precisa poder publicar no tópico. Ainda no
   tópico → aba **Permissões** → **Adicionar principal**:
   - Principal: `google-play-developer-notifications@system.gserviceaccount.com`
   - Papel: **Pub/Sub Publisher** (Editor do Pub/Sub).

### 3b. Apontar o Play para o tópico

1. Play Console → seu app → **Monetizar → Configuração de monetização**
   (*Monetization setup*).
2. Seção **Notificações de desenvolvedor em tempo real**:
   - Cole o **nome completo do tópico**:
     `projects/SEU-PROJETO/topics/play-rtdn`.
   - Salve. Use **Enviar notificação de teste** se aparecer o botão.

📸 **Me mostre:** o resultado da notificação de teste (e, se puder, os logs do
Railway nesse momento — deve chegar um POST em `/api/v1/play-billing/rtdn`).

---

## Fase 4 — Variáveis de ambiente no Railway

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
| `verify` responde 503 `play-api-nao-configurada` | falta `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` no Railway |
| `verify` responde 402 `assinatura-nao-ativa` | o Google diz que a compra não está ativa (token de teste antigo, ou compra pendente) |
| Webhook RTDN responde 403 | `?secret=` do Pub/Sub diferente do `PLAY_RTDN_SECRET` do Railway |
| Notificação de teste não chega | permissão **Pub/Sub Publisher** faltando no tópico, ou nome do tópico errado no Play |

> **Nuance conhecida:** o plugin Android pega a **primeira oferta** do produto.
> Com o trial ativo, confirme no teste que a compra do Pro entra com os 7 dias —
> se comportar estranho, me avise que a gente refina a seleção de oferta no
> código.

---

## Referências

- Setup de infra (Railway/Neon/Upstash): `docs/deploy-railway-neon-upstash.md`
- Build do AAB: `docs/build-aab-runbook.md`
- Código: `backend/routes/play-billing.js`, `backend/domain/services/play-billing.service.js`,
  `backend/lib/google-play-api.js`, webhook em `backend/app.js`.
