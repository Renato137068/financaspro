# Fase 6 — Pagamento de fatura e performance · concluída

**Resultado:** 1.136 testes frontend (+39) e 346 backend passando. Lint sem
erros. Cobertura, contraste WCAG AA, sinks de XSS e dívida de CSS sem regressão.

---

## 1. A hipótese saiu de dentro do cálculo

A Fase 5 entregou o ciclo de fatura com uma suposição embutida: **fatura vencida
foi paga**. Era a hipótese menos enganosa disponível — o contrário mostraria o
limite preso para sempre — mas continuava sendo uma suposição silenciosa sobre
dinheiro, e errava nos dois extremos:

| Situação | O que o app fazia |
|---|---|
| Pagou antes do vencimento | Ficava dias mostrando limite consumido que já estava livre |
| Não pagou (atrasou) | Mostrava limite disponível que a pessoa não tem, sem comentar nada |

A saída não foi trocar uma suposição por outra. Foi **deixar confirmar** e —
quando não houve confirmação — **dizer que não sabe**, em vez de fingir que sabe.

### Como ficou

- **Fatura confirmada como paga** sai do limite na hora, mesmo antes de vencer.
  Quem quita dia 20 uma fatura que vence dia 28 vê o limite voltar no dia 20.
- **Fatura vencida sem confirmação** continua *fora* do cálculo — travar o limite
  de quem simplesmente não usa o recurso seria pior — mas aparece na interface
  como pergunta: *"Fatura de junho/2026 · R$ 1.000,00 — foi paga?"* com um botão
  de confirmar.

A lista de não confirmadas é limitada às três mais recentes. Ela existe para
provocar uma ação, não para virar um histórico que ninguém lê.

Cada fatura passou a ter estado explícito: `vazia`, `aberta`, `paga` ou
`nao-confirmada`.

---

## 2. Performance — o que foi feito e o que isso vale

### Code splitting da aba de configurações

`billing`, `2FA` e `open-finance` vivem exclusivamente na aba de configurações e
saíram do bundle eager para um chunk `conta`, carregado quando a aba abre.

**O risco aqui era grande e específico.** Os três eram inicializados no boot e
são referenciados atrás de `typeof X !== 'undefined'`. Sem um gatilho, eles
simplesmente não existiriam e as guardas silenciariam a ausência — exatamente o
tipo de falha invisível que a auditoria encontrou em 15 lugares na Fase 2.

Por isso o gatilho carrega o chunk **e chama o `init()` de cada módulo**: baixar
o arquivo não basta, sem `init()` o módulo existe e não se liga a nada — a aba
abre e não faz coisa alguma.

E por isso existe `tests/lazy-chunks.test.js`, que lê a lista de chunks direto do
bundler e exige, para cada um, que haja quem o carregue. Também verifica que o
`init()` acontece e que o carregamento vem antes do `refreshPerfil`.

> Nota: a primeira versão desse último teste falhou por medir posição de texto —
> e o meu próprio comentário explicativo mencionava `refreshPerfil` antes da
> chamada real. Um teste que lê prosa mede a prosa. Agora ele remove comentários
> antes de medir.

### `sourcemap: false` em produção

Publicar o mapa junto do bundle entrega o fonte original a qualquer visitante,
sem nenhum benefício para o usuário final.

### O ganho medido — e o que não deu para medir

**Não consegui rodar o build de produção nesta sessão**: `@fontsource/inter` não
está instalado no ambiente e a cadeia de build para no primeiro passo. Então o
número abaixo é **estimativa**, não medição:

```
chunk 'conta' (fonte, não minificado)   45,2 KB
estimativa após minificação (~55%)      ~25 KB
bundle eager                            435 KB  →  ~410 KB   (~6%)
```

**Seis por cento é modesto**, e vale dizer isso com todas as letras em vez de
apresentar o trabalho como se fosse mais do que é. O valor real desta parte é
tanto o padrão — existe agora um caminho seguro e testado para diferir features
— quanto os bytes.

### A oportunidade maior, que não foi tocada

O precache de primeiro acesso tem **955 KB**, dos quais:

| Item | Tamanho |
|---|---:|
| `js/app.bundle.js` | 435 KB |
| **CSS bundle** | **240 KB** |
| `index.html` | 78 KB |
| fontes + ícones | ~120 KB |

São 14 mil linhas de CSS carregadas de uma vez. É provavelmente o maior ganho
disponível — e é também mais arriscado, porque dividir CSS por rota sem um teste
visual confiável é como cortar no escuro. Fica registrado como pendência
consciente, não como esquecimento.

---

## Arquivos

**Novos**

| Arquivo | Conteúdo |
|---|---|
| `tests/fatura-pagamento.test.js` | 30 testes |
| `tests/lazy-chunks.test.js` | 9 testes |

**Alterados**

| Arquivo | Mudança |
|---|---|
| `js/cartoes.js` | pagamento de fatura, estado, não confirmadas, UI de confirmação |
| `js/modules/init-navigation.js` | `carregarChunkConta` + gatilho na aba de config |
| `scripts/bundle-app.cjs` | chunk `conta` |
| `vite.config.cjs` | `sourcemap: false` |
| `css/layouts/dashboard.css` | estilos das faturas pendentes |

---

## O que continua em aberto

| Item | Situação |
|---|---|
| **CSS de 240 KB** | Maior ganho de performance disponível; exige teste visual |
| **Recorrentes offline** | Só o worker BullMQ materializa — offline-first não cumprido |
| **Estado duplicado STORE/DADOS** | 29 usos fora do `actions.js` |
| **Tratamento de erros** | 20 `catch` vazios · 86 logs sem feedback |
| **Dois modelos de conta** | nome × id; com o cartão modelado, a migração tem destino claro |
| **Fronteira grátis/pago** | `canUse()` libera tudo para usuário local |
| **Assinaturas no comprometido** | Ainda fora do cálculo |

### Sugestão de próximo passo

**Recorrentes no cliente.** É o último item que contradiz um princípio declarado
do produto — "o app sempre funciona, auth é complementar" — e hoje um usuário
offline que cadastra "Aluguel mensal" nunca vê o lançamento aparecer. Precisa de
chave de idempotência (`recorrenteId + competência`) para não duplicar com o
worker do backend.
