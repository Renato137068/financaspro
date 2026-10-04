# Conteúdo promocional na Play: calendário e textos

Etapa 3 da auditoria de ASO de 04/out
(`docs/auditorias/auditoria-play-store-aso-2026-10-04.html`): o Play Console
deixa publicar **conteúdo promocional** (cards de eventos e novidades que
aparecem na própria loja, na busca e na página do app). Usado nas datas em
que mais gente procura controle financeiro, é visibilidade sem anúncio pago.

Onde: *Play Console → Crescimento → Conteúdo promocional → Criar*. O conteúdo
passa por revisão: envie com antecedência. Confira no Console os limites de
caracteres do ano (os textos abaixo são curtos de propósito).

Imagens 1920×1080 prontas em `docs/play-store/vitrine/promocional/`, geradas
por `npm run vitrine:gerar` a partir das telas reais.

Regras que valem aqui também: nada de "grátis por tempo limitado", "baixe
agora" ou promessa que o app não cumpre; o app não lê conta bancária e pede
uma conta (grátis) para usar.

## Calendário

| Quando publicar | Evento | Imagem |
|---|---|---|
| 1º a 30 de novembro (1ª parcela do 13º) e 1º a 20 de dezembro (2ª) | 13º salário | `promo-13-salario-1920x1080.png` |
| Semana antes da Black Friday até o dia seguinte (fim de novembro) | Black Friday | `promo-black-friday-1920x1080.png` |
| 26 de dezembro a 31 de janeiro | Ano novo | `promo-ano-novo-1920x1080.png` |
| Período de entrega da declaração do IR (confira as datas da Receita no ano; costuma ser de março a maio) | Imposto de renda | `promo-imposto-de-renda-1920x1080.png` |

## Textos

### 13º salário
- **Tipo:** evento de duração limitada (ou "oferta", se houver desconto real no Pro).
- **Nome:** Seu 13º com destino certo
- **Descrição curta:** Separe uma parte do 13º para as suas metas antes de gastar.
- **Descrição:** O 13º chega e some em poucos dias? No FinançasPro você cria uma
  meta (reserva de emergência, viagem, quitar o cartão), registra o aporte e
  acompanha quanto falta e quando você chega lá.

### Black Friday
- **Tipo:** evento de duração limitada.
- **Nome:** Antes de comprar, veja a fatura
- **Descrição curta:** Saiba quanto do cartão já está comprometido antes das compras.
- **Descrição:** Parcelas de compras antigas continuam na fatura dos próximos
  meses. No FinançasPro você vê a fatura mês a mês, com as parcelas, e quanto do
  limite já está comprometido, antes de decidir a próxima compra.

### Ano novo
- **Tipo:** evento de duração limitada.
- **Nome:** Ano novo, orçamento novo
- **Descrição curta:** Comece o ano com a regra 50/30/20 pronta no celular.
- **Descrição:** Organizar as finanças está na sua lista? O FinançasPro já vem com
  a regra 50/30/20: você anota os gastos e o app mostra quanto foi para
  necessidades, desejos e poupança, com aviso quando uma categoria chega perto
  do limite.

### Imposto de renda
- **Tipo:** evento de duração limitada.
- **Nome:** O ano inteiro anotado
- **Descrição curta:** Encontre qualquer gasto do ano e exporte em CSV.
- **Descrição:** Na hora da declaração, ajuda ter tudo registrado. No
  FinançasPro você busca e filtra os lançamentos por mês, categoria e conta e
  exporta em CSV para a planilha (o app não faz a declaração nem envia nada à
  Receita).

## Depois

Compare, no Console, a taxa de conversão e as instalações das semanas com
evento contra as semanas sem. O que não trouxer resultado sai do calendário do
ano seguinte.
