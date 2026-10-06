# Data safety + Conteúdo do app — folha de respostas (Play Console)

> Preencha em **Painel → Política → Segurança dos dados** e **Conteúdo do app**.
>
> **Build de beta na Play Store (padrão atual, 9 set 2026):** o APK/AAB
> `11.3.x` é **CLOUD** — login Supabase + sync + Google Play Billing. Use a
> seção **A.1 Cenário CLOUD / Play beta** abaixo. Não marque “não coleta dados”.
>
> O cenário **PILOTO local** (A.2) vale só se você gerar um AAB com
> `android:bundle:local` / `fp-force-local` e **sem** login na loja. Esse não é
> o binário que está indo para a faixa de testes agora.

## A) Segurança dos dados (Data safety)

### A.1 Cenário CLOUD / Play beta (use este)

- **O app coleta ou compartilha dados do usuário?** → **SIM**
  - **Informações pessoais:** nome, e-mail (conta Supabase Auth).
  - **Informações financeiras:** lançamentos, orçamentos, metas, contas que o
    usuário registra; sincronizados com a nuvem quando há login.
  - **Informações e desempenho do app → Registros de falhas / Diagnóstico:**
    relatórios de erro (mensagem técnica mascarada, versão, tela, user-agent)
    enviados à Edge Function `obs-ingest` — ligados por padrão, o usuário
    desliga em Perfil. Finalidade: **análise / estabilidade**. Não vinculados à
    conta (sem user id). Retenção 30 dias. Marque como **coletado**, não
    compartilhado.
  - **Informações e desempenho do app → Outros dados de desempenho do app:**
    contagem de uso anônima (etapa 4 do roadmap) — 1 aviso por dia por
    aparelho, só com a versão do app, pela mesma `obs-ingest` e sob o mesmo
    opt-out dos relatórios de erro. O servidor guarda só um contador por dia e
    versão (`fp_app_sessao_dia`), sem IP, user-agent ou id; retenção 30 dias.
    Finalidade: **análise** (erros por sessão de cada versão). Não vinculado à
    conta. Marque como **coletado**, não compartilhado.
  - **Informações financeiras → Histórico de compras:** tokens de compra do
    Google Play e status da assinatura Pro, enviados à Edge Function
    `play-verify` para validar o entitlement. Finalidade: **funcionalidade do
    app**. **Não** recebemos nem enviamos número de cartão.
- **Finalidade:** funcionalidade do app, sincronização entre aparelhos,
  autenticação, processamento de assinatura.
- **O app criptografa dados em trânsito?** → **SIM** (HTTPS / TLS).
- **Dados criptografados em repouso no dispositivo?** → parcial: cifragem AES
  local é **opcional** (Perfil); PIN **não** cifra o armazenamento. Seja
  honesto no questionário: “dados podem ficar em texto no aparelho”.
- **Compartilhado com terceiros?** → **NÃO**, em todas as categorias.
  Pela regra da Play, dados enviados a um **prestador de serviço** que os trata
  em nome do desenvolvedor, conforme suas instruções, **não contam como
  compartilhamento**. É o caso de todos os fornecedores do app:
  - **Supabase** (Auth + banco + sync + Edge Functions)
  - **Google Play** (Billing / assinaturas no Android)
  - **Stripe** (assinaturas em builds web / fora do fluxo Play)
  - **Resend** (e-mails de assinatura e convites)
  - Open Finance / Belvo: **desligado** nesta versão — não marque até liberar.
  Os fornecedores continuam listados na política de privacidade (seção 5).
  Marcar "compartilhado" não é infração, mas aparece na ficha como se os dados
  fossem a terceiros para fins próprios, o que não é verdade.
- **O usuário pode pedir exclusão dos dados?** → **SIM**
  - No app: Perfil → Zona de perigo → Excluir conta
  - Na web (obrigatório Play):  
    `https://app.financaspro.com/privacidade.html#exclusao-de-conta`  
    (a seção 10 de `privacidade.html` também aceita pedido por e-mail e avisa
    que excluir a conta não cancela a assinatura na loja)
- **Sessão:** o app guarda tokens de sessão (incl. refresh) em `localStorage`
  no WebView — declare armazenamento no dispositivo / identificadores de conta
  conforme o formulário atual do Console.

### A.2 Cenário PILOTO (modo local — só se o AAB for local-only)

- **O app coleta ou compartilha dados do usuário?** → **NÃO**
  - Justificativa: dados só no aparelho (`localStorage`); sem sync; superfícies
    de nuvem ocultas (`data-requer-nuvem`).
- **Criptografa em trânsito?** → não se aplica.
- **Exclusão:** Perfil → Apagar dados / desinstalar. Sem conta na nuvem.
- **Compras no app?** → **NÃO** (paywall some sem backend).

> Se misturar AAB cloud com respostas de A.2, a Play pode rejeitar ou o usuário
> pode denunciar inconsistência. Prefira A.1 para a faixa beta atual.

## B) Classificação etária (IARC)
- App de finanças pessoais, sem conteúdo sensível → classificação esperada
  **Livre**. Sem violência, sexo, drogas, jogos de azar.

## C) Público-alvo e conteúdo
- **Faixa etária alvo**: **18 anos ou mais**.
- **O app é direcionado a crianças?** → NÃO.

## D) Anúncios
- **O app contém anúncios?** → **NÃO**.

## D2) Compras no app (Play beta cloud)
- **O app oferece compras no app?** → **SIM** (assinatura Pro via
  **Google Play Billing**).
- Não direcione o usuário a Stripe Checkout **dentro** do APK da Play Store no
  Brasil (política de pagamentos). Cobrança web/Stripe fica fora desse binário
  ou só no site.

## E) Recursos financeiros (declaração)
- Tipo: **gerenciador/orçamento de finanças pessoais**.
- Empréstimos? NÃO. Pagamentos/transferências? NÃO. Cripto? NÃO.
- Open Finance: **ainda não** — não marque agregação bancária até liberar.

## F) Política de privacidade
- URL pública obrigatória → hospede `privacidade.html` e cole o link no Console
  e na ficha. Deve bater com A.1 (Supabase + Play Billing + exclusão web).

## G) App content — outros
- **Permissões:** `INTERNET` (+ o que o Capacitor/Play Billing declarar no
  manifesto). Nenhuma permissão de contato/SMS/localização para o produto atual.
