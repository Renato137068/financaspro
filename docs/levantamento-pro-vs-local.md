# Levantamento: benefícios PRO vendidos vs modo local

Relatório somente leitura (Tarefa 5). **Regra de produto:** em modo 100% local, `BILLING.canUse()` e `BILLING.shouldEnforceLimits()` não bloqueiam — ver `js/billing.js:139-152`. O PRO pago hoje vale principalmente para **sync na nuvem sem limites** + recursos gated só quando `isCloudUser()`.

Legenda de ação:
- **(a)** Reescrever copy/UI para deixar claro que o benefício é na **nuvem** (ou “com login”).
- **(b)** Gate offline (bloquear também no modo local) — **fora de escopo** das fases atuais; listado só como opção.

---

## 1. Lista de features do plano Pro (paywall estático)

| Item vendido | Arquivo:linha | Grátis local? | Ação sugerida |
|---|---|---|---|
| Transações ilimitadas | `js/billing.js:58-59` | Sim — sem `guardQuota` offline | **(a)** “Ilimitado na nuvem”; local já é ilimitado |
| IA e previsão financeira | `js/billing.js:60` | Sim — `previsao.js:80` só bloqueia se `canUse` na nuvem | **(a)** “Previsão com IA na nuvem” |
| OCR de comprovantes | `js/billing.js:61` | Sim — `ocr.js:77-79` | **(a)** “OCR na nuvem” |
| Exportação e alertas avançados | `js/billing.js:62` | Sim — export `init-extrato.js:1295+`; alertas `alertas.js:26-27` | **(a)** Separar: export/alertas avançados **na nuvem** |
| Trial de 14 dias | `js/billing.js:63` | N/A (só assinatura) | OK |

Plano FREE estático já menciona “Dados locais offline” (`js/billing.js:51`) — bom contraste; falta espelhar no card Pro.

---

## 2. Copy do paywall (modal)

| Texto | Arquivo:linha | Problema | Ação |
|---|---|---|---|
| “O Pro tira os limites” | `js/modules/init-billing.js:125` | Implica limites globais; local não tem | **(a)** “O Pro tira os limites **na nuvem**” |
| “Contas ilimitadas, relatórios do ano inteiro e backup automático.” | `js/modules/init-billing.js:126` | Local: contas/relatórios/backup já livres | **(a)** Qualificar “na nuvem” / “com sync” |
| “Exportação disponível no plano Pro” (tooltip botões) | `js/modules/init-billing.js:91` | Export CSV/PDF funciona offline | **(a)** “Exportação na nuvem (plano Pro)” |

Paywall não abre sem nuvem (`init-billing.js:108-110`) — usuário local não vê o modal; o risco é **expectativa** ao ler marketing ou ao migrar para nuvem.

---

## 3. Onboarding e telas principais

| Texto | Arquivo:linha | Problema | Ação |
|---|---|---|---|
| “exporte um backup em Perfil › Dados” | `index.html:214` | Correto para backup JSON; pode confundir com export Pro do extrato | **(a)** “exporte backup” (já é backup, não CSV/PDF Pro) |
| “Histórico, filtros e exportação” (Extrato) | `index.html:634` | Export extrato bloqueado só na nuvem FREE | **(a)** “exportação (Pro na nuvem)” se usuário logado FREE |
| Subtítulo IA no formulário | `index.html:460` | IA de categoria funciona local | **(a)** Nenhuma se for NLP local; se for “previsão”, não confundir com `previsao.js` |

---

## 4. Gates de código (comportamento real)

| Feature | Gate | Arquivo:linha | Local |
|---|---|---|---|
| OCR | `!BILLING.canUse('aiFeatures')` | `js/ocr.js:77-79` | Liberado |
| Previsão IA | `!BILLING.canUse('aiFeatures')` | `js/previsao.js:80-88` | Liberado |
| Export CSV/PDF | `!BILLING.canUse('reportExport')` | `js/modules/init-extrato.js:1295, 1368` | Liberado |
| Alertas avançados | `!BILLING.canUse('advancedAlerts')` | `js/alertas.js:26-27` | Liberado |
| Quota tx/conta/orçamento | `guardQuota` + `shouldEnforceLimits` | `js/billing.js:148-152`, `init-form.js:1664`, `init-config.js:1254`, `orcamento.js:20` | **Não aplica** offline |

---

## 5. README e Play Store

| Fonte | Achado | Ação |
|---|---|---|
| `README.md:9` | “Extrato com filtros, exportação” — genérico, não distingue nuvem | **(a)** “exportação local; na nuvem FREE limitada, Pro ilimitada” |
| `android/.../strings.xml` | Só nome do app — sem claims Pro | OK |
| `docs/play-store/` | Screenshots visuais; sem copy de listing no repo | Revisar descrição na Play Console manualmente |

---

## 6. Auditoria de produto (HTML)

| Arquivo | Nota |
|---|---|
| `auditoria-produto-pos-fases.html` | Já documenta “Local: ilimitado” vs nuvem FREE (`linha ~192, 221`) — alinhado com código |
| Auditoria de produto (set/2026) | Substituída por `auditoria-produto-pos-fases.html` |

---

## 7. Resumo executivo

**Inconsistência principal:** marketing e `STATIC_PLANS` listam IA, OCR, export e ilimitado como benefícios Pro **sem qualificar “na nuvem”**, enquanto o código só enforce quando `isCloudUser()` (`js/billing.js:142-151`).

**Recomendação padrão (a):** ajustar strings em `js/billing.js` (features), `js/modules/init-billing.js` (título/lead/tooltip) e hints no Extrato — **sem** mudar comportamento local.

**Status:** copy **(a)** aplicada em 2026-09-01 (`billing.js`, `init-billing.js`, `init-extrato.js`, `init-navigation.js`, `ocr.js`, `previsao.js`, `index.html`, `README.md`).

**Opção (b)** — gate offline — aumentaria conversão Pro mas **viola** a regra de produto “modo 100% local permanece liberado”; não implementar sem decisão explícita.

---

*Gerado em 2026-09-01 · escopo Tarefa 5 (relatório apenas)*
