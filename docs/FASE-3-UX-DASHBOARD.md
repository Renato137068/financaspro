# Fase 3 — UX e as perguntas do dashboard · concluída

Escopo: fazer o dashboard responder as perguntas que decidem uma compra, e dar
às metas um diagnóstico em vez de só uma barra de progresso.

**Resultado:** 946 testes frontend (+78) e 346 backend passando. Lint sem erros.
Contraste WCAG AA, sinks de XSS e dívida de CSS sem regressão.

---

## 1. Metas: de "onde estou" para "vou conseguir?"

Uma barra em 40% não diz nada sozinha. Em 40% faltando dois meses é um problema;
em 40% faltando dois anos é tranquilidade. O módulo já guardava alvo, valor
atual e prazo — faltava cruzar as três coisas.

`METAS.calcularProjecao()` devolve aporte mensal necessário, ritmo já
demonstrado, previsão de conclusão, e um diagnóstico: `no-ritmo`, `adiantado`,
`atrasado`, `vencida`, `concluida` ou `sem-prazo`. Quando há atraso, vem também
o valor exato do ajuste — "você está atrasado" sem o quanto é só ansiedade sem
saída.

Dois detalhes que mudaram o resultado:

**Meses de calendário, não 30,44 dias.** De 10/02 a 10/08 dá 5,95 meses pela
média; qualquer pessoa conta 6. Como esse número é o divisor do ritmo mensal, o
desvio aparecia direto no "aumente o aporte em R$ X" — e um número que não bate
com a conta de cabeça destrói a confiança no resto da tela.

**`instanceof Date` não funciona entre realms.** O parâmetro de data injetável
era descartado em silêncio quando vinha de outro contexto (o que a suíte faz ao
carregar os módulos em `vm`), e a função voltava a usar a data real. O teste
media o dia em que rodou, não o cenário. Trocado por checagem de método.

Também corrigi ali o mesmo erro de ancoragem de data que já havia aparecido em
contas-pagar e assinaturas: uma meta vencendo **hoje** mostrava "1 dia restante".

## 2. "Quanto eu tenho, e onde"

O app registrava a conta de cada lançamento desde sempre e **nunca somava nada
por conta**. A pergunta mais básica de um app financeiro não tinha resposta em
lugar nenhum da interface.

`CONTAS.saldos()` deriva o saldo das transações — não armazena. Um saldo
guardado precisa ser mantido em sincronia com registros que são editados,
apagados e importados; é assim que nascem divergências que ninguém consegue
explicar depois. Recalcular custa milissegundos e nunca diverge.

Decisões que valem registro:

- **Contas sem lançamento aparecem zeradas.** Uma conta recém-criada que não
  aparece na lista parece que não foi salva.
- **Contas que só existem nas transações também aparecem.** Dinheiro lançado num
  banco removido da lista não pode sumir do total.
- **Lançamentos sem conta são agrupados, não descartados.**
- **Saldo negativo é mostrado**, não escondido.

Há um `saldoInicial` por conta (`config.saldosIniciais`) porque ninguém começa a
usar o app com as contas zeradas.

### Sobre os dois modelos de conta

Existem **dois modelos concorrentes** no projeto: as transações referenciam a
conta pelo **nome** (campo `banco`), e há um cadastro separado com id
(`fp-contas`, com CRUD e sincronização com o backend) que **nada usa** — nenhuma
tela, nenhum vínculo com transação.

Calculei o saldo sobre o modelo que realmente tem dados. Unificar os dois exige
migrar transações já gravadas e é trabalho da fase de cartões, onde o modelo com
id vai ser necessário de qualquer forma.

## 3. Transferência entre contas

Sem um tipo próprio, mover R$ 1.000 da corrente para a poupança só podia ser
registrado como uma despesa mais uma receita. O estrago é grande: R$ 1.000
viram renda do mês, R$ 1.000 viram gasto, o 50/30/20 é calculado sobre uma renda
inflada, e a categoria escolhida para a "despesa" estoura um orçamento que
ninguém gastou.

A transferência é **um registro só** (`tipo: 'transferencia'`, com `banco` de
origem e `contaDestino`), não um par. Par é como nascem duplicidades quando
alguém edita ou apaga uma das pontas — e o saldo passa a mentir sem nenhum sinal.

O tipo próprio tem um efeito de projeto importante: todos os agregadores filtram
por `'receita'` ou `'despesa'`, então a transferência é ignorada por eles de
graça, sem mexer em 17 arquivos.

**Mas seis lugares somavam "tudo que não é receita" como despesa.** Esses
tratavam a transferência como gasto. Todos passaram a testar despesa
explicitamente:

```
js/transacoes.js (2)  ·  js/services/transactionService.js (3)  ·  js/modules/init-extrato.js (2)
```

O formulário de transferência ficou na seção de contas, não no formulário de
lançamento: é onde a pessoa está olhando quando pensa "preciso mover isso de
lugar", e um terceiro tipo no toggle obrigaria a esconder categoria,
parcelamento e recorrência — mais estado no formulário que já é o mais complexo
do app.

## 4. "Quanto posso gastar" e "quanto já tem dono"

As duas perguntas que faltavam. Um saldo de R$ 3.000 parece folga; se R$ 2.400
já estão prometidos ao cartão, a folga real é R$ 600 — e é esse o número que
muda uma decisão.

`COMPROMISSOS.comprometido()` soma parcelas ainda por vencer e contas a pagar em
aberto. `COMPROMISSOS.disponivel()` devolve saldo menos comprometido, com uma
classificação (`folga` / `apertado` / `negativo`) para a UI escolher a cor sem
repetir a regra.

### O erro que quase passou

Na primeira versão, o saldo por conta somava **todas** as transações, inclusive
as de data futura. Resultado: a parcela de setembro era descontada do saldo
**e** somada ao comprometido — o usuário veria o mesmo dinheiro sumir duas vezes.

Corrigido com uma data de corte comum: o saldo conta o que já aconteceu até
hoje; o comprometido conta o que vem depois. Há dois testes travando exatamente
isso, incluindo o de que o disponível **não muda** quando a parcela vence — ela
apenas migra de um lado para o outro.

---

## 5. Um crash que eu mesmo tornei alcançável

`config.bancos` tem duas formas no mesmo app: strings no formato legado
(`['Nubank']`) e objetos no atual (`[{ nome, tipo }]`). `init-form.js` já
tratava as duas. `parser.js` não — fazia `b.toLowerCase()` direto e estourava
`b.toLowerCase is not a function`.

O bug era inofensivo enquanto a entrada rápida estava fora do HTML. Ao
restaurá-la na Fase 2, ele passou a derrubar a funcionalidade inteira para
**qualquer usuário que tivesse cadastrado um banco pela tela de configurações**.

Centralizado em `UTILS.nomeDeConta()`, que aceita as duas formas e sobrevive a
entradas corrompidas na lista. Sete testes cobrindo os formatos misturados.

---

## Arquivos alterados

**Novos**

| Arquivo | Conteúdo |
|---|---|
| `js/compromissos.js` | comprometido, disponível e render dos KPIs |
| `tests/metas-projecao.test.js` | 22 testes |
| `tests/contas-saldos.test.js` | 14 testes |
| `tests/transferencias.test.js` | 18 testes |
| `tests/dashboard-kpis.test.js` | 15 testes |
| `tests/bancos-formato.test.js` | 10 testes |

**Alterados**

| Arquivo | Mudança |
|---|---|
| `js/metas.js` | projeção, diagnóstico, `_mesesEntre`, `_agora`, data e centavos |
| `js/contas.js` | saldos por conta, saldo total, data de corte, formulário de transferência |
| `js/transacoes.js` | `criarTransferencia`, agregação explícita |
| `js/services/transactionService.js` | agregação explícita, saldo ignora transferência |
| `js/modules/init-extrato.js` | agregação explícita (2 lugares) |
| `js/core/config.js` | `TIPO_TRANSFERENCIA` |
| `js/core/utils.js` | `nomeDeConta`, validação aceita transferência |
| `js/parser.js` | correção do crash com bancos em formato objeto |
| `js/modules/init-metas.js` | linha de diagnóstico no card |
| `js/init.js` | KPIs e saldos no ciclo do dashboard |
| `index.html` | seção "Disponível para gastar", seção "Minhas contas", script novo |
| `css/layouts/dashboard.css`, `css/features/metas.css` | estilos por token |
| `tests/load-sources.js` | carrega `transactionService` e `compromissos` |
| `tests/utils.test.js` | 'transferencia' deixou de ser exemplo de tipo inválido |
| `tests/ancoras-dom.test.js` | 3 âncoras críticas novas |

Uma nota sobre `tests/load-sources.js`: o harness não carregava
`transactionService.js`, e `TRANSACOES` delega a ele quando presente. Ou seja,
os testes exercitavam o caminho de *fallback* — justamente o que não roda em
produção. Agora carregam o real.

---

## O que continua em aberto

- **`#contas-lista`** ainda é órfão: é o cadastro do modelo com id, que segue
  sem tela. Registrado em `OPCIONAIS` com motivo.
- **Assinaturas não entram no comprometido.** O módulo tem ciclo próprio e
  merece um tratamento junto com o modelo de cartão.
- **Hierarquia do dashboard** — o "Disponível" já entrou como número dominante,
  mas ainda há cards competindo por atenção. Redução de ruído é trabalho
  contínuo, não um item que se marca como feito.

---

## Próximo: Fase 4 — Inteligência

1. Expor `AI_ENGINE.projetarFimMes` no dashboard (existe e quase não é usada)
2. Orçamento: tendência e risco de estouro por categoria
3. Anomalias com explicação em linguagem simples
4. Sugestão de ajuste acionável
