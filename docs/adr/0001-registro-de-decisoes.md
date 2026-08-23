# ADR 0001 — Registrar decisões arquiteturais

- **Status:** aceito
- **Data:** 2026-08-09

## Contexto

O Sobra acumulou decisões estruturais cujo motivo não está em lugar
nenhum: por que o frontend usa globais em vez de módulos, por que existem duas
configurações de Jest, por que o precache do service worker é seletivo, por que
`no-undef` é aviso e não erro.

Sem registro, cada uma dessas decisões é reaberta sempre que alguém novo — ou o
mesmo desenvolvedor seis meses depois — encontra o código e assume que é
descuido. O custo não é a discussão; é a "correção" bem-intencionada que
reintroduz o problema que a decisão evitava.

## Decisão

Toda mudança que altere estrutura, fronteiras entre camadas, dependências
externas ou trade-offs relevantes de performance/segurança recebe um ADR em
`docs/adr/`, numerado sequencialmente.

Formato:

```markdown
# ADR NNNN — Título no imperativo

- **Status:** proposto | aceito | substituído por ADR-XXXX
- **Data:** AAAA-MM-DD

## Contexto
O problema, com números quando houver.

## Decisão
O que foi escolhido, afirmativamente.

## Consequências
O que melhora, o que piora, o que passa a ser proibido.

## Alternativas consideradas
As opções descartadas e por quê — esta seção é a mais valiosa no futuro.
```

Um ADR não é editado quando a decisão muda: escreve-se um novo que o substitui,
e o antigo passa a `substituído por ADR-XXXX`. O histórico das decisões vale
tanto quanto a decisão atual.

## Consequências

- PRs estruturais ficam mais lentos para abrir e muito mais rápidos para revisar.
- O onboarding deixa de depender de arqueologia no git log.
- Existe um lugar óbvio para discordar de uma decisão antiga sem reabrir código.

## Alternativas consideradas

**Comentários no código.** Ficam presos ao arquivo e não sobrevivem a
refatorações; além disso não têm espaço para as alternativas descartadas.

**Wiki externa.** Sai de sincronia com o código porque não passa por revisão no
mesmo PR.

**Nada.** É o estado atual, e é justamente o que motivou este ADR.
