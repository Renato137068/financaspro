# Ficha da Play Store — FinançasPro (pronto para copiar)

Fonte da ficha publicada. Textos revistos na auditoria de ASO de 04/out
(`docs/auditorias/auditoria-play-store-aso-2026-10-04.html`): título e
descrições com os termos que as pessoas buscam, sem preços e sem termos
técnicos. Onde colar: *Play Console → Crescimento → Presença na loja →
Página principal da loja*.

## Identidade
- **Nome do app** (máx. 30 caracteres): `FinançasPro Controle de Gastos` (30)
  - Alternativas: `FinançasPro: Gastos e Metas` (27) · `FinançasPro: Finanças Pessoais` (30)
  - Proibido pela política de metadados no título, no ícone e no nome do
    desenvolvedor: "grátis", "sem anúncios", "melhor", "#1", emojis.
- **Categoria**: Finanças
- **Tags**: finanças pessoais, controle de gastos, orçamento, metas
- **E-mail de contato**: (o e-mail do desenvolvedor — o mesmo da política de privacidade)
- **Site**: `https://app.financaspro.com/sobre.html` (página do app, em `site/`; no ar depois da hospedagem, `docs/release/hospedagem-web.md`)
- **Política de privacidade (URL)**: `https://app.financaspro.com/privacidade.html`

## Assinatura da marca
`Seu dinheiro, no seu aparelho.`

Uma só, em todos os pontos: ícone, site, rodapé, `manifest.json` e a
`<meta name="description">`. Na loja, a descrição curta diz o mesmo em
palavras de busca ("Funciona offline, direto no celular").

## Descrição curta (máx. 80 caracteres)
```
Controle de gastos, orçamento e metas. Funciona offline, direto no celular.
```
(75 caracteres)

Para um experimento da ficha depois (teste A/B):
- `Controle de gastos, orçamento 50/30/20 e fatura do cartão, direto no celular.` (77)
- `Controle financeiro simples: gastos, orçamento e metas. Seus dados no celular.` (78)

> O app da loja pede login na primeira abertura (conta Supabase); sem conexão,
> só entra quem já entrou antes neste aparelho. Não prometa “sem cadastro” nem
> “sem conta” na loja: o que vale é que a conta é grátis, o plano gratuito não
> tem prazo e os lançamentos ficam no aparelho, com cópia na nuvem.

## Descrição completa (máx. 4000 caracteres)
```
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
• Todo o seu histórico, com comparação ano a ano
• Previsão do saldo no fim do mês
• Encontra assinaturas esquecidas que você ainda paga
• Categoriza sozinho, aprendendo com você
• Fatura do cartão projetada, com as parcelas futuras
• Celular, tablet e navegador sincronizados
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
```
(2.626 caracteres)

Antes de colar, confira:
- a oferta de 14 dias de Pro ao criar conta continua valendo
  (`config/plan-limits.json`, `welcomeTrialDays`); se mudar, tire a frase no
  mesmo dia;
- "PIN e biometria": a biometria depende do aparelho; se preferir não
  prometer, troque por "PIN para abrir o app".

Os preços saíram do texto: a própria Play mostra a faixa de preço das compras
no app, e preço escrito na descrição fica errado no primeiro reajuste.

## Observações
- Ícone do app (512×512): use `icons/icon-512.png` (gerado por `npm run icons:generate`).
- O gerador também produz `icon-maskable-512.png` (fundo sangrando, símbolo na
  zona segura), `icon-mono-512.png` (tema dinâmico do Android 13+) e
  `icon-notificacao-96.png`. Nenhum deles é opcional: sem o monocromático o
  sistema inventa um, e o resultado é feio.
- Gráfico de destaque (1024×500): `docs/play-store/vitrine/destaque-1024x500.png`.
- Capturas de celular, nesta ordem: `docs/play-store/vitrine/01-*.png` a `08-*.png`
  (1080×1920, com legenda). Geradas por `npm run vitrine:gerar` a partir do app
  real com dados de exemplo. As antigas (`screenshot-*.png`) e a
  `screenshot-placeholder-1080x1920.png` (tela em branco) não vão para a loja.
- Capturas de tablet, na mesma ordem e com a mesma legenda, em 9:16 (a Play
  só aceita essa proporção no tablet): 7" em `docs/play-store/vitrine/tablet/`
  (1080×1920) e 10" em `docs/play-store/vitrine/tablet-10/` (1440×2560).
  A tela dentro do aparelho é a do app numa largura de tablet de verdade
  (600 e 800 px). As antigas `screenshot-*-tablet-*.png` (16:10) saem da loja.
- Idioma padrão: Português (Brasil).
- Pro com **trial de 7 dias** no Play Console, nos SKUs `financaspro.pro.monthly` e `.yearly` (ver `play-store-billing-runbook.md`).
- Preços dos SKUs: **R$ 16,99/mês** e **R$ 129,99/ano** (tiers do Play). Preço
  não mora em `config/plan-limits.json` — mude em `js/billing.js`
  (`STATIC_PLANS`), no Stripe e no Play Console, os três juntos.
- **Pro de boas-vindas** (14 dias, sem cartão) é entitlement do nosso backend,
  não assinatura da loja. Não anunciar como trial do SKU: são coisas
  diferentes, e confundi-las na ficha seria desonesto.
