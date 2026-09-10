# Ficha da Play Store — FinançasPro (pronto para copiar)

## Identidade
- **Nome do app** (máx. 30 caracteres): `FinançasPro`
  - Alternativas: `FinançasPro: Controle` · `FinançasPro Finanças`
- **Categoria**: Finanças
- **Tags**: finanças pessoais, controle de gastos, orçamento, metas
- **E-mail de contato**: (o e-mail do desenvolvedor — o mesmo da política de privacidade)
- **Site** (opcional): —
- **Política de privacidade (URL)**: (link público onde você hospedar `privacidade.html`)

## Assinatura da marca
`Seu dinheiro, no seu aparelho.`

Uma só, em todos os pontos: loja, ícone, site, rodapé, `manifest.json` e a
`<meta name="description">`. Antes havia três frases diferentes, e a única que
apontava para o diferencial real estava enterrada neste arquivo.

## Descrição curta (máx. 80 caracteres)
```
Seu dinheiro no aparelho, com sync opcional na nuvem. Sem anúncios.
```
(67 caracteres — o limite da Play Store é 80)

> O APK publicado usa login Supabase para sync/assinatura. Não prometa “sem cadastro”
> na loja. O diferencial continua sendo dados no aparelho + sync sob seu controle.

## Descrição completa (máx. 4000 caracteres)
```
O FinançasPro começa no seu aparelho: registre receitas e despesas e veja quanto
sobra no fim do mês — sem anúncios e sem vender seus dados.

Para sincronizar entre dispositivos, exportar na nuvem e usar recursos Pro
(previsão, equipe, PDF), entre com uma conta. O uso local básico continua
disponível offline.

POR QUE ELE É DIFERENTE
• Dados no aparelho por padrão — você decide quando sincronizar
• Sem anúncios e sem venda de dados
• Sync opcional na nuvem (Supabase) quando você quiser
• Assinatura Pro via Google Play, com 7 dias de teste

NO PLANO GRATUITO, SEMPRE
• Lançamentos ilimitados — nunca travamos seu registro
• Dashboard mensal de receitas, despesas e saldo
• Extrato completo com filtros e busca
• Orçamento 50/30/20 e limites por categoria
• Até 5 contas e cartões
• Gráficos e relatórios dos últimos 3 meses
• Alertas de saldo e de orçamento
• Exportação CSV e backup dos seus dados
• Modo escuro e PIN local

NO PRO
• Todo o seu histórico, com comparativo ano a ano
• Previsão de fim de mês e do fluxo futuro
• Encontra assinaturas esquecidas que você ainda paga
• Categoriza sozinho, aprendendo com você
• Fatura do cartão projetada, com as parcelas futuras
• Celular, tablet e navegador sincronizados
• Modo casal — duas pessoas, uma vida financeira
• Relatório em PDF pronto para apresentar

PLANOS (Google Play)
• Gratuito — sem prazo e sem anúncios
• Pro — R$ 16,99/mês ou R$ 129,99/ano · trial de 7 dias
• Ao criar conta, 14 dias de Pro por nossa conta, sem cartão

PRIVACIDADE
• Seus dados ficam no aparelho por padrão
• Sync e anexos na nuvem só com login
• PIN local opcional (não substitui criptografia de disco)
• Backup e exclusão nas suas mãos

Esta é uma versão em evolução. Feedback é bem-vindo.
```

## Observações
- Ícone do app (512×512): use `icons/icon-512.png` (gerado por `npm run icons:generate`).
- O gerador também produz `icon-maskable-512.png` (fundo sangrando, símbolo na
  zona segura), `icon-mono-512.png` (tema dinâmico do Android 13+) e
  `icon-notificacao-96.png`. Nenhum deles é opcional: sem o monocromático o
  sistema inventa um, e o resultado é feio.
- Feature graphic (1024×500): `docs/play-store/feature-graphic-1024x500.png` (já existe).
- Screenshots (mín. 2 de celular): `docs/play-store/screenshot-resumo-...`, `-extrato-...`, `-orcamento-...` (já existem, 1080×1920).
- Idioma padrão: Português (Brasil).
- Trial Play Console: **7 dias** nos SKUs `financaspro.pro.monthly` e `.yearly` (ver `play-store-billing-runbook.md`).
- Preços dos SKUs: **R$ 16,99/mês** e **R$ 129,99/ano** (tiers do Play). Preço
  não mora em `config/plan-limits.json` — mude em `js/billing.js`
  (`STATIC_PLANS`), no Stripe e no Play Console, os três juntos.
- **Pro de boas-vindas** (14 dias, sem cartão) é entitlement do nosso backend,
  não assinatura da loja. Não anunciar como trial do SKU: são coisas
  diferentes, e confundi-las na ficha seria desonesto.
