# Fase 4 — Inteligência · concluída

Escopo: fazer a análise dizer a verdade e chegar a tempo de ser útil.
Nenhuma funcionalidade de IA foi adicionada só para existir — todo o trabalho
foi sobre corrigir cálculos errados e transformar avisos em ações.

**Resultado:** 994 testes frontend (+48) e 346 backend passando. Lint sem erros.
Contraste WCAG AA, sinks de XSS e dívida de CSS sem regressão.

Vale registrar: **a IA do FinançasPro é 100% local** — regressão linear,
mediana, MAD, agregações. Nenhuma chamada externa, nenhum dado financeiro
saindo do dispositivo. Isso não mudou, e é a decisão certa.

---

## 1. A projeção de fim de mês estava 82% errada

`projetarFimMes` estimava o fechamento pegando todas as despesas do mês,
dividindo pelos dias decorridos e extrapolando. Funciona enquanto o mês só tem
lançamentos passados — e quebra feio quando o usuário parcela, que é o recurso
principal do app.

O parcelamento grava uma transação por parcela, cada uma na sua data. Uma
parcela com data futura **dentro do mês corrente** entrava duas vezes: somava ao
total já gasto **e** inflava a taxa diária, que era então multiplicada pelos
dias restantes.

Cenário medido — gasto de R$ 1.000 até o dia 10 mais uma parcela de R$ 2.000
marcada para o dia 15:

| | Despesas projetadas | Saldo projetado (receita R$ 5.000) |
|---|---:|---:|
| Antes | R$ 9.300 | **−R$ 4.300** |
| Correto | R$ 5.100 | −R$ 100 |

A tela anunciava "o mês fecha R$ 4.300 no vermelho" quando o fechamento real era
próximo de zero. Errar para o lado do alarme não é conservador — é alarme falso,
e alarme falso ensina o usuário a ignorar o app.

Agora o ritmo diário vem só do que **já** foi gasto; os compromissos já
agendados entram pelo valor cheio, uma vez só.

## 2. Aviso de estouro antes do estouro

O orçamento dizia quanto foi gasto e se já tinha passado do limite. Um selo
"excedido" no dia 28 é um obituário: não sobra mês para reagir.

`ORCAMENTO.projetarCategoria()` projeta o fechamento de cada categoria pelo
ritmo do mês e classifica o risco: `ok`, `vai-estourar`, `estourado`,
`cedo-demais` ou `sem-limite`. E devolve o número que transforma alerta em ação
— o **teto diário** para não estourar:

> Você já usou 87% do orçamento de Alimentação e ainda faltam 13 dias para o fim
> do mês. Para não estourar, o teto é R$ 10,00 por dia.

"Segure os gastos" não é uma instrução. "R$ 10 por dia" é.

Duas decisões deliberadas:

- **Projeção linear.** Modelar sazonalidade ou dia da semana exigiria histórico
  que a maioria dos usuários não tem, e erraria com ar de precisão — pior que
  errar de forma óbvia.
- **Nada antes do dia 3.** Um almoço caro no dia 2 projetaria um estouro que não
  existe.

Aparece no dashboard (duas piores categorias) e na aba de orçamento (três). Uma
lista de sete alertas não é lida — é fechada.

## 3. O alerta de gasto incomum estava mentindo

Três problemas, e os três corroem confiança.

**A mensagem era falsa.** Dizia *"Valor 3x acima da média"* usando o **z-score**,
que é o número de desvios-padrão, não um múltiplo da média. Um gasto de R$ 130
numa categoria de média R$ 100 podia ser anunciado como "3x acima da média". O
usuário confere, vê que não bate, e para de acreditar no resto da tela.

**Não tinha recorte de tempo.** Uma anomalia de oito meses atrás aparecia como
novidade no dashboard de hoje. Agora a janela é de 90 dias (configurável), mas a
referência do que é "habitual" continua usando todo o histórico — quanto mais
dados, melhor a noção do normal.

**Não dizia o que fazer com aquilo.** "Gasto incomum" sem valor de referência é
sobressalto, não informação. A mensagem agora é:

> Gasto incomum: "Jantar caro" (R$ 600,00) — em Alimentação você costuma gastar
> cerca de R$ 102,50.

### Por que mediana e MAD, e não média e desvio-padrão

Havia um defeito estatístico real por baixo. As amostras aqui são pequenas —
poucas dezenas de lançamentos por categoria — e nesse regime **um único valor
extremo puxa a média E o desvio-padrão para cima**, derrubando o próprio z-score
abaixo do corte. O alerta sumia exatamente no caso mais grave.

Com gastos de R$ 50, R$ 52, R$ 48, R$ 51 e um lançamento de R$ 5.000 — provável
erro de digitação, o caso em que o usuário mais precisa ser avisado — a média
sobe para R$ 1.040 e o desvio para ~R$ 1.980. O z-score do outlier fica em ~2,0,
abaixo do corte de 2,5: **nenhum alerta**.

A mediana não se move com um ponto extremo. Há um teste travando exatamente esse
cenário.

Também entraram dois filtros que reduzem ruído: mínimo de quatro lançamentos na
categoria (menos que isso não forma padrão) e exigência de o valor ser pelo menos
**2× o habitual** — R$ 13 contra R$ 10 pode ter z alto numa categoria muito
regular e não interessa a ninguém.

---

## Arquivos alterados

**Novos**

| Arquivo | Conteúdo |
|---|---|
| `tests/projecao-fim-mes.test.js` | 14 testes |
| `tests/orcamento-risco.test.js` | 16 testes |
| `tests/anomalias.test.js` | 18 testes |

**Alterados**

| Arquivo | Mudança |
|---|---|
| `js/ai-engine.js` | projeção separa realizado de agendado; anomalias por mediana/MAD com janela e mensagem honesta |
| `js/orcamento.js` | `projetarCategoria`, `categoriasEmRisco`, `mensagemRisco` |
| `js/insights.js` | risco de orçamento no dashboard; anomalia com valor |
| `js/modules/init-orcamento.js` | risco por categoria na aba de orçamento |
| `js/alertas.js` | anomalia com valor e referência |

---

## O que ficou de fora, e por quê

**Assistente que responde perguntas sobre os próprios dados** (Etapa 11 do
briefing). Não entrou. Fazer isso bem exige um modelo de linguagem, e mandar
dados financeiros para um serviço externo contraria a decisão de privacidade que
o projeto já tomou e cumpre. Um assistente puramente local que apenas casa
palavras-chave pareceria inteligente na demonstração e frustraria no uso real.
É uma decisão de produto que vale ser tomada explicitamente, não por inércia.

**Categorização automática por aprendizado** já existe (`APRENDIZADO` +
`CATEGORIZADOR` + `SCORE`) e voltou a ser alcançável na Fase 2, junto com a
entrada rápida. Não precisou de mudança.

---

## Próximo: Fase 5 — Performance

1. Lazy-load de OCR, patrimônio, open-finance, billing e 2FA (hoje o code
   splitting cobre só `previsao` e `relatorios`)
2. `sourcemap: false` no build de produção
3. Reduzir o CSS crítico — medir antes e depois, sem micro-otimização
