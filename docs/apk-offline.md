# Offline no APK (Capacitor) vs PWA web

> Escopo: o que o beta da Play Store **realmente** faz offline.
> Atualizado: 9 set 2026.

## Resumo em uma frase

No **APK Android**, o Service Worker é **desligado de propósito**; offline =
dados já salvos no aparelho (`localStorage` / IndexedDB) + sessão persistida.
Não é o mesmo modelo da **PWA no navegador**, que usa `sw.js` (shell + SWR).

## Por que o SW some no nativo

`js/sw-register.js` detecta `Capacitor.isNativePlatform()` e:

1. não registra o SW;
2. desregistra registros legados;
3. limpa caches.

Motivo: SW cacheando `index.html` antigo quebrava CSP/Auth Supabase e
interceptava fetch da nuvem com corpo `"Offline"`.

## O que funciona sem internet (APK)

| Ação | Offline? |
|------|----------|
| Abrir app (já logado) | Sim, se sessão em `localStorage` |
| Ver Resumo / Extrato / Orçamento já carregados | Sim (cache local) |
| Criar/editar lançamento | Sim localmente; sobe na próxima sync |
| Assinar / cancelar / Play Billing | Não (precisa Google / rede) |
| Login novo / sync pull completo | Não |

Indicador: `js/utilities/sync-indicator.js` mostra falha/pendente quando a
fila não sobe (`SYNC_FALHAR`).

## O que testar no beta (checklist)

1. Modo avião → abrir app → lançamentos antigos visíveis.
2. Criar lançamento offline → banner/indicador de sync → voltar online →
   item na nuvem (outra sessão / web).
3. Não esperar “instalar PWA” nem “abrir sem instalar” no APK — isso é web.

## Copy / Console

- Data Safety e `privacidade.html` já falam em cópia local + sync com login.
- Não prometa “PWA offline completa” na ficha da Play para o AAB Capacitor.
