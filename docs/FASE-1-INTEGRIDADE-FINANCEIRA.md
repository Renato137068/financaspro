# Fase 1 — Integridade financeira · concluída

Escopo: corrigir os erros que alteravam **valor** e **data** de lançamentos.
Nenhuma estrutura de dados, chave de storage, ID de DOM ou API pública mudou.
Dados existentes continuam legíveis sem migração.

**Resultado:** 845 testes frontend + 346 backend passando. Lint sem erros.
`check-xss-sinks`, `check-contrast` e `check-css-tokens` sem regressão.

---

## O que estava errado, e o que mudou

### 1. Parcelas não somavam o valor da compra

`Math.round((valor / n) * 100) / 100` era aplicado a todas as parcelas e o resto
da divisão sumia.

| Compra | Antes | Depois |
|---|---|---|
| R$ 100 em 3x | soma R$ 99,99 (−0,01) | soma R$ 100,00 |
| R$ 1.000 em 6x | soma R$ 1.000,02 (+0,02) | soma R$ 1.000,00 |
| R$ 99,99 em 7x | soma R$ 99,96 (−0,03) | soma R$ 99,99 |

A divisão agora é feita em centavos inteiros e o resto vai para as primeiras
parcelas — convenção do mercado brasileiro e a que garante que quem quita
antecipadamente já pagou proporcionalmente mais, nunca menos.

### 2. Parcelas puravam meses inteiros

`setMonth()` sobre dia 31 transborda: 31/01 + 1 mês vira 03/03, não 28/02.

```
Compra em 31/01/2026, 5x
ANTES : 31/01 | 03/03 | 31/03 | 01/05 | 31/05   ← fev e abr sem parcela; mar e mai com duas
DEPOIS: 31/01 | 28/02 | 31/03 | 30/04 | 31/05
```

### 3. Recorrências derivavam para sempre (backend)

O mesmo transbordo no `recurring.worker.js`. Como a data nova vira a base do
ciclo seguinte, um aluguel do dia 31 passava a ser cobrado dia 3 depois do
primeiro ciclo — e ficava assim. Agora doze ciclos consecutivos a partir do dia
31 caem em doze meses distintos, sempre no último dia disponível.

### 4. Lançamentos após as 21h iam para o dia seguinte

`new Date().toISOString().split('T')[0]` devolve a data em **UTC**. Em
America/Sao_Paulo (UTC−3), qualquer registro depois das 21h recebia a data de
amanhã — no extrato, no orçamento do mês e no gráfico.

Centralizado em `UTILS.dataLocalIso()` e aplicado em 9 pontos: data padrão do
formulário, chips de data, baixa de conta a pagar, alerta de "sem lançamento
hoje", OCR, aprendizado, lembrete diário e início de recorrência.

> Este bug estava ativo no ambiente em que a auditoria rodou (21h28, horário de
> Brasília). Não é hipotético.

### 5. "Uber 32,90" era gravado como R$ 90,00

O parser fazia `split(/[\s,]+/)`, tratando a vírgula como separador de tokens.
`"32,90"` virava `['32','90']`, ambos casavam com `/^\d+$/` e o **último** vencia.

| Entrada | Antes | Depois |
|---|---|---|
| `Uber 32,90` | R$ 90,00 | R$ 32,90 |
| `Mercado 149,90` | R$ 90,00 | R$ 149,90 |
| `ifood 45,00 nubank` | R$ 0,00 | R$ 45,00 |
| `aluguel 1.250,00` | — | R$ 1.250,00 |
| `carro 45.000` | — | R$ 45.000,00 |

Agora só o espaço separa tokens, e `PARSER._paraNumero()` desambigua ponto de
milhar de ponto decimal (milhar = grupos de exatamente 3 dígitos até o fim).
O primeiro número da frase vence, então "paguei 32,90 no uber 2x" não é
sobrescrito pelo `2`.

### 6. Testes que passavam por acidente

Dois problemas de isolamento, ambos do tipo que ensina a ignorar falha vermelha:

**`tests/parser.test.js`** montava as expectativas com `toISOString()` — o mesmo
idioma defeituoso do código. Depois das 21h os dois erravam junto e o teste
passava. Trocado por data local.

**`tests/backend/setup-backend.js`** fazia `delete process.env.STRIPE_SECRET_KEY`,
mas `backend/config.js` chama `import 'dotenv/config'` **depois** — e o dotenv,
que só respeita valores já definidos, repunha a chave a partir do `.env` real da
máquina. Os quatro testes de "Stripe não configurado devolve 503" falhavam para
quem tinha Stripe configurado e passavam no CI. Resolvido apontando
`DOTENV_CONFIG_PATH` para um arquivo inexistente durante os testes.

---

## Arquivos alterados

**Novos**

- `js/core/utils.js` → `dividirEmParcelas()`, `addMesesClamp()`, `dataLocalIso()`
- `tests/parcelas-datas.test.js` — 19 testes
- `tests/parser-decimal.test.js` — 23 testes

**Corrigidos**

| Arquivo | Mudança |
|---|---|
| `js/modules/init-form.js` | parcelamento + preview + data padrão + chips |
| `js/parser.js` | tokenização, `_paraNumero()`, `_iso()` |
| `js/contas-pagar.js` | `_addMes()` com clamp, data local na baixa |
| `backend/workers/recurring.worker.js` | `addMonths()` com clamp, hora preservada |
| `js/ai-engine.js`, `js/ocr.js`, `js/aprendizado.js`, `js/utilities/daily-reminder.js`, `js/modules/init-config.js` | data local |
| `tests/parser.test.js` | expectativas em data local |
| `tests/backend/workers.test.js` | 3 testes novos de calendário |
| `tests/backend/setup-backend.js` | isolamento do `.env` |

---

## Comportamento preservado deliberadamente

Ao corrigir o `parseData` alterei sem necessidade a regra de dia da semana
(`"segunda"` numa segunda-feira passaria a significar *hoje*). Um teste
existente documentava a decisão original — sempre para trás, mínimo um dia — e a
mudança foi **revertida**. A regra continua como estava.

---

## Nota sobre o desempenho da suíte

A auditoria registrou "suíte frontend acima de 3 minutos". **Estava errado.**
A lentidão era do sistema de arquivos montado da minha sandbox, não do projeto.
Rodando em disco local: **852 testes frontend em ~9 s** e 346 backend em ~25 s.
O item foi removido da lista de problemas.

---

## Próximo: Fase 2 — reconectar o que já existe

1. Auditar as 15 âncoras de DOM órfãs (religar ou remover)
2. Reintroduzir a entrada rápida no HTML — agora com o parser correto
3. Ancorar o botão de OCR
4. Renderizar `insights` no dashboard
5. Decidir o destino do event bus (624 LOC sem assinantes)
