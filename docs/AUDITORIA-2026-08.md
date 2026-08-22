# Auditoria FinançasPro v11.0 — Agosto/2026

> **Status:** Fases 1, 2 e 3 **concluídas**.
> — [`FASE-1-INTEGRIDADE-FINANCEIRA.md`](./FASE-1-INTEGRIDADE-FINANCEIRA.md): problemas **1 a 4** e **13**.
> — [`FASE-2-RECONEXAO.md`](./FASE-2-RECONEXAO.md): problemas **6, 7, 18** e a duplicação de ações descoberta depois.
> — [`FASE-3-UX-DASHBOARD.md`](./FASE-3-UX-DASHBOARD.md): problemas **9, 10, 17, 19** e um crash em `parser.js` com bancos cadastrados.
> — [`FASE-4-INTELIGENCIA.md`](./FASE-4-INTELIGENCIA.md): problema **20**, mais dois erros de cálculo que a auditoria não tinha visto — a projeção de fim de mês contava parcelas duas vezes (82% de erro) e o alerta de gasto incomum exibia z-score como se fosse múltiplo da média.
>
> **Duas correções ao próprio relatório:**
>
> 1. O problema **14** ("suíte frontend leva mais de 3 minutos") estava errado — a
>    lentidão era do sistema de arquivos montado da sandbox onde a auditoria
>    rodou, não do projeto. Em disco local a suíte roda em ~9 segundos.
>
> 2. O problema **11** ("event bus morto, remover 624 LOC") estava errado. Procurei
>    por `emit`/`on` quando o módulo é delegação de DOM, não pub/sub — e ele roda,
>    via `lifecycle.js`. Seis ações existem só nele e estão em uso. O que havia de
>    fato era pior e não estava no relatório: **19 ações executando duas vezes por
>    clique**, porque `EVENT_BUS` e `INIT_NAVIGATION` tratavam as mesmas. Corrigido
>    removendo a duplicação, não o módulo.

**Método:** leitura do código-fonte real (90 arquivos JS / 22.153 LOC frontend, 60+ arquivos backend, 14.023 linhas CSS, 60 suítes de teste), execução de testes, scripts de verificação (`check-xss-sinks`, `check-contrast`, `check-css-tokens`, `check-bundle-budget`) e reprodução isolada dos bugs em Node.

**Nenhum arquivo foi modificado.** Este documento é o pré-requisito da Etapa 20.

---

## A. Diagnóstico geral

# Nota global: **6,4 / 10**

O FinançasPro **não é um projeto amador**. O backend é de nível profissional (Prisma, RBAC, CSRF, rate limiting com Redis + fallback, lockout por conta, refresh tokens hasheados, cookies HttpOnly, TOTP, field-crypto, retenção, métricas protegidas, webhook Stripe registrado antes do body parser). Há disciplina real de engenharia: CI, orçamento de bundle, dívida de CSS versionada, scripts de contraste WCAG, testes que documentam o *porquê* das decisões.

O problema não é falta de capacidade. É **desequilíbrio**:

> A engenharia de plataforma está madura. A **camada de dinheiro** — a única que o usuário realmente confia — tem defeitos que corrompem valores silenciosamente.

Três achados isolados sustentam a nota:

1. **A entrada rápida não existe na interface.** `PARSER`, `PIPELINE`, `SCORE`, `APRENDIZADO` e o OCR inteiro dependem de `#entrada-rapida-input` e `.er-wrapper`, que **não estão no `index.html`**. São ~900 linhas de código carregadas em toda sessão e nunca executadas.
2. **E se existissem, estariam erradas.** O parser converte `"Uber 32,90"` em **R$ 90,00** — verificado empiricamente.
3. **O parcelamento produz datas e valores incorretos.** `R$ 100 em 3x` grava R$ 99,99. Uma compra em 31/01 em 5x gera parcelas em jan, **mar, mar, mai, mai** — fevereiro e abril ficam sem parcela.

Um app financeiro que erra o valor e a data não tem problema de UX. Tem problema de **confiança**, que é o único ativo que ele vende.

### Distribuição por camada

| Camada | Nota | Leitura |
|---|---:|---|
| Backend / plataforma | 8,4 | Maduro, pronto para produção |
| Testes / tooling | 7,2 | Boa cobertura, mas lenta e não isolada |
| Frontend / arquitetura | 5,8 | Duas camadas de estado concorrentes, event bus morto |
| **Integridade financeira** | **4,0** | **Bugs que alteram valores e datas** |
| Produto (cartões, dashboard) | 4,5 | Faltam saldo por conta, fatura, limite |

---

## B. Tabela de auditoria

| # | Área | Nota | Problema encontrado (evidência) | Prio | Solução recomendada |
|---|---|---:|---|---|---|
| 1 | Arquitetura | 6 | `STORE` (595 LOC) e `DADOS` (1.006 LOC) são duas camadas de estado paralelas. 58 chamadas a `STORE` vêm só de `actions.js`; todo o resto (`init-config`, `billing`, `open-finance`, `pin`, `contas`) fala direto com `DADOS`, ignorando o store | 🟠 ALTO | Definir `DADOS` como camada de persistência e `STORE` como fonte de verdade em memória. Migrar módulo a módulo, sem big bang |
| 2 | Organização | 7 | Boa separação core/services/modules/components. Mas 3 arquivos concentram 4.273 LOC (`init-form` 1.540, `init-config` 1.496, `init-extrato` 1.237) | 🟡 MÉDIO | Extrair submódulos por responsabilidade dentro do namespace existente |
| 3 | Manutenibilidade | 6 | 75 globais em maiúsculas + 61 funções globais em `init.js` como camada de compatibilidade. 20 `catch(e){}` vazios | 🟡 MÉDIO | Congelar novos globais; converter `catch` vazio em log estruturado via `OBS` |
| 4 | Segurança | 8 | Sem secrets no frontend; `.env` e `.jks` corretamente ignorados e não rastreados; CSP presente com `harden-csp.cjs` removendo localhost do build | 🟢 BAIXO | Manter. Avaliar remover `style-src 'unsafe-inline'` |
| 5 | Autenticação | 8 | Cookies HttpOnly, refresh token hasheado (`createHash`+`digest('hex')`), lockout por e-mail, PBKDF2 com re-hash transparente, TOTP real | 🟢 BAIXO | Manter |
| 6 | Persistência | 6 | localStorage com teto de 5 MB monitorado e cifragem opcional. Mas `_CRYPTO_KEYS` cobre só 3 chaves; `aprendizado_historico` e rascunho ficam em claro | 🟡 MÉDIO | Incluir todas as chaves com dado pessoal na cifragem |
| 7 | Gerenciamento de estado | 5 | `event-bus.js` (416 LOC) + `events-catalog.js` (208 LOC): **zero assinantes reais**. `EVENT_BUS` só é referenciado pelo próprio catálogo | 🟠 ALTO | Ou adotar de fato no fluxo transação→dashboard→orçamento, ou remover 624 LOC mortas |
| 8 | Performance | 6 | Bundle de 435 KB + 240 KB CSS + precache de 955 KB. Code splitting existe (`lazy-load.js`) mas cobre só 2 chunks (`previsao`, `relatorios`). OCR, patrimônio, 2FA, open-finance e billing carregam sempre | 🟠 ALTO | Estender lazy loading para os 5 módulos acima; `sourcemap:false` em prod |
| 9 | UX | 5 | Fluxo de lançamento exige preencher formulário completo. A alternativa rápida existe em código mas não na tela | 🔴 CRÍTICO | Reintroduzir a entrada rápida no HTML após corrigir o parser |
| 10 | UI | 7 | Design system com tokens, dívida de CSS versionada e estável (348 itens, teto registrado) | 🟢 BAIXO | Continuar reduzindo hex hardcoded (`ia.css` tem 58) |
| 11 | Mobile | 6 | Breakpoints em 360/400/420/480/720/768/1023px e 7 usos de `safe-area-inset` | 🟡 MÉDIO | Faltam testes reais em 320px; validar teclado virtual nos modais |
| 12 | Acessibilidade | 8 | 39 inputs / 39 labels, 79 `aria-label`, 8 `aria-live`, focus trap dedicado, **23 pares de contraste aprovados em WCAG AA** nos dois temas | 🟢 BAIXO | Manter; auditar ordem de headings |
| 13 | Dashboard | 5 | Responde "quanto ganhei/gastei" e parcialmente "estou melhorando". **Não responde "quanto posso gastar" nem "quanto tenho comprometido"** — os termos não existem no código | 🟠 ALTO | Adicionar *disponível para gastar* e *comprometido* (parcelas + recorrentes + faturas) |
| 14 | Transações | 6 | CRUD sólido, mas **não existe transferência entre contas**. Mover dinheiro vira receita+despesa e polui o orçamento | 🟠 ALTO | Tipo `transferencia`, excluído de receita/despesa nos agregados |
| 15 | Categorias | 7 | 28 categorias, regex + fuzzy + aprendizado + score. Boa engenharia | 🟡 MÉDIO | Só é alcançável pela entrada rápida — hoje inacessível |
| 16 | Orçamento | 8 | **Melhor módulo do app.** Soma em centavos inteiros; teste prova que 1.000 × R$ 0,10 fecha exatamente R$ 100. Fronteiras 80%/100% testadas | 🟢 BAIXO | Adicionar tendência e risco de estouro (hoje só na aba orçamento) |
| 17 | Metas | 5 | Tem alvo, atual, prazo, dias restantes e aporte. **Faltam aporte mensal necessário, projeção de conclusão e diagnóstico de atraso** | 🟡 MÉDIO | Derivar de `valorAlvo`, `valorAtual` e `prazo` — dados já existem |
| 18 | Contas | 4 | `CONTAS` **não tem campo `saldo`**. Conta é apenas rótulo. `#contas-lista` não existe no HTML → `renderLista()` nunca executa. Deletar conta deixa transações órfãs | 🟠 ALTO | Saldo derivado das transações + saldo inicial; bloquear exclusão com vínculos |
| 19 | Cartões | 2 | Existe `tipo:'credito'` e nada mais. **Sem limite, sem fechamento, sem vencimento, sem fatura.** Despesa no cartão abate o mês imediatamente, como se fosse débito | 🔴 CRÍTICO | Modelar cartão com limite/fechamento/vencimento e agrupar despesas em fatura |
| 20 | Contas a pagar | 6 | Funciona, mas `calcularProximoVencimento` usa a mesma aritmética de mês vulnerável a overflow | 🟠 ALTO | Usar helper de calendário com clamp de dia |
| 21 | Assinaturas | 7 | `Math.min(diaCobranca, últimoDiaDoMês)` — **faz o clamp corretamente**. Único módulo que acerta | 🟢 BAIXO | Usar como referência para os demais |
| 22 | Relatórios | 6 | Existem e são lazy-loaded. Export gated por plano no backend | 🟡 MÉDIO | Ampliar formatos |
| 23 | Patrimônio | 6 | Ativos, dívidas e patrimônio líquido implementados | 🟡 MÉDIO | Não reconcilia com saldos de contas → risco de dupla contagem |
| 24 | IA | 6 | **100% local e honesta**: regressão linear, z-score, agregações. Zero chamada externa — privacidade correta por construção. Mas não há assistente que responda perguntas | 🟡 MÉDIO | Manter local. `projetarFimMes` já existe e quase não é usada |
| 25 | OCR | 3 | Código real (window.ai → Tesseract → heurística → manual), mas o botão é injetado em `.er-wrapper`, **que não existe** → inalcançável | 🟠 ALTO | Ancorar em elemento existente |
| 26 | Previsão | 7 | Regressão linear sobre histórico real, lazy-loaded | 🟢 BAIXO | Expor intervalo de confiança |
| 27 | Alertas | 6 | `AI_ENGINE.gerarAlertas` + `alertas.js` funcionam no dashboard | 🟡 MÉDIO | `insights.js` (380 LOC) mira `#insights-container`, inexistente; cai em `#orc-insights` e só aparece no orçamento |
| 28 | Open Finance | 7 | Belvo real + sandbox, rotas, dedupe por `openFinanceId`, CSP libera o widget | 🟡 MÉDIO | Exercitar o caminho de erro do popup |
| 29 | Billing | 7 | Stripe Checkout + portal + webhook + planos + `requirePlan`. **Mas `canUse()` retorna `true` para todo usuário local** → app inteiro grátis sem login | 🟠 ALTO | Decidir a fronteira grátis/pago (ver §E, Fase 7) |
| 30 | PWA | 7 | SW não cacheia `/api/`, precache versionado, Capacitor para Android/iOS | 🟢 BAIXO | Manter |
| 31 | Testes | 6 | 60 suítes e testes que documentam decisões. **Mas: suíte frontend >3 min; 4 testes de billing falham porque leem o `.env` real do dev** | 🟠 ALTO | Isolar env nos testes; paralelizar |
| 32 | Tratamento de erros | 5 | 20 `catch(e){}` vazios, 85 `console.error/warn` sem feedback ao usuário | 🟠 ALTO | Roteirizar erros por `OBS.captureError` + toast |
| 33 | Observabilidade | 7 | `observability.js` opt-in, sem PII, CSP-safe, com buffer local. Desenho correto | 🟡 MÉDIO | Ligar por padrão só a captura de erros, com consentimento |
| 34 | Escalabilidade | 7 | BullMQ, workers, Redis, retenção, multi-org | 🟡 MÉDIO | Worker de recorrentes é o único caminho — quebra offline |
| 35 | Qualidade geral | 6 | Alta variância: orçamento nota 8, cartões nota 2 | 🟠 ALTO | Nivelar pela integridade financeira |

---

## C. Top 20 problemas (ordenados por impacto)

### 🔴 Críticos — corrompem dados ou quebram a promessa central

**1. O parser converte "Uber 32,90" em R$ 90,00** — `js/parser.js:14`
`texto.toLowerCase().split(/[\s,]+/)` quebra no separador decimal brasileiro. `"32,90"` vira `['32','90']`; ambos casam com `^\d+$` e o **último sobrescreve** o valor.
Reproduzido:

```
"Uber 32,90"          -> valor=90      desc="uber"
"Mercado 149,90"      -> valor=90      desc="mercado"
"Cafe 7,50"           -> valor=50      desc="cafe"
"ifood 45,00 nubank"  -> valor=0       desc="ifood"
```

É exatamente o exemplo da Etapa 7 do seu briefing, retornando um valor errado, em silêncio, num app de finanças.

**2. Parcelamento perde centavos** — `js/modules/init-form.js:1286`
`Math.round((valor/n)*100)/100` aplicado a todas as parcelas, sem alocar o resíduo:

```
R$ 100 em 3x  -> 3 × 33,33 = 99,99   (-0,01)
R$ 1000 em 6x -> 6 × 166,67 = 1000,02 (+0,02)
R$ 99,99 em 7x-> 7 × 14,28 = 99,96   (-0,03)
```

Contradiz diretamente o trabalho de precisão em centavos já feito no orçamento.

**3. Parcelas pulam meses (overflow de `setMonth`)** — `js/modules/init-form.js:1289`
Compra em 31/01/2026 em 5x gera:

```
2026-01-31, 2026-03-03, 2026-03-31, 2026-05-01, 2026-05-31
```

Fevereiro e abril sem parcela; março e maio com duas. Destrói o orçamento mensal.

**4. Mesmo bug no worker de recorrentes** — `backend/workers/recurring.worker.js:18`
`addMonths` sem clamp. Uma recorrência com vencimento em 31 **deriva permanentemente** (31 → 3 → 3 → 3…). O comentário do arquivo afirma proteger contra derivação — protege contra "mês = 30 dias", mas não contra overflow de dia.

**5. Cartão de crédito não existe como conceito** — `js/contas.js`
Só há `tipo:'credito'`. Sem limite, disponível, fechamento, vencimento ou fatura. Uma compra parcelada no cartão em 12x reduz o "saldo" do mês da compra, quando o desembolso real ocorre em 12 faturas futuras. **O número mais visível do app está errado para quem usa cartão.**

**6. Entrada rápida e OCR são inalcançáveis** — verificado por varredura de IDs
`#entrada-rapida-input`, `#btn-er-submit`, `#er-feedback` e `.er-wrapper` **não existem no `index.html`**. `setupEntradaRapida` sai no primeiro `if`; `OCR._injetarBotaoCaptura` nunca encontra âncora. ~900 LOC carregadas em toda sessão, nunca executadas.

### 🟠 Altos

**7. 15 âncoras de DOM órfãs** — varredura automatizada de 221 IDs:
`#insights-container` (módulo de 380 LOC), `#contas-lista`, `#orc-historico`, `#logout-btn`, `#form-config`, `#form-orcamentos`, `#import-area`, `#sugestao-badge`, `#smart-description-suggestions`, `#cfg-stat-tx/-cat/-dias`, além dos 4 da entrada rápida.

**8. Recorrências não são geradas offline.** Só o worker BullMQ materializa. Sem Redis + worker + login, "Aluguel mensal" nunca reaparece — num app cujo princípio declarado é *offline-first*.

**9. Não existe transferência entre contas.** Mover R$ 1.000 da corrente para a poupança vira despesa + receita, inflando ambos e distorcendo o 50/30/20.

**10. Contas não têm saldo.** Impossível responder "quanto tenho?" por conta. Excluir conta deixa transações apontando para id inexistente.

**11. Event bus morto** — 624 LOC (`event-bus.js` + `events-catalog.js`) sem um único assinante fora do próprio catálogo. Enquanto isso, a sincronização de telas é feita por `atualizarDashboard()` chamando 10 renders na mão.

**12. Estado duplicado STORE × DADOS.** Duas fontes de verdade; a maioria dos módulos ignora o store.

**13. Testes leem o `.env` real do desenvolvedor.** 4 testes de billing falham na máquina auditada porque `STRIPE_SECRET_KEY` está preenchida — os testes assumem Stripe não configurado. Resultado depende do ambiente.

**14. Suíte frontend leva mais de 3 minutos.** Excede o timeout de execução; desincentiva rodar antes de commitar.

**15. Code splitting cobre 2 de ~8 candidatos.** OCR, patrimônio, open-finance, billing, 2FA e anexos carregam sempre. Precache de 955 KB no primeiro acesso.

**16. 20 `catch` vazios + 85 logs sem feedback.** Falha silenciosa: o usuário não sabe que algo deu errado.

**17. Dashboard não responde 3 das 8 perguntas.** "Quanto posso gastar", "quanto tenho comprometido" e "o que preciso fazer" não têm representação — os termos não aparecem no código.

**18. `insights.js` só aparece no orçamento.** Cai no fallback `#orc-insights`; a inteligência não chega ao dashboard.

### 🟡 Médios

**19. Metas sem aporte necessário nem projeção.** Os dados existem (`valorAlvo`, `valorAtual`, `prazo`); falta o cálculo.

**20. Criptografia local é ofuscação.** `_DEV_KEY` fica no `localStorage` ao lado do texto cifrado. Existe suporte a `cryptoPassphrase`, mas **não há nenhuma UI para defini-la** — nenhuma referência fora do próprio `local-crypto.js`. O código documenta a limitação com honestidade; o produto não a comunica.

---

## D. Top 20 melhorias (ordenadas por ROI)

| # | Melhoria | Esforço | Impacto | ROI |
|---|---|---|---|---|
| 1 | Corrigir o parser de decimal brasileiro (normalizar antes de tokenizar) | 1 h | Destrava a proposta central | ★★★★★ |
| 2 | `UTILS.dividirEmParcelas(centavos, n)` com resíduo na 1ª parcela | 2 h | Elimina perda de centavos | ★★★★★ |
| 3 | `UTILS.addMesesClamp(data, n)` e usar em parcelas, recorrentes, contas a pagar e worker | 3 h | Elimina meses pulados e derivação | ★★★★★ |
| 4 | Reintroduzir a entrada rápida no HTML (depois de 1–3) | 3 h | Ativa ~900 LOC prontas | ★★★★★ |
| 5 | Testes de regressão para 1–3 antes de corrigir | 2 h | Trava os bugs para sempre | ★★★★★ |
| 6 | Ancorar o botão de OCR num elemento existente | 1 h | Ativa 437 LOC | ★★★★☆ |
| 7 | Isolar `.env` nos testes (`setupFiles` limpando env) | 1 h | Suíte determinística | ★★★★☆ |
| 8 | Renderizar `insights` no dashboard | 2 h | Inteligência visível | ★★★★☆ |
| 9 | Saldo por conta (inicial + derivado) | 4 h | Responde "quanto tenho?" | ★★★★☆ |
| 10 | Tipo `transferencia` excluído dos agregados | 4 h | Corrige orçamento e relatórios | ★★★★☆ |
| 11 | KPI *Disponível para gastar* e *Comprometido* | 5 h | Responde 2 das 8 perguntas | ★★★★☆ |
| 12 | Modelo de cartão: limite, fechamento, vencimento, fatura | 12 h | Corrige o saldo de quem usa cartão | ★★★★☆ |
| 13 | Recorrentes materializadas no cliente (idempotente por `id+competência`) | 6 h | Cumpre a promessa offline-first | ★★★★☆ |
| 14 | Metas: aporte necessário, projeção, atraso | 3 h | Metas viram ferramenta | ★★★★☆ |
| 15 | Lazy-load de OCR, patrimônio, open-finance, billing, 2FA | 4 h | −150 a 200 KB no 1º acesso | ★★★☆☆ |
| 16 | Decidir: adotar ou remover o event bus | 6 h | −624 LOC ou +consistência | ★★★☆☆ |
| 17 | Substituir `catch` vazio por `OBS.captureError` + toast | 4 h | Fim das falhas silenciosas | ★★★☆☆ |
| 18 | Bloquear exclusão de conta com transações vinculadas | 2 h | Integridade referencial | ★★★☆☆ |
| 19 | Paralelizar/dividir a suíte frontend | 3 h | Testes voltam a ser usados | ★★★☆☆ |
| 20 | UI para `cryptoPassphrase` + texto honesto sobre a proteção | 3 h | Confiança e transparência | ★★☆☆☆ |

---

## E. Plano de implementação

Regra transversal: **um grupo de mudanças por vez, com teste antes da correção.** Nenhuma refatoração destrutiva; nada de renomear ID, função pública ou chave de storage sem varredura de referências.

### Fase 1 — Crítico: integridade financeira *(~15 h)*

Ordem obrigatória. Cada item começa por um teste que **falha** e termina com ele passando.

1. `tests/parcelas-datas.test.js` — trava os bugs 2, 3 e 4
2. `tests/parser-decimal.test.js` — trava o bug 1
3. `UTILS.dividirEmParcelas()` e `UTILS.addMesesClamp()` em `js/core/utils.js`
4. Aplicar em `init-form.js` (parcelamento) — **sem tocar em mais nada**
5. Aplicar em `contas-pagar.js` e `recurring.worker.js`
6. Corrigir `PARSER.extrair` normalizando `1.234,56` → `1234.56` antes de tokenizar
7. Corrigir `PARSER.parseData`: montar `YYYY-MM-DD` com `getFullYear/getMonth/getDate` locais, nunca `toISOString()`

> **Checkpoint** — suíte inteira verde antes de seguir. Compatibilidade de dados preservada: nenhuma estrutura muda.

### Fase 2 — Core: reconectar o que já existe *(~10 h)*

8. Auditar as 15 âncoras órfãs: para cada uma, decidir **religar** ou **remover** (com varredura de dependências antes)
9. Reintroduzir a entrada rápida no `index.html` — agora com parser correto
10. Ancorar o OCR
11. Renderizar `insights` no dashboard
12. Isolar `.env` nos testes de billing
13. Decidir o destino do event bus — **traga a decisão antes de executar**

### Fase 3 — UX: as perguntas do dashboard *(~14 h)*

14. Saldo por conta (saldo inicial + derivado das transações)
15. Tipo `transferencia`, excluído de receitas/despesas nos agregados
16. KPIs *Disponível para gastar* e *Comprometido*
17. Reduzir cards concorrentes: hierarquia clara, um número dominante
18. Metas: aporte necessário, projeção, atraso

### Fase 4 — Inteligência *(~10 h)*

19. Expor `projetarFimMes` no dashboard
20. Orçamento: tendência e risco de estouro por categoria
21. Anomalias com explicação em linguagem simples
22. Sugestão de ajuste acionável

### Fase 5 — Performance *(~8 h)*

23. Lazy-load dos 5 módulos pesados
24. `sourcemap: false` em produção
25. Reduzir CSS crítico; medir antes e depois

### Fase 6 — Qualidade *(~10 h)*

26. Paralelizar a suíte frontend
27. E2E do caminho do dinheiro: lançar → dashboard → orçamento → editar → excluir
28. Erros roteados por `OBS` + toast
29. Ligar captura de erros com consentimento

### Fase 7 — Produto *(~12 h)*

30. **Cartões completos** (o maior diferencial competitivo que falta)
31. Definir a fronteira grátis/pago

Sobre monetização — hoje `canUse()` libera tudo para usuário local, então **não existe pressão de conversão**. Sugestão a discutir antes de implementar:

- **Grátis:** lançamentos ilimitados, orçamento 50/30/20, metas, 1 conta, extrato, dashboard
- **Premium:** Open Finance, OCR, cartões com fatura, previsão, relatórios exportáveis, sync multi-dispositivo, patrimônio

Princípio: **o que é essencial para controlar dinheiro fica grátis**; o que economiza *tempo* ou traz dado externo é pago. É o que sustenta retenção sem parecer resgate.

---

## Decisões que preciso da sua confirmação

Conforme a Regra 15 do briefing, estas escolhas mudam o resultado e não devem ser tomadas por preferência minha:

1. **Event bus** — adotar de verdade no fluxo transação→dashboard→orçamento, ou remover as 624 LOC? Adotar dá consistência e custa risco; remover simplifica e descarta trabalho já feito.
2. **Cartão de crédito** — modelar de forma completa (limite/fechamento/vencimento/fatura) exige migração de dados de `contas`. Faço na Fase 1 (junto com a integridade) ou na Fase 7 como planejado?
3. **Recorrentes offline** — materializar no cliente cria risco de duplicar com o worker do backend. Proponho chave de idempotência `recorrenteId + competência(YYYY-MM)`. Confirma?
4. **Fronteira grátis/pago** — a proposta acima serve como ponto de partida?

---

**Próximo passo sugerido:** aprovar a Fase 1. São 15 horas que transformam o app de "erra valores em silêncio" para "confiável", sem alterar nenhuma estrutura de dados e sem tocar em UI.
