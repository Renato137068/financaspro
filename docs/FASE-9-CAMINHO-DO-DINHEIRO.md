# Fase 9 — O caminho do dinheiro · concluída

**Resultado:** 1.187 testes frontend (+19) e 346 backend passando. Lint sem
erros. Cobertura, contraste WCAG AA, sinks de XSS e dívida de CSS sem regressão.

---

## O buraco que faltava

Todos os 1.168 testes anteriores verificavam **um módulo por vez**. Isso pega
erro de cálculo, mas não pega o erro que mais apareceu nesta auditoria: **cada
módulo certo sozinho, e errados em conjunto.**

Foi assim com o cartão descontando do saldo *e* entrando no comprometido. Com a
parcela futura contada pelos dois caminhos. Com a projeção de fim de mês somando
a mesma despesa duas vezes. Em nenhum desses casos havia um módulo quebrado —
havia dois módulos com leituras incompatíveis do mesmo dinheiro.

## Sobre não ter feito E2E de navegador

A sugestão anterior era um teste Playwright. **Os navegadores do Playwright não
estão instalados neste ambiente**, então eu escreveria uma spec que não posso
executar — entregar teste não testado é exatamente o que venho criticando.

O `e2e/` existente já cobre navegação entre abas e renderização básica. O que
faltava não era clicar em botões: era garantir que os sete módulos que calculam
dinheiro concordem sobre o mesmo conjunto de dados. Esse é o nível onde os bugs
realmente estavam.

---

## O que o teste faz

Monta **um** cenário realista de um mês — salário, mercado no débito, TV
parcelada em 3x no cartão, aluguel a pagar, transferência para a poupança, meta
em andamento — e cobra que todos contem a mesma história:

| Módulo | O que é verificado |
|---|---|
| Extrato | cartão não vira saída de conta; transferência não vira gasto |
| Orçamento | consome a categoria, inclusive o que foi no cartão |
| Saldo por conta | só o que saiu do banco |
| Comprometido | cartão + contas a pagar, sem repetir a parcela |
| Fatura | só a parcela do ciclo |
| Meta | progresso próprio, sem interferir no resto |
| Projeção | não conta a parcela futura duas vezes |

Depois edita e apaga, exigindo que os números voltem exatamente ao ponto
anterior — inclusive que apagar a transferência devolva o dinheiro à origem sem
alterar o total.

### A invariante

```
disponível = saldo das contas − tudo que já tem dono
```

Há um teste de reconciliação direta: o que já saiu da conta, somado ao que ainda
vai sair, tem de dar o total de despesas registradas. Sem sobra nem falta. Se
essa conta não fechar, alguma despesa está sendo contada duas vezes ou nenhuma.

---

## Achou um bug na primeira execução

`obterResumoMes` somava em ponto flutuante. Mil lançamentos de R$ 0,10 davam
**99,9999999999986**.

O orçamento e o saldo por conta já somavam em centavos inteiros — corrigidos nas
fases anteriores. O resumo do mês, não. Resultado: o dashboard exibia um total de
despesas que **não batia com o consumo do orçamento sobre exatamente os mesmos
dados**. Dois números diferentes para a mesma coisa, na mesma tela.

Corrigido em quatro funções (`summarizeMonth`, `calculateBalance`,
`summarizeByCategory` e o fallback de `transacoes.js`), mantendo os dois caminhos
— com e sem o service — produzindo o mesmo número.

> Este é o argumento a favor do teste de integração em uma frase: nenhum teste
> unitário pegaria isso, porque cada módulo estava certo dentro da própria
> definição.

---

## Arquivos

| Arquivo | Mudança |
|---|---|
| `tests/caminho-do-dinheiro.test.js` | **novo** — 19 testes de integração |
| `js/services/transactionService.js` | soma em centavos em 3 funções |
| `js/transacoes.js` | fallback do resumo em centavos |
| `tests/load-sources.js` | `ai-engine` no harness |

---

## Estado do roadmap

| Item | Situação |
|---|---|
| Integridade financeira | ✅ Fases 1, 4 e 9 |
| Funcionalidades inacessíveis | ✅ Fase 2 |
| Dashboard e as 8 perguntas | ✅ Fase 3 |
| Cartão de crédito | ✅ Fases 5 e 6 |
| Offline-first | ✅ Fase 7 |
| Falhas silenciosas | ✅ Fase 8 |
| **Concordância entre módulos** | ✅ **esta fase** |
| CSS de 240 KB | ⬜ dívida técnica |
| Estado duplicado STORE/DADOS | ⬜ dívida técnica |
| Dois modelos de conta | ⬜ só vale junto de uma feature que precise |
| Fronteira grátis/pago | ⬜ **decisão de produto** |
| E2E de navegador | ⬜ exige `npx playwright install` |

---

## Onde isto chegou

Nove fases, **1.187 testes frontend e 346 backend**, partindo de 884 e 346.

O que mudou de verdade não é a contagem: é que o app parou de errar em silêncio.
Não há mais valor gravado errado, data que pula mês, feature que existe só no
código, dinheiro contado duas vezes nem erro que ninguém fica sabendo.

**O que resta não é da mesma natureza.** CSS e estado duplicado são dívida
técnica — o app funciona, só custa mais caro. A fronteira grátis/pago é decisão
de produto, e implementar uma escolha errada é pior que não implementar. O E2E
de navegador precisa de um `npx playwright install` que este ambiente não tem.

Se for para continuar, o item com melhor retorno agora é o **CSS de 240 KB** —
mas ele exige teste visual confiável antes, senão é corte no escuro. Vale mais
como projeto planejado do que como próxima tarefa.
