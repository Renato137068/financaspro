# ADR 0003 — Precachear apenas o app shell no service worker

- **Status:** aceito
- **Data:** 2026-08-09

## Contexto

O `generate-sw-cache.cjs` montava a lista de precache varrendo `dist/js`,
`dist/css` e `dist/assets` inteiros. O resultado em produção:

| Item | Peso |
|---|---|
| `js/app.bundle.js` | 428 KB |
| **os mesmos 93 módulos, soltos** | ~600 KB |
| `js/vendor/lucide-full.min.js` | 390 KB |
| `css/index-[hash].css` | 233 KB |
| **os mesmos 40 CSS, soltos** | ~424 KB |
| **Total baixado no primeiro acesso** | **2.372 KB** |

Ou seja: o usuário baixava o código da aplicação **duas vezes** — uma vez
empacotado e uma vez em pedaços — e mais 390 KB de uma biblioteca de ícones que
só é usada como fallback caso o subset de 26 KB não resolva algum ícone.

Isso acontece antes de o app ficar utilizável, tipicamente em 4G. Pior: o
`install` do service worker usa `cache.addAll(...).catch(() => {})`, então se
qualquer uma das 142 URLs desse 404, o precache inteiro falhava em silêncio e o
modo offline simplesmente não existia — sem erro visível.

## Decisão

O precache lista **apenas o app shell**:

- `/` e `/index.html`
- os três scripts referenciados pelo `index.html` (`pin-guard`, `vendor.bundle`,
  `app.bundle`)
- o CSS empacotado pelo Vite
- `manifest.json`, `privacidade.html` e os ícones do PWA

Ficam **fora** do precache, por regra:

- módulos `js/` individuais — já estão dentro do bundle
- arquivos `css/` individuais — já estão dentro do bundle
- `lucide-full.min.js` — via `PRECACHE_BLOCKLIST` explícita
- chunks lazy (`previsao`, `relatorios`) — entram no cache em runtime

O handler de fetch já é *stale-while-revalidate* e guarda qualquer GET
same-origin bem-sucedido, então os chunks sob demanda passam a funcionar offline
a partir da primeira vez que o usuário abre a tela correspondente.

Resultado: **2.372 KB → 858 KB** no primeiro acesso, uma redução de 64%.

## Consequências

**Ganhos**

- Primeiro acesso 64% mais leve, sem perda de funcionalidade do app principal.
- `scripts/check-bundle-budget.cjs` e `tests/sw-precache.test.js` travam o ganho:
  o CI falha se o precache voltar a inchar ou passar de 1,1 MB.
- O teste também verifica que toda URL do precache existe em `dist/` —
  eliminando a falha silenciosa do `addAll`.

**Custos**

- Um usuário que instale o PWA e fique offline **antes** de abrir Relatórios ou
  Previsão não terá essas telas disponíveis. É aceitável: são features
  secundárias, explicitamente carregadas sob demanda, e o núcleo financeiro
  (lançar, ver saldo, extrato, orçamento) está 100% no shell.

**Passa a ser proibido**

- Adicionar varredura genérica de diretório à lista de precache.
- Subir os limites em `check-bundle-budget.cjs` sem justificar no mesmo commit.

## Alternativas consideradas

**Precachear tudo, como antes.** Garante offline total no primeiro acesso, ao
custo de 2,3 MB e do download duplicado. A duplicação não tem defesa: é bug, não
trade-off.

**Precache só do HTML, tudo o mais em runtime.** Mais leve ainda, mas quebra a
promessa central do produto — "o app sempre funciona" — para quem instala e
perde conexão logo em seguida.

**Workbox.** Resolveria com estratégias declarativas e boa gestão de revisão de
assets, mas adiciona uma dependência de build e uma camada de abstração a um
service worker de 90 linhas que já faz exatamente o necessário.
