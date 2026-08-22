# Data safety + Conteúdo do app — folha de respostas (Play Console)

> Preencha em **Painel → Política → Segurança dos dados** e **Conteúdo do app**.
> As respostas abaixo assumem o **piloto em MODO LOCAL** (sem backend), que foi
> configurado no app: nesse modo o app **não envia dados para servidores**.
>
> **Atualizado em 22/08/2026.** Até então o modo local era só o comportamento do
> `DADOS._apiBaseUrl()`: a interface continuava oferecendo login, assinatura,
> Open Finance e verificação em duas etapas, o que contradizia a resposta "não
> coleta dados" abaixo. Agora essas superfícies têm `data-requer-nuvem` e somem
> quando não há backend configurado (`INIT_CONFIG.aplicarVisibilidadeNuvem`).
> As respostas do cenário PILOTO passaram a descrever o app de verdade.
>
> **Se você configurar `CONFIG.API_BASE_URL`**, tudo isso reaparece — e aí vale
> o cenário CLOUD, não o piloto. Não existe um segundo interruptor: a nuvem
> aparece exatamente quando há uma API para falar.

## A) Segurança dos dados (Data safety)

### Cenário do PILOTO (modo local — recomendado para amanhã)
- **O app coleta ou compartilha dados do usuário?** → **NÃO**
  - Justificativa: no modo local, os dados financeiros ficam apenas no dispositivo
    (localStorage). O app não transmite dados a servidores, não usa analytics de
    terceiros e não conecta banco (Open Finance desativado no piloto local).
- **O app criptografa dados em trânsito?** → não se aplica (sem tráfego de dados do usuário).
- **O usuário pode pedir exclusão dos dados?** → SIM (Perfil → Zona de perigo →
  Apagar todos os dados; ou desinstalar).
- **URL de exclusão de conta** → no modo local **não se aplica** (não há conta).
  No cenário CLOUD, informe:
  `https://SEU-DOMINIO/privacidade.html#exclusao-de-conta`

> Importante: se você habilitar login na nuvem, Open Finance (Belvo) ou o envio de
> diagnósticos, precisará **atualizar** o Data safety para o cenário abaixo.

### Cenário CLOUD (quando ligar backend/login) — para referência futura
- Coleta: **Informações financeiras** (transações, orçamento) e **Informações pessoais** (nome, e-mail).
- Finalidade: funcionalidade do app e sincronização de conta.
- Criptografado em trânsito: **SIM** (HTTPS).
- Compartilhado com terceiros: Belvo (Open Finance) e Stripe (pagamentos), conforme o uso.
- Exclusão: **dentro do app** em Perfil → Zona de perigo → Excluir minha conta
  (chama `DELETE /api/v1/users/me`), e **pela web** em
  `https://SEU-DOMINIO/privacidade.html#exclusao-de-conta`. O Google exige os
  dois caminhos para apps que permitem criar conta — informe a URL no Play
  Console, em Política → Segurança dos dados.

## B) Classificação etária (IARC)
- Responda o questionário. App de finanças pessoais, sem conteúdo sensível →
  classificação esperada **Livre**. Sem violência, sexo, drogas, jogos de azar.

## C) Público-alvo e conteúdo
- **Faixa etária alvo**: **18 anos ou mais** (evita a política de Famílias, comum em finanças).
- **O app é direcionado a crianças?** → NÃO.

## D) Anúncios
- **O app contém anúncios?** → **NÃO**.

## D2) Compras no app
- **O app oferece compras no app?** → no piloto local, **NÃO**: o cartão de plano
  e o paywall não aparecem sem backend configurado.
- **Antes de ligar a nuvem no build Android, leia isto.** A política de pagamentos
  do Google exige o Google Play Billing para assinaturas e serviços em nuvem
  consumidos dentro do app, e proíbe direcionar o usuário a outro meio de
  pagamento. O fluxo atual leva ao Stripe Checkout, que se encaixa no que é
  proibido. A abertura de 30/06/2026 para link externo vale para **EUA, Reino
  Unido e Espaço Econômico Europeu** — o Brasil ficou de fora. As saídas são:
  manter o app gratuito na loja e cobrar só no site, integrar o Play Billing no
  Android, ou publicar apenas como PWA. Confirme a política vigente na data da
  submissão: essa área mudou duas vezes em 2026.

## E) Recursos financeiros (declaração)
- Tipo: **gerenciador/orçamento de finanças pessoais**.
- Empréstimos pessoais? NÃO. Pagamentos/transferências? NÃO. Cripto? NÃO.
- Se conectar contas bancárias via Open Finance no futuro: marque **agregação de
  informações financeiras** e mantenha o Data safety atualizado.

## F) Política de privacidade
- URL pública obrigatória → hospede o `privacidade.html` (já reescrito e self-contained)
  e cole o link aqui e na ficha.

## G) App content — outros
- **Isenção de responsabilidade de governo/COVID etc.**: não se aplica.
- **Permissões**: o app pede apenas `INTERNET`. Nenhuma permissão sensível a justificar.
