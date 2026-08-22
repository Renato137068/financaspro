# Roadmap de melhorias para o Opus 4.8

## Objetivo

Levar o FinancasPro v11 de um produto funcional, com boa cobertura de domínio e backend promissor, para uma versão confiável em produção, com UI/UX consistente, runtime determinístico, sincronização previsível e gates de release verdes.

Relatório de origem: `docs/auditoria-completa-2026.html`.

## Regras de execução

1. Preservar alterações existentes no worktree. Inspecionar `git status` antes de editar.
2. Corrigir a causa raiz e adicionar teste de regressão para cada bug corrigido.
3. Fazer mudanças em fatias pequenas; não reescrever o frontend inteiro em uma sprint.
4. Não declarar uma fase concluída sem evidência dos comandos de verificação.
5. Não versionar `.env`, keystores, tokens, dumps ou artefatos de teste.
6. Não usar `file://` para validar o app. Usar servidor HTTP, backend ou build Android.

## Estado inicial comprovado

- Nota geral: **76/100**.
- Unitários: **34 suites, 458 testes aprovados**.
- Cobertura: **92,59% statements, 79,48% branches, 97,14% functions**.
- API/smoke: **24 aprovados, 0 falhas**.
- XSS guard: **89 arquivos verificados, 0 sinks sem escape**.
- Lint: passa, mas com **542 warnings**.
- E2E: **10 falhas e 1 skipped** após instalar Chromium.
- Acessibilidade: **5 falhas** no setup, antes do axe concluir.
- Build: conclui, mas gera app bundle aproximado de **429 KB**, CSS de **239 KB** e muitos avisos de scripts legados.
- `npm audit`: inconclusivo no ambiente local por falha de acesso ao endpoint do npm.
- Integração de banco: pulada localmente sem `INTEGRATION_TEST_DATABASE_URL`.

## Fase 0 - P0: corrigir runtime de produção

### Problema

O bundle gerado por `scripts/bundle-app.cjs` concatena scripts globais. `js/core/dom-safe.js` executa `DOM_SAFE_PATCH.apply()` antes da declaração lexical `const INIT_FORM` de `js/modules/init-form.js`. O browser interrompe o bundle com:

```text
ReferenceError: Cannot access 'INIT_FORM' before initialization
```

### Implementação

- Preferir conversão para módulos ES com imports explícitos.
- Se a migração total não couber agora, adiar a aplicação de patches para um hook pós-declarações, ou trocar a dependência lexical por um registro global deliberado e documentado.
- Não mascarar o erro com `try/catch` amplo.
- Garantir que `DOM_SAFE_PATCH` seja aplicado uma única vez.

### Testes obrigatórios

- Smoke Playwright em `dist/` com listener de `pageerror`.
- Smoke com seed em `localStorage`: o card de saldo precisa sair do placeholder e refletir receitas/despesas.
- Smoke deve verificar `APP_BOOTSTRAP`, `LIFECYCLE`, `mudarAba` e uma navegação para Extrato.

### Gate

```text
npm run build
npm run test:e2e
npm run test:a11y
```

Nenhum `ReferenceError` e nenhum teste pode falhar no setup.

## Fase 1 - P1: tornar os testes de produto confiáveis

- Revisar `scripts/e2e-fixtures.cjs` e os seeds dos testes para usar o contrato atual de dados.
- Aguardar estados observáveis, como `data-ready="true"` ou um evento de boot, em vez de depender apenas de nomes globais.
- Adicionar smoke de recarga: seed local, render, criar uma transação, recarregar e conferir persistência.
- Adicionar teste de erro de API e modo offline sem deixar a tela em estado ambíguo.
- Manter Chromium cacheado no CI e fazer o pipeline falhar com diagnóstico de screenshot/trace.

### Critério de aceite

`npm run test:e2e` e `npm run test:a11y` passam em ambiente limpo, com artefatos de trace somente em caso de falha.

## Fase 2 - P1: UI/UX e primeiro valor

### Conteúdo e confiança

- Converter todos os arquivos textuais para UTF-8 e criar teste que detecte sequências de mojibake como `Ã`, `Â` e `â` em texto visível.
- Revisar labels, aria-labels, mensagens de erro, tooltips e títulos em português.
- Alinhar README, auditorias, OpenAPI e runbooks a uma única versão oficial.

### Dashboard

- Hierarquia recomendada: saldo do mês, receitas/despesas, uma ação principal e um insight.
- Mover funcionalidades avançadas para seções progressivas ou descoberta contextual.
- Não renderizar cards vazios como se fossem dados carregados.
- Ter estados distintos: carregando, vazio, erro, offline, sincronizando e sincronizado.

### Fluxo essencial

- Onboarding deve levar o usuário até a primeira transação e o primeiro insight.
- Criar, editar, excluir e desfazer precisam ter feedback consistente.
- Revisar toque em 360 px, teclado, foco visível, contraste e leitura por leitor de tela.

### Critério de aceite

Um novo usuário consegue registrar uma receita e uma despesa, entender o saldo e encontrar o extrato sem instrução externa.

## Fase 3 - P1: arquitetura frontend e performance

- Migrar gradualmente scripts para ES modules, começando por `core`, `services` e `renderers`.
- Criar adaptadores explícitos para os globals legados e remover cada adaptador após a migração.
- Corrigir warnings por domínio, priorizando `no-undef` e dependências de ordem.
- Separar chunks de relatórios, previsão, OCR, Open Finance e billing.
- Medir tamanho bruto, gzip, Brotli, LCP, INP e CLS antes/depois.
- Remover CSS morto e consolidar tokens sem alterar responsividade.

### Critério de aceite

- Zero `pageerror` no smoke de produção.
- Redução mensurável do JS inicial e do CSS inicial.
- Warnings novos não entram no CI; o número de warnings existentes cai por sprint.

## Fase 4 - P1: dados, sync e segurança

### Sincronização

- Documentar fonte de verdade por estado: transações, contas, configuração e preferências.
- Definir idempotency key para criação/importação.
- Formalizar outbox local, retry, tombstone, server-wins e conflito manual.
- Medir sync iniciado, concluído, falho, conflito e tempo de reconciliação.
- Nunca substituir dados válidos por `[]` depois de uma falha parcial de leitura.

### Segurança

- Documentar política CSRF para cookies, CORS e `SameSite` por ambiente.
- Rodar migrações Prisma em ambiente de integração antes dos testes de API.
- Confirmar PBKDF2 atual ou migrar para Argon2id com rehash progressivo.
- Repetir `npm audit --audit-level=high` com rede funcional e registrar exceções por pacote.
- Manter keystore fora do repositório e fora do workspace compartilhado; rotacionar se houve exposição.

### Critério de aceite

Testes de autenticação, isolamento multi-tenant, refresh/logout, CSRF/CORS, sync e migrações passam com Postgres e Redis reais.

## Fase 5 - P2: release Android, operação e documentação

- Gerar AAB em ambiente limpo e validar assinatura, versionCode, deep links e permissões.
- Testar cold start, retorno de rede, teclado, safe areas, back button e links de privacidade.
- Revisar screenshots, manifest, ícones, splash e política de privacidade para Play Store.
- Criar runbook de deploy, migração, rollback, backup, incidente e suporte.
- Arquivar auditorias antigas ou marcá-las como históricas para evitar conflito de notas.

## Gates finais

O trabalho só está pronto quando:

- `npm run build` conclui sem warnings críticos de empacotamento.
- `npm test -- --runInBand` passa.
- `npm run lint` passa e a contagem de warnings está documentada ou zerada.
- `npm run test:ci` passa com Postgres, Redis e migrações aplicadas.
- `npm run test:e2e` passa.
- `npm run test:a11y` passa sem violações serious/critical.
- `npm run security:xss` passa.
- `npm audit --audit-level=high` passa ou tem exceções aprovadas.
- AAB de release foi gerado e o runbook foi atualizado.
- O relatório final lista arquivos alterados, evidências, riscos restantes e decisões reversíveis.

## Prompt de delegação

```text
Leia docs/auditoria-completa-2026.html e este roadmap antes de alterar o projeto. Comece pela Fase 0: corrija o ReferenceError do bundle de produção causado pela ordem entre DOM_SAFE_PATCH e INIT_FORM. Preserve o worktree existente, não faça reescrita ampla e adicione testes de regressão. Depois avance sequencialmente pelas fases, com foco explícito em UI/UX, UTF-8, primeiro valor, estados de erro/offline, sync e release Android. Após cada fase, rode os gates correspondentes e reporte comandos, resultados, arquivos alterados, métricas antes/depois e riscos remanescentes. Não declare pronto enquanto E2E, a11y e integração com Postgres/Redis estiverem vermelhos ou sendo pulados sem justificativa.
```
