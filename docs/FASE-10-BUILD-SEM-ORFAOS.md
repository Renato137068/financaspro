# Fase 10 — O build para de embarcar o que ninguém pede · concluída

**Resultado:** **1,29 MB removidos de cada build** (914 KB de JS + 374 KB de CSS).
1.209 testes frontend e 346 backend passando. Lint sem erros. Contraste, XSS,
tokens de CSS e orçamento de bundle sem regressão.

---

## Antes: o CSS de 240 KB não era o problema

O plano era atacar os 240 KB de CSS. Ao medir, o quadro era outro — o Vite já
concatena os 38 arquivos num único `dist/css/index-<hash>.css`, e o waterfall de
`@import` que eu esperava encontrar não existe em produção.

O problema estava um nível acima: **o que o build deixa para trás.**

`copy-static.cjs` copia `js/` e `css/` crus para `dist/`. Isso é necessário —
`bundle-app.cjs` lê `dist/js/*.js` para concatenar; são a *entrada* do bundler.
O que ninguém fazia era apagá-los depois. Terminado o empacotamento, aqueles 92
arquivos JS e 38 CSS viram cópia morta do que já está dentro de
`app.bundle.js` e de `index-<hash>.css`.

## Por que isso custa, se o navegador não os baixa

Duas razões, e a primeira é concreta para o usuário:

**1. O APK.** `npm run android:sync` empacota `dist/` inteiro dentro do
aplicativo. Cada byte órfão é um byte que o usuário baixa da loja e guarda no
telefone para sempre. 1,29 MB num app cujo código útil são 1,1 MB — quase
metade do peso era cópia.

**2. Divulgação de código-fonte.** Os bundles são minificados; as cópias cruas
não. Elas serviam a estrutura inteira do app em texto claro — inclusive os
comentários desta auditoria descrevendo onde estavam os bugs.

---

## Por que não bastava "apagar o que nada referencia"

Dois grupos são alcançados por caminho **montado em tempo de execução** e não
aparecem em nenhuma busca textual:

```js
s.src = 'js/lazy/' + chunk + '.bundle.js';   // js/core/lazy-load.js
s.src = 'js/vendor/lucide-full.min.js';      // js/lucide-init.js, só se faltar ícone
```

Uma varredura ingênua os classificaria como órfãos. Apagá-los quebraria
previsão, relatórios, billing, 2FA, Open Finance e o fallback de ícones — em
produção, **em silêncio**, porque todos estão atrás de guardas
`typeof X !== 'undefined'` que engolem a ausência. É o mesmo padrão de falha
invisível que a auditoria original encontrou em 15 lugares.

Por isso o purge não adivinha. Ele apaga exatamente `bundlable` — a lista do que
o próprio `bundle-app.cjs` leu e inlineou. Conhecimento de quem consumiu, não
heurística de quem observa.

---

## A rede de segurança

`scripts/check-dist-orphans.cjs` roda **no fim do `npm run build`** e falha se
sobrar qualquer `.js` ou `.css` sem quem o peça. A alcançabilidade em runtime é
**declarada**, não inferida, e `tests/dist-orphans.test.js` (14 testes) verifica
que cada padrão declarado corresponde ao código que monta aquele caminho — se
alguém renomear o esquema dos chunks, o teste falha antes de o purge apagá-los.

Ficou fora do `test:ci` de propósito: lá ele avaliaria o `dist/` antigo do
repositório e falharia por artefato velho, não por defeito. No `build`, valida o
que acabou de produzir.

---

## O que o verificador achou na primeira execução

`js/core/sync-merge.js` sobreviveu ao purge — não era entrada do bundler porque
**nenhum `<script>` o carrega**.

Investigando: o módulo tem 14 testes passando, está documentado em
`docs/melhorias-aplicadas.html` como a correção de três bugs de perda de dados
na sincronização (D1 pendentes, D2 tombstones, D3 merge por registro) — e
**nada no app o chama**. Não há outro código de merge no cliente. Ele é a única
implementação, e está desligada.

Isso não é ruído: é a mesma classe de defeito da auditoria original —
funcionalidade que existe e parece saudável — só que invertida. Aqui o código
existe, é testado e **conta como coberto no relatório de cobertura**; o que
falta é o ponto de entrada.

O app roda hoje em modo local (`DADOS._modoLocal`), então isso é base preparada
para quando o pull do servidor for ligado. A decisão: **não embarca enquanto não
houver quem o chame**, registrado numa lista `SEM_PONTO_DE_ENTRADA` que exige
justificativa por item.

> Ele também carrega `v instanceof Date` — o mesmo erro entre realms que já
> apareceu três vezes nesta auditoria. Não corrigi: mexer num módulo desligado
> seria mudar código que ninguém executa. Fica anotado para quando o sync for
> ligado.

---

## Correção de um efeito colateral

`tests/security-static.test.js` lia `dist/sw.js` sem verificar se existe. Num
clone recém-feito, sem build, estourava `ENOENT` — que se lê como "a segurança
quebrou", quando é "não há build para inspecionar". Virou `describe` condicional
(aparece como **pulado**, não passa calado) e ganhou duas verificações novas:
que o SW não precacheia fonte crua, e que **toda** URL do precache existe de
fato — `cache.addAll` rejeita tudo por causa de um único 404, e o app perderia o
modo offline inteiro sem avisar.

---

## Números

| | Antes | Depois |
|---|---:|---:|
| JS + CSS em `dist/` | 2.427 KB | **1.140 KB** |
| Arquivos servidos | 8 | 8 |
| Arquivos órfãos | 134 · 1.330 KB | **0** |

O que é servido não mudou — nem um byte a menos chega ao navegador. O que mudou
é o que deixa de ser embarcado no APK e exposto no servidor.

---

## Arquivos

| Arquivo | Mudança |
|---|---|
| `scripts/check-dist-orphans.cjs` | **novo** — gate do build |
| `tests/dist-orphans.test.js` | **novo** — 14 testes da alcançabilidade |
| `scripts/bundle-app.cjs` | purga o que inlineou + `SEM_PONTO_DE_ENTRADA` |
| `scripts/copy-static.cjs` | purga o CSS cru antes do `generate-sw-cache` |
| `tests/security-static.test.js` | skip visível + 2 verificações do precache |
| `package.json` | `check:dist`; gate no fim do `build` |

---

## Uma correção do que eu disse antes

Na Fase 6.2 relatei o ganho do lazy-load como **estimativa**, porque o build não
rodava aqui (`@fontsource/inter` ausente). Instalei os dois pacotes e **o build
roda** — os números desta fase são medidos, não estimados. A estimativa anterior
(~25 KB de 435 KB) pode ser conferida agora: `app.bundle.js` tem 433 KB e os
chunks lazy somam 39 KB, então o eager caiu de ~472 KB para 433 KB.

Também errei o alvo ao apontar "CSS de 240 KB" como o maior ganho técnico
pendente. O CSS já estava bundlado; o desperdício estava no que sobrava do
build. Levantar a medição antes de agir mudou completamente o que valia fazer.

---

## Estado do roadmap

| Item | Situação |
|---|---|
| Fases 1–9 | ✅ |
| Peso do build / APK | ✅ **esta fase** |
| CSS: 240 KB num arquivo só | ⬜ agora é sobre **regras não usadas**, não sobre entrega — exige teste visual |
| Estado duplicado STORE/DADOS | ⬜ dívida técnica |
| `sync-merge.js` sem ponto de entrada | ⬜ **achado novo** — ligar o sync é projeto próprio |
| Dois modelos de conta | ⬜ só vale junto de uma feature que precise |
| Fronteira grátis/pago | ⬜ **decisão de produto** |
| E2E de navegador | ⬜ exige `npx playwright install` |

O próximo item de melhor retorno mudou: não é mais o CSS, é **decidir o que
fazer com o sync** — há uma camada testada e desligada, e enquanto ela estiver
assim o app não tem sincronização entre dispositivos, embora o código para isso
exista e pareça pronto.
