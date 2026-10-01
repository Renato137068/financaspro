# ADR 0006 — Telas usadas só por um chunk lazy saem do index.html

- **Status:** aceito
- **Data:** 2026-09-27

## Contexto

O `index.html` tinha 113 KB, quase todo de markup de telas. Ele entra no
precache e é o primeiro arquivo que o aparelho baixa e interpreta, mesmo que a
pessoa nunca abra o Orçamento ou a Ajuda. O JS dessas telas já vinha sob
demanda (chunks lazy); o markup, não.

Nem toda tela pode sair. Várias sub-telas do Perfil têm elementos que o núcleo
lê no boot (o switch de tema, o PIN, a biometria, o 2FA, o plano), e o Extrato
é tocado pelo billing, pelos atalhos e pelo dashboard. Tirar essas telas
exigiria que cada leitor soubesse esperar o markup chegar.

## Decisão

1. **Sai só a tela cujos IDs apenas o próprio chunk usa.** Nesta primeira
   leva: Orçamento (`orcamento`) e, no chunk `config`, Categorias, Ajuda,
   Suporte e Editar perfil.
2. **A fonte é HTML:** `telas/<chunk>/<tela>.html`. `scripts/generate-telas.cjs`
   gera `js/telas/<chunk>.js`, que chama `TELAS.registrar(tela, markup)`. O
   arquivo gerado fica no repositório; `npm run check:telas` (no CI) falha se
   ele estiver defasado, como a lista de globais.
3. **O markup viaja com o chunk.** `js/telas/<chunk>.js` é o primeiro item do
   chunk em `LAZY_CHUNKS` e vem antes dos scripts da tela no `index.html`.
   Nada de `fetch` separado: sem build, dev e testes (app-jsdom) carregam o
   script no boot como qualquer outro; no build, ele chega junto do JS da tela
   e com a mesma regra de cache offline do chunk.
4. **O `index.html` guarda a casca** (`<div id="aba-<tela>" class="aba"
   data-tela="<tela>" aria-busy="true">`), então a navegação por abas, o
   `EVENT_BUS` delegado na casca e o `aria-busy` funcionam antes do markup.
5. **`TELAS` (`js/core/telas.js`, ES Module)** preenche a casca, tira o
   `aria-busy`, desenha os ícones e dispara `fp:tela-carregada` no
   `document`. Quem liga algo dentro de uma tela lazy no boot escuta esse
   evento (hoje: o teclado do tablist do Orçamento).

## Consequências

- `index.html`: 113 → 86 KB no fonte, 110 → 82 KB no build; precache
  1302 → 1275 KB. Os tetos do orçamento descem junto (85 e 1280 KB).
- Testes que conferem markup leem `tests/helpers/index-com-telas.cjs`, que
  devolve o `index.html` com as cascas preenchidas.
- O subset do lucide passa a varrer `telas/`: no JS gerado as aspas vêm
  escapadas e os ícones das telas ficariam de fora, puxando a lib completa.
  `e2e/chunks-lazy.spec.cjs` confere que abrir essas telas não baixa o
  `lucide-full`.
- Uma tela nova usada só por um chunk nasce em `telas/`. Mover uma tela que o
  núcleo toca no boot exige, antes, que cada leitor escute
  `fp:tela-carregada`.

## Alternativas consideradas

- **`fetch('telas/x.html')` ao abrir a tela.** Um pedido a mais por tela, e
  sem rede na primeira abertura a tela ficaria vazia mesmo com o chunk em
  cache. Dev e build também divergiriam.
- **Injetar as telas no `index.html` só em desenvolvimento (plugin do Vite).**
  O servidor local sem Vite, o E2E do código-fonte e o app-jsdom veriam
  outra coisa.
- **Markup direto em string dentro do JS.** Evita o gerador, mas perde o
  realce e a leitura como HTML, que os testes de acessibilidade usam.
