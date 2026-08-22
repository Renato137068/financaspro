# ADR 0002 — Migrar o frontend para ES Modules de forma incremental

- **Status:** aceito
- **Data:** 2026-08-09

## Contexto

O frontend são 90 arquivos carregados como `<script>` clássicos, compartilhando
estado por variáveis globais em `window`. O `.eslintrc.cjs` declara 30 desses
globais como `readonly` para que o linter não reporte cada uso como erro.

O custo é mensurável:

- **465 avisos `no-undef`.** O linter não consegue resolver as referências
  estaticamente, então também não consegue detectar quando uma refatoração
  quebra uma chamada. A rede de segurança do lint simplesmente não existe.
- **Cobertura real de ~9% nas linhas de `js/`.** Testar um módulo exige carregá-lo
  num contexto `vm` e simular a ordem de carregamento — o harness em
  `tests/load-sources.js` existe só para isso.
- **Ordem de carregamento é acoplamento invisível.** Trocar duas linhas do
  `index.html` pode gerar um `X is not defined` em runtime, sem aviso em build.
- **Três arquivos passam de 1.200 linhas** (`init-form.js` com 1.540), porque
  criar um módulo novo custa mexer em `index.html`, no `.eslintrc` e na ordem.

Reescrever tudo de uma vez foi descartado: são ~21 mil linhas em produção, com
usuários reais e dados financeiros, e a suíte E2E atual (4 specs) não é rede
suficiente para uma troca big-bang.

## Decisão

Migrar módulo a módulo para ES Modules, na ordem `core` → `features` → `init/*`,
com estas regras:

1. **Um módulo migrado remove seu global do `.eslintrc.cjs` no mesmo commit.**
   A lista de globais é o placar da migração: ela só encolhe.
2. **Todo módulo migrado sai com teste unitário** e entra na lista de limiares
   por arquivo do `jest.frontend.config.cjs`.
3. **`npm run lint:changed` roda com `--max-warnings 0`** no que o PR toca.
   A dívida antiga fica congelada; código novo nasce limpo.
4. **A suíte E2E cresce antes**, não depois: os fluxos de receita (onboarding,
   checkout, convite de organização, importação por OCR) precisam estar cobertos
   antes de mexer nos módulos que os atendem.
5. **`no-undef` vira `error` quando a lista de globais esvaziar.** Esse é o
   marco de conclusão, e ele é verificável — não é uma questão de opinião.

## Consequências

**Ganhos**

- O linter volta a detectar quebras de refatoração.
- Módulos passam a ser testáveis com `import` direto, sem o harness `vm`.
- Code-splitting deixa de depender da lista manual em `scripts/bundle-app.cjs`.
- Arquivos grandes podem ser divididos sem tocar em `index.html`.

**Custos**

- O `index.html` conviverá com scripts clássicos e módulos por vários meses.
- O `bundle-app.cjs` precisa lidar com os dois formatos durante a transição.
- A migração compete por tempo com features; sem disciplina, para no meio — e
  parar no meio é pior que não ter começado, porque dobra o número de padrões
  vivos no código.

**Passa a ser proibido**

- Adicionar novo global ao `.eslintrc.cjs`. Módulo novo nasce como ES Module.
- Baixar um limiar de cobertura para fazer o CI passar.

## Alternativas consideradas

**Adotar um framework (React/Vue) e reescrever.** Resolveria o acoplamento, mas
troca uma dívida conhecida por uma reescrita de 21 mil linhas com risco em cima
de dados financeiros de usuários reais. Também descartaria o offline-first
maduro que já funciona.

**Bundler com auto-detecção de globais.** Esconderia o problema em vez de
resolvê-lo: o linter continuaria cego e os testes continuariam dependendo do
harness.

**Manter como está.** Defensável enquanto o produto era pequeno. Com 41 módulos,
multi-tenant, billing e Open Finance, o custo marginal de cada feature nova já
supera o custo da migração.
