# Levantamento: o que é FREE, o que é PRO, e por quê

Relatório de produto — atualizado 2026-09-04 (v12, quota v2).

**Mudança de eixo.** Até a v11.3.13 o limite era de *volume de uso* (100
lançamentos/mês, 3 contas) e valia **só na nuvem**: em modo local
`shouldEnforceLimits()` retornava `false` e liberava tudo. O efeito era um
segundo plano gratuito, mais generoso que o da nuvem — criar conta piorava a
experiência do usuário, e o funil local → nuvem → pago tinha o incentivo
econômico apontando ao contrário.

Agora o limite é de **profundidade e automação**, e vale igual com e sem login.

> **Regra de produto:** o FREE nunca impede o usuário de registrar a vida
> financeira dele. O PRO faz o trabalho por ele.

---

## 1. O que muda para quem não faz login

O modo 100% local continua existindo e continua sendo a porta de entrada — é o
que ganhamos do Mobills e do Organizze, que perdem gente no muro de cadastro da
primeira tela. O que muda é que ele passa a ser **o mesmo plano gratuito**, não
um plano paralelo melhor.

| | Antes (v11) | Agora (v12) |
|---|---|---|
| Lançamentos | ilimitado local · 100/mês nuvem | **ilimitado em todo lugar** |
| Contas e cartões | ilimitado local · 3 nuvem | **5 em todo lugar** |
| Exportar CSV | livre local · bloqueado nuvem | **livre em todo lugar** |
| OCR | 5 usos **vitalícios** | **5 por mês**, renovando |
| Alertas avançados | livres local · bloqueados nuvem | PRO em todo lugar (com teaser) |
| Previsão / insights avançados | 5 usos local | PRO em todo lugar |
| Histórico de análise | ilimitado | **3 meses** no FREE |
| Backup na nuvem | — | **incluído no FREE logado**, 1 aparelho |

Logar deixa de tirar e passa a dar: backup automático e 14 dias de Pro de
boas-vindas, sem cartão.

---

## 2. Limites do FREE (fonte: `config/plan-limits.json`)

| Recurso | FREE | PRO |
|---|---|---|
| Lançamentos/mês | ilimitado | ilimitado |
| Contas e cartões | 5 | ilimitado |
| Orçamentos por categoria | 5 | ilimitado |
| Categorias personalizadas | 5 | ilimitado |
| Metas | 1 | ilimitado |
| Recorrentes | 3 | ilimitado |
| Contas a pagar | 5 | ilimitado |
| Gastos fixos | 5 | ilimitado |
| Anexos | 10 | ilimitado |
| Dispositivos sincronizados | 1 | ilimitado |
| Janela de análise | 3 meses | ilimitada |
| OCR | 5/mês | ilimitado |
| Membros | 1 | 2 |

Flags: `aiFeatures`, `advancedAlerts`, `openFinance`, `exportPdf`,
`learnedCategorization`, `futureInvoiceProjection`, `netWorthHistory` — todas
`false` no FREE, `true` no PRO.

`exportCsv` é `true` nos dois. Exportar o próprio dado é argumento de aquisição
("saia quando quiser") e a leitura correta da LGPD — nunca item de paywall.

---

## 3. A janela de análise não esconde dado

`BILLING.janelaAnalitica()` restringe **gráfico, relatório e comparativo**. Não
toca no extrato, na busca nem na exportação: o lançamento de janeiro continua
visível e exportável em outubro. Limite de análise é limite justo; esconder dado
que o usuário digitou é sequestro, e num app de finanças isso custa a confiança
que é o ativo da marca.

---

## 4. Onde cada gate mora no código

| Gate | Arquivo | Comportamento no FREE |
|---|---|---|
| Quotas de capacidade | `js/billing.js` → `checkQuota` / `guardQuota` | paywall contextual ao estourar |
| Janela de análise | `js/billing.js` → `janelaAnalitica` | 3 meses; extrato intacto |
| OCR | `js/ocr.js` + `BILLING.ocrRemaining` | 5/mês, renovando |
| Previsão | `js/previsao.js` | card de upsell |
| Insights avançados | `js/insights.js` | só os básicos |
| Alertas avançados | `js/alertas.js` | teaser "detectamos algo" |
| Open Finance | `js/open-finance.js` | paywall |
| Exportar PDF | `js/modules/init-extrato.js` | paywall (CSV livre) |
| Equipe | `js/billing.js` → `inviteTeamMember` | paywall |

**Não existe quota de transação.** O teto de 100/mês parava de aceitar os gastos
do usuário por volta do dia 15 — justamente do usuário intenso, que é quem
pagaria. O middleware `checkTransactionLimit` segue montado e contando por
`createdAt` (e não por `date`, que o usuário digita e que permitia burlar o teto
com data retroativa), mas fica inerte com `maxTransPerMonth` nulo: reintroduzir
um teto é mudar um dado, não reescrever enforcement.

---

## 5. Preços

| Plano | Mensal | Anual | Observação |
|---|---|---|---|
| Pro | R$ 16,99 | **R$ 129,99** (−36%) | tiers do Play; anual é o plano promovido |
| Business | R$ 79,90 | R$ 799 | fora do paywall (`SHOW_BUSINESS_PLAN: false`) |

O anual fica abaixo do Mobills Premium (R$ 99,90/ano), que é a âncora do mercado
brasileiro. Sem marca, cobrar acima do líder não converte.

Trials: **7 dias** no SKU da loja (Play/Stripe) e **14 dias** de Pro de
boas-vindas concedidos pelo backend na criação da conta, sem cartão. São coisas
distintas e convivem — o segundo é entitlement próprio, não assinatura da loja.

---

## 6. Paridade e guardas

| Fonte | Arquivo |
|---|---|
| Canônica | `config/plan-limits.json` |
| Frontend | `js/billing.js` → `PLAN_LIMITS` |
| Express | `backend/middleware/plan.js` (**lê** o JSON, não duplica) |
| Supabase | `supabase/migrations/*_quota_v2_*.sql` → `fp_plan_limit_config` |
| Edge | `supabase/functions/_shared/billing-constants.ts` |

Testes: `tests/plan-limits-parity.test.js` (JS ↔ JSON ↔ SQL),
`tests/backend/plan-limits-parity.test.js` (Express ↔ JSON, derivando os campos
do próprio canônico), `tests/billing.test.js`, `npm run check:billing`.

---

## 7. Instrumentação

`js/utilities/funil.js` emite os dez passos do funil via `OBS.track`, com marcos
únicos por aparelho e sem nenhum valor financeiro no payload. O envio depende de
`obsAnalyticsEnabled` + `obsEndpoint`: sem consentimento explícito, tudo fica no
buffer local.

Sem isto, toda decisão de preço e de limite é opinião — inclusive as deste
documento.

*Atualizado 2026-09-04 · quota v2 · limite por profundidade*
