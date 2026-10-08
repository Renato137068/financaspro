# Roteiro: aplicar a ficha nova no Play Console com o Claude no Chrome

Para colar na extensão do Claude no Chrome, com o Play Console aberto e logado
na conta de desenvolvedor. A extensão preenche os textos e responde às
avaliações; **as imagens você envia à mão** (a janela de escolher arquivo é do
sistema, e a extensão não a controla) e **o envio para revisão você confirma**.

Origem de tudo: auditoria de ASO de 04/out
(`docs/auditorias/auditoria-play-store-aso-2026-10-04.html`) e a ficha em
`docs/play-store-ficha.md`.

## Antes: baixar as imagens

Pasta `docs/play-store/vitrine/` no GitHub:
https://github.com/Renato137068/financaspro/tree/main/docs/play-store/vitrine

Baixe os nove arquivos (abra cada um e use "Download raw file"):
`01-resumo.png` … `08-privacidade.png` e `destaque-1024x500.png`; da
subpasta `tablet/`, as oito capturas de tablet de 7"; e da `tablet-10/`, as
oito de tablet de 10".

## Prompt para colar na extensão

```
Você vai me ajudar a atualizar a página do meu app na Play Store pelo Play
Console, que está aberto nesta aba. App: FinançasPro (com.financaspro.mobile).
Regras: não clique em "Enviar para revisão", "Publicar" nem em nada que
publique mudanças sem me perguntar antes; não apague nada; se algum campo ou
botão não estiver onde eu disse, pare e me descreva o que está vendo.

PARTE 1 — Textos da página
1. Vá em Crescimento (ou "Aumentar usuários") → Presença na loja → Página
   principal da loja → idioma Português (Brasil).
2. Substitua os campos exatamente pelos textos abaixo:

Nome do app:
FinançasPro Controle de Gastos

Descrição curta:
Controle de gastos, orçamento e metas. Funciona offline, direto no celular.

Descrição completa:
O FinançasPro é um app de controle de gastos e finanças pessoais para quem quer saber quanto sobra no fim do mês. Registre receitas e despesas em segundos, monte o orçamento do mês e acompanhe suas metas, tudo sem anúncios.

Crie sua conta grátis e comece. Seus lançamentos ficam guardados no celular e funcionam sem internet, com cópia na nuvem para você não perder nada se trocar de aparelho.

CONTROLE DE GASTOS SIMPLES
• Lançamentos ilimitados, também no plano gratuito
• Categorias prontas e personalizadas para os seus gastos
• Extrato completo com busca e filtros por mês, categoria e conta
• Gastos fixos e contas a pagar com lembrete

ORÇAMENTO MENSAL E REGRA 50/30/20
• Orçamento por categoria, com alerta quando o limite está perto
• Regra 50/30/20 pronta: necessidades, desejos e poupança
• Resumo do mês com receitas, despesas e saldo

CARTÃO DE CRÉDITO SEM SUSTO
• Fatura do cartão mês a mês, com as compras parceladas
• Até 5 contas e cartões no plano gratuito

METAS E RELATÓRIOS
• Meta financeira com progresso e ritmo (metas ilimitadas no Pro)
• Gráficos e relatórios dos últimos 3 meses
• Exportação em CSV e backup dos seus dados

PRIVACIDADE EM PRIMEIRO LUGAR
• Seus lançamentos ficam no aparelho e funcionam offline
• Sem anúncios e sem venda de dados
• PIN e biometria para abrir o app
• Exclusão da conta e dos dados quando você quiser

FINANÇASPRO PRO
Para quem quer ir além do controle financeiro do dia a dia:
• Todo o seu histórico nos gráficos e relatórios
• Previsão do saldo no fim do mês
• Encontra assinaturas esquecidas que você ainda paga
• Categoriza sozinho, aprendendo com você
• Alertas que avisam antes de estourar o orçamento
• Metas, recorrentes e contas a pagar sem limite
• Modo casal: duas pessoas, uma vida financeira
• Relatório em PDF pronto para apresentar

O Pro tem 7 dias de teste pela Google Play. Ao criar uma conta, você ganha 14 dias de Pro sem cadastrar cartão.

PERGUNTAS FREQUENTES

Preciso pagar para usar?
Não. O plano gratuito não tem prazo nem anúncios, e os lançamentos são ilimitados. O Pro é opcional.

Funciona sem internet?
Sim. Depois de entrar na sua conta uma vez, você registra e consulta tudo offline. O app sincroniza quando a internet volta.

Vocês vendem meus dados?
Não. O app não tem anúncios e não vende dados. Você pode excluir a conta e todos os dados quando quiser, pelo próprio app.

PARA QUEM É
Para quem quer organizar as finanças, sair do vermelho, economizar dinheiro todo mês ou trocar a planilha de gastos por um app de finanças fácil de usar.

Dúvidas ou sugestões? Escreva para o e-mail de contato desta página. Lemos todas as mensagens.

3. Clique em "Salvar" (só salvar, não enviar para revisão) e me diga se
   apareceu algum aviso ou erro de política.

PARTE 2 — Imagens (eu envio, você me guia)
4. Na mesma página, em "Recursos gráficos":
   - me avise quando chegar no "Recurso gráfico" (1024 x 500) para eu
     substituir pelo arquivo destaque-1024x500.png;
   - em "Capturas de tela do telefone", me diga quantas existem hoje. Eu vou
     remover as antigas e enviar 01 a 08 nesta ordem. Confira depois que a
     ordem ficou 01-resumo, 02-lancamento, 03-orcamento, 04-cartao,
     05-extrato, 06-metas, 07-previsao, 08-privacidade, e que nenhuma
     captura em branco ficou na lista.
   - em "Capturas de tela de tablet de 7 polegadas", a mesma coisa com os
     arquivos da pasta tablet/ (01 a 08, na mesma ordem);
   - em "Capturas de tela de tablet de 10 polegadas", a mesma coisa com os
     arquivos da pasta tablet-10/ (01 a 08, na mesma ordem).
5. Salve de novo.

PARTE 3 — Avaliações
6. Vá em Qualidade → Avaliações (Ratings and reviews) → Avaliações.
   Para cada avaliação que ainda não tem resposta, escreva uma resposta curta,
   em português, agradecendo pelo nome que aparece (se houver), citando algo
   que a pessoa escreveu e convidando a mandar sugestões pelo e-mail de
   contato da página. Exemplo de tom:
   "Oi, Ana! Obrigado pelas 5 estrelas e por contar que o orçamento 50/30/20
   te ajudou. Se tiver sugestão do que podemos melhorar, escreva para o
   e-mail de contato da página. Lemos todas!"
   Antes de publicar cada resposta, mostre-me o texto e espere meu "ok".
   Nunca ofereça brinde, desconto ou vantagem em troca de avaliação.

PARTE 4 — Conferências (só ler e me relatar)
7. Em Políticas e programas → Conteúdo do app: confira se a "Política de
   privacidade" aponta para https://app.financaspro.com/privacidade.html e
   se a página abre.
8. Em Visão geral da publicação: me diga se há mudanças pendentes de envio
   e o que está listado. Não envie.
```

## Alternativa: enviar pelo GitHub

Textos, capturas de celular e de tablet (7" e 10") e o destaque também podem
ir sem abrir o Play Console, pelo
workflow **Ficha da Play** (`.github/workflows/play-ficha.yml`, script
`scripts/play-ficha.cjs`). Ele lê os textos de `docs/play-store-ficha.md` e as
imagens de `docs/play-store/vitrine/`, e fala com a API da Play usando o
segredo `PLAY_SERVICE_ACCOUNT_JSON` do ambiente `production`.

Uma vez só, com login (o Claude não faz estes passos nem vê a chave):
1. Google Cloud → IAM → Contas de serviço: crie uma conta (ou reuse a da
   validação de compras, `docs/play-store-billing-runbook.md`) e gere uma
   chave JSON. Ative a "Google Play Android Developer API" no projeto.
2. Play Console → Usuários e permissões → Convidar novo usuário: o e-mail da
   conta de serviço, com acesso ao FinançasPro e as permissões "Gerenciar a
   presença na loja" e, para o release, "Lançar apps em faixas de teste".
3. GitHub → Settings → Environments → production → segredo
   `PLAY_SERVICE_ACCOUNT_JSON` com o conteúdo do JSON.

Para usar: Actions → Ficha da Play → Run workflow. Desmarcado, "publicar"
só valida (a Play confere e nada muda na loja). Marcado, a ficha vai para a
revisão. `npm run check:ficha` faz a conferência local, sem rede.

Fica de fora, ainda à mão: respostas a avaliações e as conferências da
Parte 4. As novidades da
versão vão com o AAB, pelo `release.yml` (`distribution/whatsnew/`).

## Depois

- **Envio:** quando a extensão relatar as mudanças pendentes, envie você mesmo
  em *Visão geral da publicação → Enviar alterações para revisão*. A revisão
  de ficha costuma levar de algumas horas a poucos dias.
- **Avaliações dentro do app:** chegam com o próximo AAB publicado (o plugin
  nativo `FpInAppReview` entrou neste PR). Antes, nada aparece; não é erro.
- **Medir:** depois de 30 dias, *Estatísticas → Aquisição de usuários → Termos
  de busca* mostra por quais buscas as pessoas chegaram. Compare com a tabela
  de palavras-chave da auditoria.
- **Etapa 2 da auditoria:** experimento da ficha (teste A/B) com as duas
  descrições curtas alternativas de `docs/play-store-ficha.md`.
