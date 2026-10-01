# Auditoria massiva — usuários virtuais

## Resumo executivo

| Métrica | Valor |
|---------|-------|
| Seed | 20260827 |
| Usuários simulados | 400 |
| Personas | A–G (7 perfis) |
| Operações totais | 78917 |
| Transações criadas | 50226 |
| Edições | 6461 |
| Exclusões | 6013 |
| Transferências | 3074 |
| Consultas (extrato/orçamento) | 13143 |
| Rejeições esperadas (persona E) | 87 |
| Achados únicos | 1 |
| Oportunidades produto | 8 |
| Observações UX | 5 |
| Duração | 15796ms |

### Por persona

- **A** (Organizado): 78 usuários
- **B** (Desorganizado): 66 usuários
- **C** (Intensivo): 57 usuários
- **D** (Casual): 47 usuários
- **E** (Erroneo): 63 usuários
- **F** (Negocio): 45 usuários
- **G** (Historico): 44 usuários

## Top achados

1. **P2** `operacao-rejeitada-inesperada` (5x) — Valor invalido

## Performance

```json
{
  "100": {
    "ms": 49,
    "msPerOp": 0.32666666666666666,
    "reps": 50
  },
  "500": {
    "ms": 67,
    "msPerOp": 0.44666666666666666,
    "reps": 50
  },
  "1000": {
    "ms": 106,
    "msPerOp": 0.7066666666666667,
    "reps": 50
  },
  "5000": {
    "ms": 223,
    "msPerOp": 3.716666666666667,
    "reps": 20
  },
  "10000": {
    "ms": 458,
    "msPerOp": 7.633333333333334,
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
