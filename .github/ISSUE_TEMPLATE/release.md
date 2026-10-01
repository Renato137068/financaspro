---
name: Release
about: Checklist de uma versão do app (AAB) antes de promover na Play
title: "Release 11.x.y (versionCode NN)"
labels: release
---

## Versão

- `versionName`: 
- `versionCode`: 
- Commit / tag: 

## Antes do AAB

- [ ] CI verde no commit da tag (unitários, E2E, orçamento do bundle, `npm audit`)
- [ ] `npm run check:version` alinhado (package.json, build.gradle, cache do SW)

## Smoke em aparelho

Roteiro: [`docs/release/smoke-aparelho.md`](../../docs/release/smoke-aparelho.md). Um ✗ bloqueia a promoção.

| Bloco | Aparelho A (modelo / Android) | Aparelho B (modelo / Android) |
|---|---|---|
| 1. Abertura e recorte da tela | | |
| 2. Teclado no Novo lançamento | | |
| 3. Paywall | | — |
| 4. Modo avião | | |
| 5. Voltar e privacidade | | — |

Observações e falhas (com print ou gravação):

## Promoção

- [ ] Teste interno → fechado / produção, com as notas da versão
