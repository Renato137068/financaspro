# Experimento da ficha: ícone

Achado A7 da auditoria de ASO de 04/out
(`docs/auditorias/auditoria-play-store-aso-2026-10-04.html`): o "$" sozinho é o
símbolo de muitos apps de finanças e, para o brasileiro, lembra dólar. A
auditoria recomenda não trocar no escuro: testar uma variação contra o ícone
atual e deixar o Google mostrar qual converte mais.

| Variação | Arquivo |
|---|---|
| A (atual) | `icons/icon-512.png` |
| B ("R$") | `icone-b-rs-512.png` (fonte: `icone-b-rs.svg`) |

A variação B mantém tudo do ícone atual (verde, cantos, quadrado claro
vazado) e troca só o símbolo. Continua legível em 48 px, o tamanho da lista de
busca.

## Como rodar (Play Console)

1. *Crescimento → Experimentos da ficha da loja → Criar experimento*.
2. Tipo: **padrão**, idioma Português (Brasil), atributo **Ícone do app**.
3. Variante: suba `icone-b-rs-512.png`. Público: 50% para a variante.
4. Métrica: **instalações de usuários novos retidos** (1 dia), que pesa
   mais que instalação pura.
5. Deixe rodar pelo menos **7 dias** e até o Console indicar resultado com
   confiança. Um experimento por vez: a auditoria sugere testar antes a
   descrição curta (as duas alternativas estão em `docs/play-store-ficha.md`).

## Se a variação B vencer

O ícone do app é gerado de `icons/logo.svg` por `npm run icons:generate`
(também gera o adaptativo, o monocromático do Android 13+ e o de
notificação). Trocar o símbolo em `logo.svg`, `logo-simbolo.svg` e
`logo-mono.svg` pelo desenho de `icone-b-rs.svg` e regenerar; o ícone da loja
muda no Console.
