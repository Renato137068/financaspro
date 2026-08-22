# Fase 7 — Recorrentes offline · concluída

**Resultado:** 1.152 testes frontend (+16) e 346 backend passando. Lint sem
erros. Cobertura, contraste WCAG AA, sinks de XSS e dívida de CSS sem regressão.

---

## O problema

O princípio declarado do projeto é *"o app sempre funciona, auth é
complementar"*. A recorrência contradizia isso frontalmente.

Ela era gravada no localStorage e materializada **apenas pelo worker BullMQ do
backend**. Sem Redis, worker rodando e usuário autenticado, quem cadastrava
"Aluguel mensal" nunca via o lançamento aparecer no mês seguinte. A configuração
existia; o efeito, não. É o mesmo padrão de falha silenciosa das âncoras de DOM
da Fase 2 — a diferença é que aqui o buraco estava entre o cliente e o servidor.

---

## A parte perigosa: duplicação

Se cliente e worker gerarem o mesmo lançamento, o usuário vê o aluguel cobrado
duas vezes. **Num app financeiro isso é pior do que não gerar nada.**

Duas travas:

### 1. Modo local apenas

Havendo sessão na nuvem, o worker é o dono do processo e o módulo não encosta.
Não é otimização — é a fronteira que impede dois produtores de escreverem a
mesma coisa. `RECORRENTES.processar()` devolve lista vazia em modo nuvem.

### 2. Verificação dupla de idempotência

Aqui eu errei primeiro e o teste pegou.

Escrevi o módulo verificando apenas as **transações existentes** — e comentei no
código que isso protegia o usuário de ver reaparecer um lançamento que ele
apagou. Estava exatamente invertido: com verificação por transação, apagar o
lançamento significa que ele **volta** na próxima abertura.

A versão correta usa as duas metades, cada uma cobrindo a falha da outra:

| Mecanismo | O que protege |
|---|---|
| **Marcador** (`config.recorrentesProcessadas`) | Respeita a decisão do usuário: quem apagou o aluguel de agosto de propósito não o vê voltar |
| **Transação existente** | Rede de proteção se o marcador se perder (backup antigo, limpeza de config) — sem ela, perder o marcador duplicaria meses inteiros |

Há teste para os dois lados, incluindo *"rodar dez vezes ainda produz um
lançamento"* e *"um lançamento apagado pelo usuário não volta"*.

---

## Outras decisões

**Recupera meses perdidos.** Quem ficou dois meses sem abrir encontra o
histórico completo, não só o mês corrente.

**Teto de 12 meses retroativos.** Uma recorrente cadastrada com início em 2020
não pode despejar setenta lançamentos de uma vez na cara de quem abriu o app.

**Só frequência mensal.** Semanal e quinzenal exigem outra aritmética, e gerar
errado seria pior do que não gerar. A limitação é explícita no código e coberta
por teste, em vez de virar um lançamento silenciosamente torto.

**`addMesesClamp` de novo.** Uma recorrente do dia 31 gera 31/01, 28/02, 31/03 —
sem o clamp, fevereiro ficaria sem lançamento e março teria dois. É o terceiro
lugar do projeto onde esse erro apareceria.

**Avisa quando gera.** Lançamentos que surgem sozinhos no extrato, sem nenhuma
explicação, parecem erro do app.

---

## Arquivos

| Arquivo | Mudança |
|---|---|
| `js/recorrentes.js` | **novo** — materialização, idempotência, teto retroativo |
| `tests/recorrentes-cliente.test.js` | **novo** — 23 testes |
| `js/core/lifecycle.js` | processa na abertura |
| `index.html`, `tests/load-sources.js` | registro do módulo |

---

## Estado do roadmap

| Item | Situação |
|---|---|
| Integridade financeira | ✅ Fases 1 e 4 |
| Funcionalidades inacessíveis | ✅ Fase 2 |
| Dashboard e as 8 perguntas | ✅ Fase 3 |
| Cartão de crédito | ✅ Fases 5 e 6 |
| **Offline-first cumprido** | ✅ **esta fase** |
| CSS de 240 KB | ⬜ maior ganho de performance restante |
| Estado duplicado STORE/DADOS | ⬜ 29 usos fora do `actions.js` |
| Tratamento de erros | ⬜ 20 `catch` vazios · 86 logs sem feedback |
| Dois modelos de conta (nome × id) | ⬜ |
| Fronteira grátis/pago | ⬜ decisão de produto |
| Assinaturas no comprometido | ⬜ |

### Sugestão de próximo passo

**Tratamento de erros.** É o que sobrou de mais próximo do tema que guiou todo
este trabalho: falha silenciosa. Vinte `catch` vazios e 86 logs que o usuário
nunca vê são a mesma classe de problema das âncoras órfãs e das recorrentes que
não recorriam — o app sabe que algo deu errado e não conta a ninguém.

Depois disso, o CSS de 240 KB é o maior ganho técnico restante, mas exige teste
visual confiável para não ser um corte no escuro.
