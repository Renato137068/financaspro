# Data safety + Conteúdo do app — folha de respostas (Play Console)

> Preencha em **Painel → Política → Segurança dos dados** e **Conteúdo do app**.
> As respostas abaixo assumem o **piloto em MODO LOCAL** (sem backend), que foi
> configurado no app: nesse modo o app **não envia dados para servidores**.

## A) Segurança dos dados (Data safety)

### Cenário do PILOTO (modo local — recomendado para amanhã)
- **O app coleta ou compartilha dados do usuário?** → **NÃO**
  - Justificativa: no modo local, os dados financeiros ficam apenas no dispositivo
    (localStorage). O app não transmite dados a servidores, não usa analytics de
    terceiros e não conecta banco (Open Finance desativado no piloto local).
- **O app criptografa dados em trânsito?** → não se aplica (sem tráfego de dados do usuário).
- **O usuário pode pedir exclusão dos dados?** → SIM (Perfil → Dados → apagar; ou desinstalar).

> Importante: se você habilitar login na nuvem, Open Finance (Belvo) ou o envio de
> diagnósticos, precisará **atualizar** o Data safety para o cenário abaixo.

### Cenário CLOUD (quando ligar backend/login) — para referência futura
- Coleta: **Informações financeiras** (transações, orçamento) e **Informações pessoais** (nome, e-mail).
- Finalidade: funcionalidade do app e sincronização de conta.
- Criptografado em trânsito: **SIM** (HTTPS).
- Compartilhado com terceiros: Belvo (Open Finance) e Stripe (pagamentos), conforme o uso.
- Exclusão: o usuário pode solicitar exclusão da conta e dos dados.

## B) Classificação etária (IARC)
- Responda o questionário. App de finanças pessoais, sem conteúdo sensível →
  classificação esperada **Livre**. Sem violência, sexo, drogas, jogos de azar.

## C) Público-alvo e conteúdo
- **Faixa etária alvo**: **18 anos ou mais** (evita a política de Famílias, comum em finanças).
- **O app é direcionado a crianças?** → NÃO.

## D) Anúncios
- **O app contém anúncios?** → **NÃO**.

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
