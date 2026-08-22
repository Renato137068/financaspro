# Fase 2 — Reconectar o que já existe · concluída

Escopo: fazer funcionar código que já estava escrito, carregado em toda sessão e
que nunca executava. Nenhuma feature nova foi inventada.

**Resultado:** 868 testes frontend + 346 backend passando. Lint sem erros.
Contraste WCAG AA, sinks de XSS e dívida de CSS sem regressão.

---

## 1. A entrada rápida voltou a existir

`#entrada-rapida-input` não estava no `index.html`. O `setupEntradaRapida` saía
no primeiro `if` e cinco módulos — `PARSER`, `PIPELINE`, `SCORE`, `APRENDIZADO`,
`CATEGORIZADOR` — eram baixados em toda sessão sem nunca rodar.

O HTML tinha um comentário: *"Entrada rápida removida"*. O CSS (`.er-wrapper`,
`.er-input`, `.er-btn`, `.er-feedback`, inclusive as variantes de tema escuro)
nunca foi removido — só o markup. A leitura mais provável é que tenha sido
retirada por não ser confiável: enquanto o parser lia `"Uber 32,90"` como
R$ 90,00, a funcionalidade fazia mais mal que bem.

Com o parser corrigido na Fase 1, o campo foi restaurado. Ele **preenche** o
formulário; não grava nada. Todo campo continua editável e o `PIPELINE` respeita
`_manualSet` — o que o usuário digitou à mão nunca é sobrescrito.

## 2. OCR ficou alcançável

`OCR.init()` sempre foi chamado, mas `_injetarBotaoCaptura` procurava
`.er-wrapper` para pendurar o botão — o mesmo elemento ausente. Com o wrapper de
volta, o botão aparece.

Foi preciso um ajuste de CSS: `.er-btn` nasce com `opacity: 0` e só aparece com
o wrapper em foco, regra desenhada para o botão de confirmar. O de escanear é
ponto de entrada, não confirmação, então recebeu `opacity: 1`.

## 3. Insights chegaram ao dashboard

`insights.js` (380 linhas) procurava `#insights-container`, que não existia, e
caía no fallback `#orc-insights` — ou seja, a análise só era vista por quem
abrisse a aba de orçamento.

O container foi adicionado ao dashboard e `INSIGHTS.mostrar()` entrou no
`atualizarDashboard()`. Antes ele só era disparado depois de salvar uma
transação ou mexer na configuração.

As regras `.insight` existentes usam cores claras fixas (`#fff5f5`, `#ebf8ff`…)
e **não têm contraparte no `dark-mode.css`** — no tema escuro dariam texto claro
sobre fundo claro. As novas regras do container usam os tokens semânticos, que
já são definidos nos dois temas. Isso também evitou aumentar a dívida rastreada
por `check-css-tokens`.

## 4. Logout duplicado e quebrado removido

`INIT_CONFIG.setupLogoutButton` ligava-se a `#logout-btn` (inexistente) e
limpava `fp-user-token` / `fp-user-data` — chaves que o app **nunca gravou**;
as reais são `fp-api-token` e `fp-api-user`. Além de morto, se tivesse rodado
teria deixado a sessão real intacta, dando ao usuário a impressão de ter saído.

O logout que funciona é `authController.setupLogoutButton` (`#btn-logout`), que
chama `DADOS.encerrarSessao()`. O duplicado foi removido.

---

## 5. Dezenove ações executavam duas vezes por clique

Este não estava na auditoria — apareceu ao investigar o event bus.

O app tem **dois** sistemas de delegação de `data-action` ativos ao mesmo tempo:

- `EVENT_BUS` / `EVENT_INIT`, com listeners por container;
- `INIT_NAVIGATION`, com um listener no `document`.

Como o clique borbulha do container até o `document`, os dois recebem o mesmo
evento. Dezenove ações estavam declaradas nos dois:

```
abrir-changelog · abrir-config-bancos · abrir-editar-perfil · abrir-editar-renda
abrir-entrada-rapida · abrir-feedback · abrir-import · editar-renda-orcamento
exportar-dados · exportar-excel · exportar-pdf · filtro-tipo
gerenciar-categorias · limpar-dados · mudar-aba · navegar-periodo
salvar-renda-orcamento · toggle-detalhes-categorias · toggle-graficos
```

Para várias delas, rodar duas vezes não é inofensivo:

| Ação | Efeito da duplicação |
|---|---|
| `navegar-periodo` | anda **dois meses** por clique |
| `toggle-graficos` | abre e fecha — o painel nunca aparece |
| `exportar-excel` / `exportar-pdf` | dois downloads |
| `limpar-dados` | dois diálogos de confirmação |

### A decisão

Minha auditoria dizia "event bus morto, 624 LOC sem assinantes — remover".
**Estava errada.** Procurei por `emit`/`on` (pub/sub) quando o módulo é, na
verdade, delegação de DOM — e ele roda, via `lifecycle.js`.

Verificando antes de agir, seis ações existem **apenas** no `EVENT_BUS` e estão
em uso no HTML: busca avançada (abrir e aplicar), seleção em massa (deletar e
cancelar), limpar filtros e ordenação do extrato. Remover o módulo teria
quebrado tudo isso.

Então: **mantido o EVENT_BUS, removidas as 19 ações duplicadas dele.**
`INIT_NAVIGATION` fica como dono único — é a implementação mais completa, com
proteção contra clique duplo (`UTILS.comCarregamento`), tratamento de erro e
carregamento de chunks sob demanda.

Os namespaces `nav`, `dashboard` e `config` ficaram vazios e foram retirados do
`EVENT_INIT.setup()`. Sem isso, `initNamespace` receberia `undefined` e
`handlers[action]` estouraria a cada clique no container. O `initNamespace`
ganhou também uma guarda que falha fechado nesse caso.

Antes de remover, confirmei que nenhum dos botões afetados é um `<button>` sem
`type` dentro de um `<form>` — o `EVENT_BUS` chamava `preventDefault()` e a
remoção poderia ter passado a submeter formulário. Nenhum caso.

---

## Novos guardas de regressão

**`tests/ancoras-dom.test.js`** — 20 testes.
Foi assim que a entrada rápida ficou invisível por tanto tempo: o módulo carrega,
o `if (!el) return;` dispara, e nada quebra. Nenhum erro, nenhum teste vermelho.

O arquivo trava 16 âncoras críticas e, na varredura geral, exige que **todo** ID
ausente do HTML esteja declarado em `OPCIONAIS` com um motivo escrito. Um teste
extra garante que a lista não acumule entradas obsoletas.

**`tests/acoes-duplicadas.test.js`** — 3 testes.
Monta o `index.html` real, carrega os dois sistemas de delegação e exige
interseção vazia entre eles. Também verifica que todo namespace registrado no
`EVENT_INIT` tem mapa de handlers.

---

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `index.html` | entrada rápida restaurada; `#insights-container` no dashboard |
| `css/features/ia.css` | container de insights com tokens semânticos; `.ocr-btn` sempre visível |
| `js/core/event-bus.js` | 19 handlers duplicados removidos; 3 namespaces retirados; guarda em `initNamespace` |
| `js/init.js` | `INSIGHTS.mostrar()` no ciclo do dashboard |
| `js/modules/init-config.js` | logout duplicado removido |
| `tests/ancoras-dom.test.js` | novo |
| `tests/acoes-duplicadas.test.js` | novo |

---

## Deixado para depois, de propósito

Quatro âncoras órfãs continuam órfãs — todas com guarda `if (!el) return;` e
registradas em `OPCIONAIS` com motivo:

- `#contas-lista` — o módulo `CONTAS` (contas bancárias e cartões) **não tem
  interface nenhuma**. Não é um anexo faltando: é a tela inteira. Vai junto com
  "saldo por conta" na Fase 3 e com o modelo de cartão na Fase 7.
- `#orc-historico`, `#cfg-stat-*`, `#smart-description-suggestions`,
  `#sugestao-badge` — melhorias de UI sem urgência.
- `#import-area` (drag-and-drop opcional; `#import-file` funciona) e
  `#form-config` / `#form-orcamentos` (formulários legados) são intencionais.

---

## Próximo: Fase 3 — UX e as perguntas do dashboard

1. Saldo por conta (saldo inicial + derivado das transações)
2. Tipo `transferencia`, excluído dos agregados de receita/despesa
3. KPIs *Disponível para gastar* e *Comprometido*
4. Metas: aporte mensal necessário, projeção e diagnóstico de atraso
5. Hierarquia visual do dashboard — um número dominante, menos cards competindo
