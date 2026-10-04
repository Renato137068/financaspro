# Retenção de dados

Este documento descreve por quanto tempo o FinançasPro guarda cada tipo de
dado, por quê, e o que acontece quando alguém pede para sair.

A política vive em código, não aqui: **`public.fp_purge_retention()`**, na
migração `supabase/migrations/20261002120000_agendamentos.sql`, é a fonte
única. Este texto explica o raciocínio; a função aplica as regras,
`supabase/tests/agendamentos.test.sql` testa o comportamento dela e
`tests/retencao-politica.test.js` garante que schema, política e esta tabela
não se separem.

## Por que existe

Até a auditoria de agosto de 2026 o sistema não apagava nada por prazo. Sessões
expiradas, tokens já usados, convites vencidos e logs de auditoria ficavam no
banco indefinidamente.

Não era uma decisão — era a ausência de uma. Ninguém escolheu guardar para
sempre; simplesmente nunca houve o momento de decidir o contrário. Do ponto de
vista da LGPD dá no mesmo: o art. 15, IV determina o término do tratamento
quando a finalidade se encerra, e "ninguém pediu para apagar" não é base legal
para retenção.

## Prazos

| Tabela | Corte por | Prazo | Raciocínio |
|---|---|---|---|
| `Session` | `expiresAt` | 30 dias | Sessão expirada não autentica ninguém. O que sobra é o vínculo entre um dispositivo e uma pessoa. |
| `VerificationToken` | `expiresAt` | 7 dias | Token vencido é lixo criptográfico. A janela existe só para investigar tentativa de uso indevido. |
| `Invitation` | `expiresAt` | 30 dias | Guarda o e-mail de alguém que talvez nunca tenha virado usuário — a pessoa com menos motivo para ter dado seu retido aqui. |
| `JobLog` | `createdAt` | 90 dias | Diagnóstico operacional. Depois de um trimestre ninguém investiga um job isolado. |
| `fp_client_error` (Supabase) | `created_at` | 30 dias | Relatório de erro do app. Serve para corrigir a falha da versão atual; purgado pela própria Edge Function `obs-ingest`. |
| `fp_app_sessao_dia` (Supabase) | `dia` | 30 dias | Contador anônimo de aberturas por dia e versão (denominador do painel de saúde). Não identifica ninguém; o prazo é o mesmo dos erros com que ele é comparado. Purgado pela `obs-ingest`. |
| `AuditLog` | `createdAt` | 365 dias | Prazo mais longo porque é a prova de quem fez o quê — inclusive a prova de que uma exclusão foi atendida. |
| `SyncOp` | `processedAt` | 90 dias | Registro de idempotência do sync v2 da API Express (que saiu, ADR 0007). Só servia para deduplicar reenvios; não é dado financeiro. |
| `StripeWebhookEvent` | `processedAt` | 90 dias | Ledger de idempotência dos webhooks do Stripe e do RTDN da Play. Depois de processado, só impede reprocessar o mesmo evento, e as lojas não reenviam depois de alguns dias. |

`Session`, `VerificationToken`, `JobLog` e `SyncOp` eram escritas só pelo
backend Express, que saiu do projeto (ADR 0007): nada novo entra nelas, e o
expurgo leva o que sobrou dentro do prazo de cada uma.

Mudar um prazo é uma migração nova com `create or replace function`.
Encurtar apaga histórico no expurgo seguinte e **não há desfazer** — a
alteração deve passar por revisão.

### O que não tem prazo, e por quê

Conteúdo do usuário (transações, contas, orçamentos, recorrências) não expira.
Não é o produto que decide quando o histórico financeiro de alguém deixou de
ser útil — é a pessoa. Esses dados somem por dois caminhos: exclusão explícita
pelo usuário, ou cascade na exclusão da conta.

Registros fiscais (`Subscription`, `Invoice`, `UsageRecord`) seguem prazo
contábil, não esta política.

A lista completa de isenções está em `tests/retencao-politica.test.js`, com
justificativa por tabela. Um modelo novo que não esteja nem na política nem nas isenções faz a
suíte falhar — é uma decisão que precisa ser tomada, não esquecida.

## Como o expurgo roda

`pg_cron` do Supabase, job `fp-retencao`, todo dia às 03:17 UTC, chamando
`select public.fp_purge_retention()`. Antes era um worker BullMQ do Express.

Três propriedades que importam:

- **Idempotente.** O critério é a data, não uma marcação de "já processado".
  Rodar duas vezes no mesmo dia não causa dano.
- **Tolerante a falha parcial.** Erro numa tabela não impede o expurgo das
  outras; ela aparece no resultado como `"erro: …"` e no log do Postgres como
  `warning`.
- **Barulhento quando o schema muda.** Se uma tabela da política for
  renomeada sem atualizar a função, o expurgo reporta erro em vez de apagar
  zero linhas em silêncio para sempre — e o teste da política falha antes,
  no CI, porque o modelo some do schema.

Para rodar à mão numa investigação: `select public.fp_purge_retention();` no
SQL Editor. O histórico das execuções fica em `cron.job_run_details`.

## Exclusão de conta

`public.fp_delete_own_account()` implementa o art. 18, VI. O app chama pelo
Perfil (`client.rpc('fp_delete_own_account')`); a função apaga o conteúdo da
pessoa, as organizações de que ela é dona (com o conteúdo delas), o vínculo
com as outras e, por último, o login em `auth.users`.

**A exceção é o `AuditLog`**, cuja relação com `User` é opcional. Ao apagar o
usuário, o FK faz `SET NULL` e a linha permanece. Isso é proposital: o
registro precisa sobreviver para provar que a exclusão aconteceu.

O que não pode sobreviver é o conteúdo pessoal dessa linha. Endereço IP é dado
pessoal (art. 5º, I): trocar o `userId` por nulo mantendo o IP não anonimiza
nada. Por isso `ipAddress`, `userAgent` e `metadata` são limpos na mesma
transação, antes do delete (migração `20261002121000_delete_own_account_auditlog`;
o backend Express fazia o mesmo, e a primeira versão da função do Supabase não
fazia). Se o delete falhar, não sobra log meio anonimizado. Testado em
`supabase/tests/delete_own_account.test.sql`.

## Portabilidade

O backup do app (`INIT_CONFIG.exportarDados`) atende o art. 18, V: carrega transações, contas, orçamentos, anexos e
configuração — verificado por `tests/backup-simetria.test.js`, que compara o
que o app persiste contra o que o backup leva.
