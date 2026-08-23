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
Seu dinheiro, no seu aparelho. Sem cadastro, sem banco conectado, sem anúncios.
```
(79 caracteres — o limite da Play Store é 80)

> Abre pela privacidade, não por "simplicidade". "Com simplicidade" é o que todo
> concorrente também promete — é a frase mais comum da categoria, e por isso não
> diferencia nada. O que só este app pode dizer é que funciona inteiro sem
> servidor.

## Descrição completa (máx. 4000 caracteres)
```
Todo app de finanças pede acesso ao seu banco. O FinançasPro não pede nem seu e-mail.

Ele funciona inteiro no seu aparelho: sem cadastro, sem conectar conta bancária e
sem internet. Você registra receitas e despesas em segundos e vê a única coisa que
importa no fim do mês — quanto sobra.

POR QUE ELE É DIFERENTE
• Não pede cadastro nem e-mail para começar
• Não conecta ao seu banco e não lê seus extratos
• Funciona sem internet, do primeiro ao último dia
• Seus dados não saem do aparelho, e você exporta ou apaga tudo quando quiser

RECURSOS
• Dashboard mensal de receitas, despesas e saldo
• Extrato com filtros e busca
• Orçamento por categoria
• Metas de economia
• Projeção de fim de mês ("neste ritmo você fecha com R$ X")
• Alerta de assinaturas recorrentes que você talvez tenha esquecido
• Modo escuro
• Guia "Comece aqui" para quem está começando

PRIVACIDADE NÃO É UM RECURSO, É COMO O APP FOI FEITO
• Seus dados ficam no seu aparelho por padrão
• Sem anúncios e sem venda de dados
• PIN local opcional para proteger o acesso
• Backup e exclusão total nas suas mãos, a qualquer momento

Esta é uma versão em teste (piloto). Estamos ouvindo os primeiros usuários para
deixar o app cada vez melhor — seu feedback é muito bem-vindo.
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
