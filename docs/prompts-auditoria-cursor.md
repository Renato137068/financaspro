# Prompts de Auditoria — FinançasPro (para o Cursor)

Conjunto de prompts de auditoria, um por frente. Cada prompt é **autossuficiente**: cole
um de cada vez em uma conversa nova do Cursor (com o repositório aberto). Rode do mais
crítico pro menos crítico — a ordem abaixo já é uma sugestão de prioridade.

## Como usar

1. Abra o repositório no Cursor.
2. Comece uma conversa **nova por prompt** (evita o contexto de um contaminar o outro).
3. Cole o prompt inteiro, incluindo o bloco "Formato de saída".
4. Ao receber o relatório, **não mande corrigir tudo de uma vez** — peça pra aplicar item
   por item, começando pelos P0/P1, e rode os testes (`npm test`) após cada bloco.

**Contexto comum do app** (o Cursor lê o código, mas isto acelera):
> FinançasPro é um app de controle financeiro pessoal (SaaS), frontend em **JavaScript
> vanilla modular** (namespaces globais, sem framework), CSS organizado em
> `css/{base,components,features,layouts,utilities}`, **PWA** com Service Worker (`sw.js`),
> backend em **Supabase** (supabase-js + RLS + Edge Functions para billing), monetização via
> **Stripe** (web) e **Google Play Billing** (Android/TWA), testes em **Jest**, empacotado
> como app Android para a Play Store. Público: **Brasil (pt-BR, R$)**.

> ⚠️ Regra transversal para TODOS os prompts: não invente arquivos nem APIs. Baseie cada
> achado em código real do repositório, citando `caminho/arquivo:linha`. Se não tiver
> certeza, marque como "a confirmar" em vez de afirmar.

---

## 1. Integridade financeira e correção de cálculos (P0 — comece por aqui)

```text
Você é um auditor de software especializado em aplicações financeiras. Audite o
FinançasPro (JS vanilla, dados em R$, público Brasil) focando EXCLUSIVAMENTE na correção
dos cálculos e na integridade dos dados financeiros. Erro de centavo aqui destrói a
confiança do usuário.

Investigue e reporte:
1. Precisão monetária: uso de float para dinheiro, somas/subtrações/porcentagens que
   acumulam erro de arredondamento, divisões (parcelamento, rateio, médias), conversões
   entre string↔número (parseFloat, toFixed, Intl.NumberFormat, replace de vírgula/ponto).
2. Arredondamento inconsistente entre telas (ex.: total mostrado difere da soma das linhas).
3. Sinais e categorias: entrada vs. saída, saldo, orçamento restante, metas — casos de
   valor zero, negativo, muito grande, e overflow de precisão do Number.
4. Agregações por período (mês/ano): fuso horário, borda de mês, datas em string,
   transações recorrentes, projeções ("projetarFimMes", comparações MoM).
5. Ordem de operações e estado: recálculos que dependem de ordem de listeners/render,
   valores derivados que ficam dessincronizados do estado-fonte.
6. Entrada do usuário: máscara de moeda, colar valores, formatos "1.234,56" vs "1234.56".

Para cada achado, dê: local (arquivo:linha), o cenário concreto de entrada que quebra,
o valor errado vs. o esperado, severidade (P0 quebra dinheiro / P1 impreciso / P2 cosmético)
e a correção proposta com trecho de código. Priorize propor uma estratégia única de
representação monetária (ex.: inteiros em centavos ou helper central) se hoje estiver disperso.

Formato de saída: tabela [Problema | Arquivo:linha | Cenário que quebra | Severidade |
Correção | Esforço], ordenada por severidade. Ao final, liste os 3 riscos mais graves.
```

---

## 2. Segurança (frontend + Supabase RLS + billing)

```text
Você é um auditor de segurança de aplicações. Audite o FinançasPro (frontend JS vanilla +
Supabase com RLS + Edge Functions + billing Stripe/Google Play) buscando vulnerabilidades
reais e exploráveis. É um app financeiro multiusuário — vazamento de dados entre contas é
o pior cenário.

Investigue e reporte:
1. Supabase RLS: existe política de Row Level Security em TODAS as tabelas com dados de
   usuário? Alguma query do frontend consegue ler/escrever dados de outro usuário? A
   chave usada no cliente é a ANON (pública) e não a service_role? Procure vazamento da
   service_role em código, bundle ou variáveis expostas.
2. Verificação de assinatura/billing: a validação da compra (Stripe webhook e Google Play
   Billing / RTDN) é feita no servidor (Edge Function) e não confiável apenas no cliente?
   É possível forjar estado "premium" no frontend? Idempotência e replay de webhook.
3. Injeção e XSS: uso de innerHTML/insertAdjacentHTML com dados do usuário (nome, categoria,
   descrição de transação, OCR), escaping de valores, sanitização.
4. Segredos: qualquer API key, token ou segredo commitado ou embutido no bundle que não
   deveria ser público.
5. Autenticação/sessão: tratamento de refresh token, logout, expiração, e o histórico de
   loop de biometria/refresh — confirme que login por senha nunca fica bloqueado.
6. Edge Functions: validação de input, autorização (o usuário só age sobre os próprios
   dados), CORS, e verificação de assinatura dos webhooks.
7. Dependências: `npm audit` — vulnerabilidades conhecidas de severidade alta/crítica.

Para cada achado: local, vetor de ataque concreto (como um atacante explora), impacto,
severidade (Crítico/Alto/Médio/Baixo) e correção. Marque claramente o que é exploração
real vs. hardening preventivo.

Formato de saída: tabela [Vulnerabilidade | Local | Vetor de ataque | Severidade |
Correção]. Ao final, liste tudo que é Crítico/Alto que precisa ser resolvido ANTES de
abrir o app para produção.
```

---

## 3. Privacidade e LGPD (dados financeiros, Brasil)

```text
Audite o FinançasPro sob a ótica de privacidade e conformidade com a LGPD (Lei Geral de
Proteção de Dados, Brasil). O app coleta dados financeiros pessoais sensíveis.

Investigue e reporte:
1. Quais dados pessoais são coletados, onde são armazenados (Supabase, localStorage,
   IndexedDB, Service Worker cache) e por quanto tempo.
2. Dados sensíveis em lugares inseguros: valores/transações em logs, em URLs/query strings,
   em analytics de terceiros, ou em cache do Service Worker sem necessidade.
3. Consentimento e transparência: existe política de privacidade acessível? O onboarding
   informa o que é coletado? Há coleta antes do consentimento?
4. Direitos do titular: o usuário consegue exportar (portabilidade) e excluir (eliminação)
   os próprios dados? A exclusão é real (backend) ou só local?
5. Terceiros: o que Stripe, Google Play, OCR e qualquer telemetria recebem — o mínimo
   necessário? Há envio de dado financeiro para serviço que não precisa dele.
6. Minimização: campos coletados que não são usados.

Para cada achado: local, dado envolvido, risco de privacidade, severidade e recomendação
(técnica e/ou de processo). Diferencie obrigação legal de boa prática.

Formato de saída: tabela [Achado | Local | Dado | Risco | Severidade | Recomendação].
Ao final, um checklist de mínimos de LGPD para lançar no Brasil.
```

---

## 4. Acessibilidade (WCAG / a11y) e contraste

```text
Audite a acessibilidade do FinançasPro contra o WCAG 2.1 AA. Contexto importante: o app
tem tema claro E escuro, e já teve histórico recorrente de superfícies que não escurecem
corretamente e de valores com contraste insuficiente no dark (ex.: razão de contraste 1,x:1
onde precisava ≥4,5:1). Trate contraste como área de alto risco.

Investigue e reporte:
1. Contraste de cor (texto e componentes) em TODAS as telas, nos DOIS temas. Calcule a
   razão de contraste real dos casos suspeitos e compare com o mínimo WCAG (4,5:1 texto
   normal, 3:1 texto grande/UI). Foque em saldo, valores-hero, KPIs, extrato, badges.
2. Semântica: uso correto de landmarks, headings hierárquicos, labels de formulário
   associados aos inputs, botões vs. links, `alt` em imagens/ícones informativos.
3. Teclado: tudo operável por teclado, foco visível, ordem de foco lógica, foco preso em
   modais, escape fecha modal, sem armadilhas de foco.
4. Leitores de tela: aria-label/aria-live onde necessário (toasts, atualizações de saldo,
   estados de loading), ícones decorativos escondidos (aria-hidden).
5. Alvos de toque no mobile (mínimo ~44x44px), zoom não bloqueado, respeito a
   prefers-reduced-motion nas microinterações/confetti.

Para cada achado: local, critério WCAG violado, severidade (bloqueia uso / dificulta /
menor) e correção (com valor de cor corrigido quando for contraste).

Formato de saída: tabela [Problema | Local | Critério WCAG | Tema afetado | Severidade |
Correção]. Ao final, liste os problemas que impedem uso por alguém com deficiência.
```

---

## 5. Performance (bundle, render, carregamento)

```text
Audite a performance do FinançasPro (JS vanilla, PWA, mobile-first, público Brasil com
redes/aparelhos variados). Meça e recomende, não só opine.

Investigue e reporte:
1. Bundle: tamanho do JS/CSS entregue, código morto, duplicação, dependências pesadas
   (ex.: lucide, libs de OCR), oportunidades de code splitting / lazy load. Confira a
   estratégia atual de bundling (scripts/bundle-app.cjs) e o split vendor.
2. Render: reflows/repaints custosos, manipulação de DOM em loop, re-render de listas
   grandes (extrato/lançamentos), listeners duplicados ou re-registrados, uso de
   clearElement/innerHTML em caminhos quentes.
3. Carregamento inicial: caminho crítico, CSS crítico inline vs. render-blocking, ordem
   de scripts, tempo até interativo, uso do Service Worker para acelerar (ou atrapalhar).
4. Assets: imagens não otimizadas, fontes, ícones — tamanho e formato.
5. Memória: listeners/timers não removidos, vazamentos ao trocar de aba/tela.
6. Trabalho desnecessário: cálculos refeitos a cada render que poderiam ser memoizados,
   recomputação de agregados financeiros.

Para cada achado: local, custo estimado (tamanho em KB ou impacto no render), severidade
e correção com ganho esperado. Onde possível, cite números concretos.

Formato de saída: tabela [Problema | Local | Custo atual | Severidade | Correção | Ganho
esperado]. Ao final, os 5 itens de maior ganho/esforço.
```

---

## 6. PWA, offline e Service Worker

```text
Audite a camada PWA/offline do FinançasPro (sw.js + manifest + cache). Muitos usuários
abrirão o app com internet ruim; offline confiável é diferencial e fonte comum de bugs.

Investigue e reporte:
1. Service Worker: estratégia de cache (cache-first / network-first / stale-while-
   revalidate) por tipo de recurso — está adequada? App shell cacheado? Dados dinâmicos
   nunca servidos stale de forma perigosa (ex.: saldo desatualizado)?
2. Versionamento e atualização: usuário fica preso em versão antiga? Há skipWaiting/
   clients.claim e aviso de nova versão? Cache antigo é limpo?
3. Offline real: o que funciona sem rede? Ações feitas offline (novo lançamento) são
   enfileiradas e sincronizadas ao voltar? Há perda de dados?
4. Manifest: ícones, nome, theme_color, display, start_url corretos para a instalação/TWA.
5. Consistência com o build: recursos referenciados existem no dist? (checar scripts de
   copy/bundle e orphans). Há mismatch entre o que o SW cacheia e o que é publicado?
6. Interação com billing/premium: estado de assinatura offline não pode liberar premium
   indevidamente nem travar o usuário pago.

Para cada achado: local, cenário (ex.: "usuário offline cria lançamento e fecha o app"),
severidade e correção.

Formato de saída: tabela [Problema | Local | Cenário | Severidade | Correção]. Ao final,
descreva o comportamento offline ideal e o gap atual até ele.
```

---

## 7. UX, usabilidade e fluxo mobile

```text
Audite a experiência de uso do FinançasPro como um especialista em UX de produto mobile.
Foque no usuário real (pessoa comum controlando finanças no celular), não em preferências
estéticas. O app tem onboarding, FAB de "Novo", abas (Resumo, Lançamentos, Extrato,
Orçamento, Perfil), metas e microinterações.

Investigue e reporte:
1. Fricção nos fluxos principais: adicionar lançamento, ver saldo, criar meta/orçamento,
   entender pra onde o dinheiro foi. Quantos toques? Onde o usuário trava ou hesita?
2. Onboarding: clareza, tamanho, se coleta o essencial (renda) sem cansar, se dá valor
   rápido (primeiro "aha").
3. Estados vazios, de carregamento e de erro: existem, são úteis e orientam a próxima ação?
4. Feedback: toasts, sucesso (confetti), validação de formulário — no momento certo, sem
   exagero, acessível a quem tem reduced-motion.
5. Consistência: navegação (sidebar desktop / FAB e abas mobile), rótulos, padrões de
   interação iguais em telas iguais. Multi-navegação funcionando (histórico de mudarAba).
6. Prevenção de erro: confirmação antes de excluir, desfazer, evitar perda de dados em
   formulário não salvo.
7. Clareza financeira: o usuário entende os números sem precisar pensar? Hierarquia visual
   guia para o que importa (saldo, alertas, cortes sugeridos)?

Para cada achado: tela/fluxo, o atrito concreto, impacto no usuário, severidade e melhoria
proposta. Diferencie problema de usabilidade (mede-se) de gosto pessoal.

Formato de saída: tabela [Fluxo/Tela | Problema | Impacto | Severidade | Melhoria].
Ao final, as 5 melhorias de maior impacto na retenção/ativação.
```

---

## 8. Arquitetura e manutenibilidade do código

```text
Audite a arquitetura e a manutenibilidade do FinançasPro (JS vanilla modular com
namespaces globais, ~10k LOC, CSS por camadas). Objetivo: reduzir custo de mudança e risco
de regressão, sem propor reescrita desnecessária.

Investigue e reporte:
1. Acoplamento e contratos: dependências implícitas entre módulos (ordem de carregamento,
   estado global compartilhado), módulos que sabem demais sobre outros, contratos de
   render()/estado bem definidos ou frágeis.
2. Estado: fonte única de verdade vs. estado duplicado/dessincronizado, o padrão de
   APP_STATE (que a memória do projeto marca como deprecado) — ainda há uso residual?
3. Separação de responsabilidades: lógica de negócio (cálculo financeiro) misturada com
   render/DOM, IA acoplada ao render, dificuldade de testar por causa disso.
4. Duplicação: código e CSS repetidos que deveriam ser centralizados (cores de categoria,
   nomes de meses, helpers de formatação, utilitários de DOM).
5. Código morto: funções, arquivos, flags, branches e CSS não usados. Cheque também órfãos
   no dist.
6. Consistência de padrões: convenções de nomenclatura, estrutura dos init-*.js, forma de
   registrar listeners, tratamento de erro.
7. CSS: camadas (base/components/features/layouts/utilities) respeitadas? Especificidade
   e !important legados (histórico de overrides em critical-inline/dark-mode)? Tokens de
   tema usados de forma consistente?

Para cada achado: local, por que aumenta o risco/custo, severidade e refatoração proposta
(incremental, com passo seguro). NÃO proponha trocar de framework.

Formato de saída: tabela [Problema | Local | Risco | Severidade | Refatoração proposta].
Ao final, um plano incremental de 5 passos de maior retorno.
```

---

## 9. Cobertura e qualidade de testes

```text
Audite a suíte de testes do FinançasPro (Jest, múltiplas suites em tests/). Objetivo:
descobrir onde uma regressão passaria despercebida, especialmente em código que mexe com
dinheiro e billing.

Investigue e reporte:
1. Gaps de cobertura em código de ALTO risco: cálculos financeiros, agregações por período,
   projeções, billing/assinatura (Stripe + Google Play), auth/refresh, parsing de OCR,
   import/export de dados. Onde não há teste e um bug seria caro?
2. Qualidade dos testes existentes: testam comportamento real ou só o "caminho feliz"?
   Faltam casos de borda (zero, negativo, valores enormes, datas de borda, entrada
   malformada, offline)? Há testes frágeis/acoplados a implementação?
3. Testes que dão falsa confiança: mockam demais e não exercitam a lógica real; asserções
   fracas; testes que passam mesmo com o bug presente.
4. Determinismo: dependência de data/hora real, ordem, aleatoriedade, timezone.
5. Camadas faltando: unidade vs. integração vs. e2e (há um smoke e2e de enquadramento) —
   o que falta cobrir de ponta a ponta nos fluxos críticos.

Para cada gap: o que não está testado, o cenário de regressão que passaria batido,
severidade e o teste que deveria existir (descreva o caso, e esboce o teste).

Formato de saída: tabela [Área | Gap | Regressão que passaria | Severidade | Teste
proposto]. Ao final, liste os 5 testes que mais reduzem risco de lançamento.
```

---

## 10. Billing e monetização (Stripe + Google Play Billing)

```text
Audite o sistema de billing/monetização do FinançasPro: assinaturas via Stripe (web) e
Google Play Billing (Android/TWA), com planos (ex.: FREE/PRO/BUSINESS) e Edge Functions.
Erro aqui = perda de receita ou usuário pagante bloqueado.

Investigue e reporte:
1. Fonte de verdade do estado de assinatura: é o servidor (verificação real na API do
   Google Play / webhook Stripe) e não o cliente? É possível forjar premium?
2. Ciclo de vida completo: compra, renovação, upgrade/downgrade, cancelamento, expiração,
   estorno/reembolso (refund), período de carência (grace), retomada (resume). Todos
   tratados? Há o worker/RTDN do Play reagindo a esses eventos?
3. Idempotência e concorrência: webhooks/RTDN duplicados, replay, ordem fora de sequência,
   token órfão — o sistema converge para o estado certo?
4. Reconciliação: divergência entre o que o Google/Stripe diz e o estado no banco. Há
   verificação periódica?
5. Gates de feature: o que é bloqueado no plano FREE está bloqueado no servidor também, ou
   só escondido na UI?
6. Experiência de erro: pagamento falha, rede cai no meio, usuário pagou mas não liberou —
   há recuperação e mensagem clara?
7. Consistência entre plataformas: quem assina no Android vê premium na web e vice-versa?

Para cada achado: local, cenário de falha concreto (com o impacto: receita perdida ou
usuário travado), severidade e correção.

Formato de saída: tabela [Problema | Local | Cenário | Impacto | Severidade | Correção].
Ao final, os riscos que podem cobrar errado ou bloquear um pagante — resolver antes de
monetizar de verdade.
```

---

## 11. Robustez, tratamento de erros e casos de borda

```text
Audite a robustez do FinançasPro: como ele se comporta quando algo dá errado. Foque em
não perder dados do usuário e não deixar a tela quebrada/branca.

Investigue e reporte:
1. Erros não tratados: promises sem catch, chamadas a Supabase/rede sem tratamento, JSON.
   parse de dados possivelmente corrompidos (localStorage/import), acesso a propriedade de
   objeto possivelmente nulo.
2. Falha de rede/backend: o app degrada com elegância ou trava? Timeouts, retries, mensagem
   ao usuário.
3. Dados corrompidos ou ausentes: localStorage adulterado, import de arquivo malformado,
   OCR retornando lixo, migração de formato antigo de dados.
4. Casos de borda de UI: listas vazias, valores extremos, textos longos (nome de categoria
   gigante), muitos itens, primeiro uso vs. usuário com anos de dados.
5. Concorrência: múltiplas abas abertas, ação disparada duas vezes (double submit), estado
   entre abas do navegador.
6. Perda de dados: fechar formulário sem salvar, refresh no meio de uma ação, offline.

Para cada achado: local, o input/estado que dispara a falha, o que acontece hoje (crash /
tela branca / dado perdido / silencioso) e a correção.

Formato de saída: tabela [Problema | Local | Gatilho | Comportamento atual | Severidade |
Correção]. Ao final, os casos que podem fazer o usuário perder dados.
```

---

## 12. Build, CI e pipeline de deploy

```text
Audite a cadeia de build, CI e deploy do FinançasPro (scripts em scripts/*.cjs, testes
Jest, empacotamento web + Android/AAB, deploy do backend/Edge Functions). Objetivo: evitar
que um build quebrado ou uma config errada chegue nos usuários.

Investigue e reporte:
1. Build determinístico e íntegro: o bundle inclui tudo que o runtime referencia? Há
   órfãos no dist ou recursos referenciados que não são copiados? (checar
   check-dist-orphans, copy-static, check-billing-wiring). O "modo build" não deixa
   resíduo de dev.
2. Gates de CI: os checks certos rodam antes do merge/deploy (testes, lint, wiring de
   billing, verificação de responsividade)? Algum passo crítico é pulado?
3. Configuração por ambiente: segredos e variáveis (Supabase, Stripe, SMTP) — faltando em
   prod quebra o quê? Há armadilhas conhecidas (ex.: compression ausente, exigência de
   hex em polish, SMTP obrigatório em prod)?
4. Versionamento Android: applicationId correto e estável (com.financaspro.mobile),
   versionCode/versionName incrementando, assinatura do AAB consistente.
5. Migrações de banco: aplicadas de forma segura no deploy, reversíveis, sem quebrar dados
   existentes.
6. Rollback: dá pra voltar rápido se um deploy quebrar? O Service Worker não prende os
   usuários numa versão ruim?

Para cada achado: local, o que pode dar errado em produção, severidade e correção
(preferir uma checagem automatizada que pegue isso no CI).

Formato de saída: tabela [Problema | Local | Falha em produção | Severidade | Correção /
Check automatizado]. Ao final, os checks que faltam no CI para lançar com segurança.
```

---

## 13. Internacionalização e localização (pt-BR)

```text
Audite a localização do FinançasPro para o público-alvo (Brasil, pt-BR, R$). Mesmo sem
plano de outros idiomas agora, inconsistências de formato quebram a experiência e às vezes
os cálculos.

Investigue e reporte:
1. Moeda: formatação R$ consistente (Intl.NumberFormat pt-BR), separador de milhar (.) e
   decimal (,), símbolo, valores negativos. Entrada aceita "1.234,56" corretamente?
2. Datas e horas: formato dd/mm/aaaa, fuso horário (America/Sao_Paulo), bordas de dia/mês,
   nomes de meses/dias centralizados e corretos.
3. Textos: strings hardcoded espalhadas vs. centralizadas, mistura de idiomas, erros de
   português, pluralização (0/1/vários itens), textos que estouram layout.
4. Números: percentuais, casas decimais consistentes entre telas.
5. Preparação futura (baixo custo): quão difícil seria extrair strings se um dia
   internacionalizar — sem exigir fazer agora.

Para cada achado: local, o problema de formatação/localização, se afeta só visual ou também
cálculo/parse, severidade e correção. Sinalize onde formato errado vira BUG de valor.

Formato de saída: tabela [Problema | Local | Afeta cálculo? | Severidade | Correção].
Ao final, os pontos onde localização inconsistente pode causar erro numérico.
```

---

## Prompt-mestre (opcional) — visão consolidada primeiro

Use este ANTES dos específicos se quiser um mapa geral e uma priorização entre frentes,
sem entrar no detalhe de cada uma.

```text
Você é um tech lead auditando o FinançasPro (app financeiro; JS vanilla modular; Supabase +
RLS + Edge Functions; PWA/Service Worker; billing Stripe + Google Play; testes Jest;
público Brasil, pt-BR) antes de um lançamento em beta na Play Store.

Faça um levantamento de ALTO NÍVEL das frentes: (1) integridade financeira/cálculos,
(2) segurança, (3) privacidade/LGPD, (4) acessibilidade, (5) performance, (6) PWA/offline,
(7) UX, (8) arquitetura/manutenibilidade, (9) testes, (10) billing, (11) robustez/erros,
(12) build/CI/deploy, (13) localização pt-BR.

Para CADA frente, dê: nota de risco de 0 a 10 (10 = crítico), os 1–3 problemas mais graves
que você já consegue identificar no código (com arquivo:linha), e se merece uma auditoria
profunda agora. Baseie tudo em código real; não invente. Seja honesto sobre incertezas.

Formato de saída: (a) tabela [Frente | Risco 0-10 | Top problemas | Auditar a fundo?],
ordenada por risco; (b) uma ordem recomendada de ataque das 3 frentes mais urgentes e por quê.
```

---

### Sugestão de ordem de execução

1. **Prompt-mestre** → descobre onde o risco está concentrado.
2. **#1 Integridade financeira** e **#2 Segurança** → os dois inegociáveis num app de dinheiro.
3. **#10 Billing** e **#3 LGPD** → antes de monetizar / lançar de verdade.
4. **#4 Acessibilidade**, **#5 Performance**, **#6 PWA/offline**, **#7 UX** → qualidade percebida.
5. **#8 Arquitetura**, **#9 Testes**, **#11 Robustez**, **#12 Build/CI**, **#13 Localização** → sustentação.

> Dica: depois que o Cursor entregar um relatório, guarde-o e peça correções **em lotes por
> severidade** (P0 primeiro), rodando `npm test` entre os lotes. Não deixe ele refatorar
> várias frentes de uma vez — fica difícil revisar e aumenta o risco de regressão.
