# Fase 5 — Cartão de crédito · concluída

O relatório pós-implementação apontou cartões como o maior gargalo isolado:
a única área que continuava com nota 2, e a que impedia o app de responder
"quanto eu realmente tenho" para quem usa cartão — praticamente todo mundo.

**Resultado:** 1.097 testes frontend (+52) e 346 backend passando. Lint sem
erros. Cobertura, contraste WCAG AA, sinks de XSS e dívida de CSS sem regressão.

---

## O problema

O app guardava só o **nome** do cartão em cada lançamento. Uma compra parcelada
em 12x abatia o saldo do mês da compra, quando o desembolso real acontece em
doze faturas futuras.

O que define um cartão é o **ciclo**: a compra entra numa fatura, a fatura fecha
num dia e é paga em outro. Enquanto não vence, o dinheiro ainda está na conta —
comprometido, não gasto.

---

## O que foi feito

### Modelo sem migração

`config.cartoes` já guardava `{ nome, bandeira, limite }` — o limite existia e
nunca era usado para nada. O módulo novo apenas lê dois campos adicionais no
mesmo objeto: **`fechamento`** e **`vencimento`** (dia do mês).

Nenhum dado existente muda de forma. Cartões cadastrados antes continuam
funcionando, sem ciclo.

### Regra de fechamento

Convenção brasileira: compra feita **até** o dia de fechamento entra na fatura
que fecha naquele mês; depois disso, vai para a seguinte.

O vencimento cai no mesmo mês do fechamento quando o dia de vencer é maior que o
de fechar; e no mês seguinte quando é menor ou igual — o arranjo mais comum do
mercado (fecha dia 28, vence dia 5).

```
Cartão fecha dia 20, vence dia 28

compra 15/08  →  fatura 2026-08  ·  fecha 20/08  ·  vence 28/08
compra 20/08  →  fatura 2026-08     (o próprio dia do fechamento ainda entra)
compra 21/08  →  fatura 2026-09  ·  fecha 20/09  ·  vence 28/09
```

Dia 31 é limitado ao último dia disponível — fevereiro fecha dia 28 (ou 29).

### A regra que era mais fácil de errar

Uma compra no crédito **não sai da conta no dia da compra**. Há três formas de
errar isso, e todas têm teste:

| Erro | Efeito para o usuário |
|---|---|
| Descontar do saldo no dia da compra | Saldo menor que o extrato do banco |
| Contar como comprometido **e** descontar do saldo | O mesmo dinheiro sumindo duas vezes |
| Somar o cartão junto das parcelas futuras genéricas | A mesma compra contada por dois caminhos |

O terceiro é o mais sutil: uma parcela futura no cartão é, ao mesmo tempo,
"despesa futura" e "compra no cartão". Só pode entrar por um caminho.

```
Saldo inicial R$ 5.000 · compra de R$ 1.200 no crédito

Saldo hoje          R$ 5.000   ← o dinheiro ainda está no banco
Comprometido        R$ 1.200   ← mas já tem dono
Disponível          R$ 3.800   ← e não 5.000 − 1.200 − 1.200
```

### Compatibilidade com dados antigos

O critério para "é cartão de crédito" é o cartão estar **cadastrado**.
Instalações antigas têm lançamentos com `cartao: 'Crédito'` sem cadastro
correspondente — esses continuam debitando a conta como antes. Tratá-los como
fatura invisível esconderia gasto real, e adivinhar é pior do que preservar o
comportamento conhecido.

Cartão cadastrado **sem** fechamento e vencimento já não debita a conta (o
usuário declarou que é crédito), mas não ganha faturas: o app não inventa datas.

### O que aparece na tela

Nova seção no dashboard, por cartão: barra de limite utilizado, quanto sobra,
fatura atual com o rótulo de vencimento ("vence em 12 dias") e o total da
próxima. O detalhe do "comprometido" agora separa as fontes — *cartões · parcelas
· contas* — porque R$ 2.400 em fatura pedem reação diferente de R$ 2.400 em
contas a pagar.

---

## Uma hipótese que precisa ficar explícita

**O app ainda não registra pagamento de fatura.** O cálculo assume que fatura
vencida foi paga, devolvendo o limite.

É a hipótese menos enganosa disponível: o contrário mostraria o limite preso
para sempre, e o usuário veria um cartão cheio que na vida real está livre. Mas
é uma hipótese, não um fato — quem atrasar uma fatura verá limite disponível que
não tem.

A correção é marcar fatura como paga, o que é trabalho de produto (estado + UI),
não de cálculo. Fica registrado como pendência.

---

## Arquivos

**Novos**

| Arquivo | Conteúdo |
|---|---|
| `js/cartoes.js` | modelo, ciclo de fatura, resumo e render |
| `tests/cartoes.test.js` | 32 testes |
| `tests/cartao-nao-duplica.test.js` | 17 testes |

**Alterados**

| Arquivo | Mudança |
|---|---|
| `js/contas.js` | compra em cartão cadastrado não debita a conta |
| `js/compromissos.js` | fatura entra no comprometido, sem dupla contagem |
| `js/modules/init-config.js` | cadastro grava fechamento e vencimento |
| `js/init.js`, `index.html`, `css/layouts/dashboard.css` | seção de cartões |
| `tests/ancoras-dom.test.js` | 3 âncoras críticas novas |
| `tests/load-sources.js` | carrega `cartoes.js` |

---

## Nota de auditoria

Com esta fase, **cartões sai de 2 para 7**. Não é 9 porque falta o pagamento de
fatura e a reconciliação com o extrato — mas a distinção que importa está feita:
o app agora sabe a diferença entre gastar e comprometer.

Isso move a nota global estimada de **7,8 para cerca de 8,3**. O critério que eu
mesmo registrei no relatório anterior — *"a nota só passa de 8,5 quando um
usuário de cartão conseguir abrir o app e confiar no número que vê"* — está
substancialmente atendido.

---

## Próximo

1. **Marcar fatura como paga** — remove a única hipótese não verificada do cálculo
2. **Fase 5 de performance** (lazy-load, `sourcemap: false`) — segue pendente
3. **Recorrentes no cliente** — offline-first ainda não cumprido
4. **Unificar os dois modelos de conta** (nome × id) — agora com o cartão modelado,
   a migração tem um destino claro
