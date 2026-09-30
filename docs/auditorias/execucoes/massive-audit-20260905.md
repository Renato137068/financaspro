# Auditoria massiva — usuários virtuais

## Resumo executivo

| Métrica | Valor |
|---------|-------|
| Seed | 20260905 |
| Usuários simulados | 200 |
| Personas | A–G (7 perfis) |
| Operações totais | 41205 |
| Transações criadas | 26120 |
| Edições | 3406 |
| Exclusões | 3178 |
| Transferências | 1647 |
| Consultas (extrato/orçamento) | 6854 |
| Rejeições esperadas (persona E) | 24 |
| Achados únicos | 2 |
| Oportunidades produto | 8 |
| Observações UX | 5 |
| Duração | 3990ms |

### Por persona

- **A** (Organizado): 45 usuários
- **B** (Desorganizado): 29 usuários
- **C** (Intensivo): 31 usuários
- **D** (Casual): 30 usuários
- **E** (Erroneo): 17 usuários
- **F** (Negocio): 24 usuários
- **G** (Historico): 24 usuários

## Top achados

1. **P2** `operacao-rejeitada-inesperada` (4x) — Valor invalido
2. **P2** `operacao-rejeitada-inesperada` (1x) — Valor invalido

## Performance

```json
{
  "100": {
    "ms": 7,
    "msPerOp": 0.04666666666666667,
    "reps": 50
  },
  "500": {
    "ms": 19,
    "msPerOp": 0.12666666666666668,
    "reps": 50
  },
  "1000": {
    "ms": 30,
    "msPerOp": 0.2,
    "reps": 50
  },
  "5000": {
    "ms": 90,
    "msPerOp": 1.5,
    "reps": 20
  },
  "10000": {
    "ms": 137,
    "msPerOp": 2.283333333333333,
    "reps": 20
  }
}
```

## Oportunidades de produto

- **PROD-01** (alto): Transferência explícita no fluxo Novo — Usuários movendo dinheiro entre contas podem criar receita+despesa e poluir orçamento se não acharem transferência.
- **PROD-02** (alto): Migração de fp-transacoes para IndexedDB — Teto ~5 MB localStorage (~35k tx). Persona G com milhares de registros atingirá limite.
- **PROD-03** (medio): Undo em exclusões já existe — expandir para edições — Desfazer só em delete; edições acidentais não têm janela de reversão.
- **PROD-04** (medio): Estado vazio contextual por aba — Casual (persona D) precisa de CTA claro em cada aba sem dados.
- **PROD-05** (medio): Reconciliador visível ao usuário — FINANCE_RECONCILER só em modo teste; usuário não vê divergências saldo vs extrato.
- **PROD-06** (alto): Virtualização do extrato — Persona C/G com centenas+ linhas pode degradar scroll e filtros no mobile.
- **PROD-07** (alto): Conflito multi-aba documentado — Duas abas editando simultaneamente dependem de last-write-wins no localStorage.
- **PROD-08** (medio): Ciclo de fatura completo — Cartões sem fechamento/vencimento realista — usuário de negócio espera visão de fatura.

## Observações UX

- **UX-01** [P2] extrato: Mudança recente pode confundir usuários habituados aos 4 chips; falta onboarding/tooltip.
- **UX-02** [P2] orcamento: Persona desorganizada (B) pode não entender limites vs regra global.
- **UX-03** [P3] config: Perfil denso; usuário casual pode não achar função específica.
- **UX-04** [P2] novo: Muitos campos verticais; persona intensiva prefere atalhos/entrada rápida.
- **UX-05** [P2] dashboard: Lançamentos futuros no mês podem confundir saldo do card vs saldo das contas.
