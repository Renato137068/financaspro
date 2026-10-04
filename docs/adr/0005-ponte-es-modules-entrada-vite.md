# ADR 0005 — ES Modules entram por uma ponte, empacotados pelo Vite

- **Status:** aceito
- **Data:** 2026-09-27
- **Complementa:** [ADR 0002](0002-migracao-frontend-es-modules.md)

## Contexto

O ADR 0002 decidiu migrar o frontend para ES Modules módulo a módulo, mas não
disse como um módulo migrado convive com os ~90 scripts clássicos que ainda
o leem como global, nem como ele chega ao build. Até 27/09/2026 nenhum
arquivo tinha migrado.

Três restrições pesavam:

- **Os scripts clássicos leem os módulos pelo nome** (`BUDGET_SERVICE.avaliar`,
  `CATEGORIA_VISUAL.icone`). Converter um módulo não pode exigir converter
  todos os seus leitores no mesmo commit.
- **O build empacota os scripts clássicos com `scripts/bundle-app.cjs`**, que
  concatena os arquivos na ordem do `index.html`. Concatenar `import`/`export`
  não funciona.
- **A cobertura dos testes depende de rodar cada arquivo via `vm` com o nome
  real** (tests/helpers/carregar-script.cjs, app-jsdom.cjs), porque a
  cobertura V8 soma as execuções por posição de caractere. Transpilar o
  módulo antes de rodar mudaria as posições.

## Decisão

1. **Uma entrada: `js/esm/ponte.js`**, carregada por
   `<script type="module">` logo depois do coletor de erros
   (`observability.js`). Ela importa os módulos migrados e publica cada um em
   `window`, para os scripts clássicos.
2. **Módulo migrado não lê global de script clássico no carregamento**, só
   dentro de funções. A ponte roda antes do resto do app, no desenvolvimento
   e no build. Dependência entre módulos migrados é `import`, nunca global.
3. **O Vite empacota a entrada** (`js/index-<hash>.js`, no `<head>`).
   `bundle-app.cjs` ignora `type="module"` e apaga do `dist/` as cópias cruas
   do grafo. O orçamento do bundle soma `app.bundle.js` e a entrada ESM num
   teto só: migrar não abre espaço.
4. **Os testes convertem o módulo em script do mesmo tamanho**
   (`tests/helpers/esm-como-script.cjs`): `import`/`export` viram espaços e os
   imports são carregados antes, no mesmo contexto. As posições não mudam, e a
   cobertura continua certa. O conversor aceita só um subconjunto de sintaxe e
   recusa o resto com erro.
5. **O grafo sai do `index.html`** (`scripts/lib/esm-grafo.cjs`): ESLint
   (`sourceType: module` e `no-unused-vars` ligado), lista de globais,
   service worker de desenvolvimento e build leem a mesma fonte.
6. **O placar muda de lugar.** A lista de globais agora é gerada
   (`config/frontend-globals.json`), então o placar do ADR 0002 passa a ser a
   ponte: cada nome publicado em `window` é um leitor clássico que ainda não
   migrou. Quando um nome deixar de ter leitor clássico, sai da ponte.

`tests/esm-fundacao.test.js` trava as regras: todo arquivo com
`import`/`export` está no grafo, nenhum é carregado como script clássico ou
chunk lazy, e a conversão preserva as posições.

## Primeira fatia

`CATEGORIA_VISUAL`, `TRANSACTION_SERVICE`, `BUDGET_SERVICE` (que passa a
importar o `TRANSACTION_SERVICE` em vez de procurá-lo no global) e
`INSIGHT_ACOES`. Foram escolhidos por não tocarem o DOM no carregamento e por
já terem teste com o módulo real.

## Consequências

- Um módulo novo nasce ES Module e entra pela ponte, sem tag nova no
  `index.html` nem posição na ordem dos scripts.
- Enquanto a ponte existir, os migrados continuam globais: o ganho imediato é
  a dependência explícita entre eles e o lint de módulo, não o fim dos globais.
- Chunks lazy continuam só para scripts clássicos. Um módulo migrado que
  precise de carregamento sob demanda usa `import()` dinâmico, e isso exige
  ampliar o conversor dos testes antes.
- O teste de um módulo migrado ainda passa pelo `vm`, não por `import` direto
  como o ADR 0002 previa: a cobertura exige o arquivo rodando com o nome real
  e sem transpilação que mude posições.

## Alternativas consideradas

- **Converter com esbuild para IIFE e concatenar no `app.bundle.js`.**
  Manteria um arquivo só, mas deixaria o formato de módulo como detalhe do
  empacotador próprio, justamente o que o Vite já resolve.
- **Transformar ESM no Jest com o transform do Babel ou do esbuild.** O Jest
  mapearia a cobertura pelo source map, mas só para arquivos carregados por
  `require`; o app inteiro (app-jsdom.cjs) roda os arquivos via `vm`, e as
  duas medições deixariam de somar no mesmo arquivo.
- **Uma tag `type="module"` por módulo.** Espalharia a ordem de carregamento
  de novo pelo `index.html`, que é o acoplamento que o ADR 0002 quer tirar.
