# Fase 3 — Integridade financeira (plano)

## Decisão: saldo de conta

**Modelo híbrido conservador:**

| Camada | `Account.balance` / `saldosIniciais` | Saldo exibido |
|--------|--------------------------------------|---------------|
| Frontend | Saldo inicial por conta (`config.saldosIniciais` + cadastro) | **Derivado** do ledger via `CONTAS.saldos()` |
| Backend | Saldo inicial materializado em `Account.balance` | **Derivado** via `LedgerService.deriveBalance()` |

Transações **nunca** atualizam `Account.balance` diretamente — evita drift silencioso.

## Arquivos

- `js/core/utils.js` — `parseMoeda` (US+BR), `dataIsoValida`
- `js/core/validations.js` — datas reais, limites de valor
- `backend/lib/money.js` — centavos, limites, validação API
- `backend/domain/services/ledger.service.js` — saldo derivado
- `backend/domain/services/transaction.service.js` — validação monetária
- `backend/domain/services/account.service.js` — `derivedBalance` na listagem
- `js/modules/init-config.js` — import idempotente por `tx.id`
- `tests/invariantes-financeiras.test.js` — invariantes testáveis

## Invariantes

1. `saldo = inicial + receitas - despesas` (por conta)
2. Transferências não alteram patrimônio líquido
3. Recorrência: no máximo 1 lançamento por competência (já em `recorrentes-cliente.test.js`)
4. Importar o mesmo `id` duas vezes não duplica
