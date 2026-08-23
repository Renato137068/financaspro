# Design System — Sobra

Referência de uso dos tokens visuais. A fonte da verdade é
`css/design-system.css`; este documento explica **quando** usar cada coisa e
registra as decisões que já custaram caro para descobrir.

Tudo aqui é verificado no CI:

| Verificação | Comando | O que barra |
|---|---|---|
| Contraste WCAG | `npm run check:contrast` | par de cor abaixo de 4,5:1 |
| Dívida de literais | `npm run check:css` | cor ou tamanho fora do token |
| Acessibilidade estática | `npm run check:a11y` | rótulo, foco, cor como único sinal |

---

## Cor

### As três famílias, e por que elas existem

O erro que motivou esta seção: as cores semânticas vivas eram usadas como cor
de texto e reprovavam contraste — o botão de alerta ficava em **2,15:1**, contra
o mínimo de 4,5:1. Ao sol, num celular, o texto sumia.

**1. Tons vivos — só para preenchimento**

```css
--color-success   #10b981
--color-warning   #f59e0b
--color-danger    #ef4444
--color-info      #3b82f6
```

Use em: barra de progresso, ponto de legenda de gráfico, fundo de toast, borda.
São elementos não textuais, onde o critério WCAG é 3:1 — e todos passam.

**Nunca** use como `color:` de texto.

**2. Tons acessíveis — texto e botões**

```css
--color-success-text   /* 5,07:1 sobre branco */
--color-warning-text   /* 5,14:1 */
--color-danger-text    /* 6,47:1 */
--color-info-text      /* 5,17:1 */
```

Estes são **aliases que trocam com o tema**: no claro apontam para tons
escurecidos; no escuro, para os tons `-light`, que passam sobre
`--color-bg-dark-card`. O CSS de componente usa só o alias e a troca acontece
sozinha.

Para fundo de botão com texto branco, use a variante `-on-light`
(`--color-warning-on-light` etc.), que é o valor fixo do tema claro.

**3. Neutros e marca**

`--color-gray-50` a `--color-gray-900`, `--color-primary-50` a `-900`.
A marca é `--color-primary-500` (#00723f), que dá 6,04:1 com texto branco.

### Regra prática

> Se a cor vai ficar atrás de letras, ou as letras vão ser dessa cor, use o
> token `-text` ou `-on-light`. Caso contrário, use o tom vivo.

### Cor nunca é o único sinal

WCAG 1.4.1. Os estados de orçamento — dentro, atenção, excedido — carregam
ícone distinto **e** texto para leitor de tela, além da cor. Cerca de 8% dos
homens não distinguem verde de vermelho; para eles, cor sozinha não comunica
nada.

O helper está em `js/components/_base.js`:

```js
UI._utils.badgeStatus('excedido', '112%')
// → <span class="status-excedido">
//     <i data-lucide="circle-alert" aria-hidden="true"></i>
//     <span class="sr-only">Orçamento excedido: </span>
//     <span>112%</span>
//   </span>
```

---

## Espaçamento

Escala em múltiplos de 4px, de `--space-0` a `--space-16` (64px).

Use o token, não o valor. `padding: var(--space-4)` em vez de `padding: 16px` —
quando a escala mudar, tudo acompanha.

---

## Tipografia

`--font-size-2xs` (10px) a `--font-size-4xl` (36px); pesos de
`--font-weight-normal` (400) a `--font-weight-extrabold` (800).

Há **119 `font-size` em px cru** no CSS — dívida registrada em `.css-debt.json`.
O teto só pode diminuir: `npm run check:css` falha se subir.

---

## Tema claro e escuro

O tema segue esta ordem:

1. Escolha explícita do usuário (`config.tema`), se houver
2. Preferência do sistema (`prefers-color-scheme`)
3. Claro

**Duas implementações precisam concordar:**

- `js/pin-guard.js` resolve o tema **antes do primeiro paint**. Sem isso, quem
  usa modo escuro leva um flash branco a cada abertura. Seria caso de `<script>`
  inline, mas a CSP é `script-src 'self'` — por isso mora num arquivo
  bloqueante.
- `CONFIG_USER.temaEfetivo()` resolve o tema no runtime.

Se divergirem, o tema pisca na transição. Há teste estático garantindo que a
regra é a mesma nos dois.

Trocar o tema manualmente grava a escolha e o app **para** de seguir o sistema.
Uma escolha explícita nunca é sobrescrita.

---

## Alvo de toque

Mínimo de 44×44px em dispositivo de toque (WCAG 2.5.5), via
`@media (pointer: coarse)` em `css/utilities/ux-polish.css`.

A regra é por media query, não por lista de classes, de propósito: uma
allowlist esquece todo botão novo. No desktop, com mouse, forçar 44px
distorceria o layout sem ganho — por isso a restrição ao ponteiro grosso.

---

## Estados de UI

Todo fluxo que carrega dado precisa dos três:

| Estado | Onde |
|---|---|
| Vazio | `UI.EmptyState` |
| Carregando | `css/features/skeleton.css` |
| Erro | `UTILS.mostrarToast(msg, 'error')` |

Ação que passa de um segundo usa `UTILS.comCarregamento(botao, acao, rotulo)`:
desabilita o botão, marca `aria-busy` e restaura ao fim — **inclusive quando a
ação falha**. Deixar o botão travado depois de um erro troca um bug por outro.

Sem isso, exportação e importação sofrem clique duplo, e num app financeiro
isso gera lançamento duplicado — bug que o usuário só descobre ao conferir o
extrato.

---

## Adicionando um token

1. Nome **semântico**, não descritivo: `--color-danger`, não `--vermelho`.
   Descritivo mente no tema escuro.
2. Se for cor de texto ou fundo de botão, rode `npm run check:contrast` — e
   adicione o par em `PARES_CLARO`/`PARES_ESCURO` do script, senão ninguém
   verifica.
3. Se substituir literais existentes, `npm run css:tokenize` troca apenas os
   hex **idênticos** ao token. Aproximação de cor parecida é proibida: mudaria
   a aparência sem revisão visual.
4. Baixou a dívida? `npm run check:css:update` trava o novo teto.

---

## O que este documento não cobre

Hierarquia visual, densidade de tela e fluxo de navegação não se avaliam lendo
CSS. A auditoria em `docs/auditoria-ui-ux-2026.html` declara essa limitação e
mantém o teste com cinco usuários como item obrigatório — é o que alcança o que
a análise estática não alcança.
