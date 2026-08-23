# Retenção de dados

Este documento descreve por quanto tempo o Sobra guarda cada tipo de
dado, por quê, e o que acontece quando alguém pede para sair.

A política vive em código, não aqui: **`backend/lib/retention.js`** é a fonte
única. Este texto explica o raciocínio; o arquivo aplica as regras e
`tests/backend/retention.test.js` garante que schema e política não se separem.

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
| `AuditLog` | `createdAt` | 365 dias | Prazo mais longo porque é a prova de quem fez o quê — inclusive a prova de que uma exclusão foi atendida. |

Os prazos são ajustáveis por variável de ambiente (`RETENTION_*_DAYS`, ver
`.env.example`). Encurtar um prazo apaga histórico no expurgo seguinte e **não
há desfazer** — a alteração deve passar por revisão.

### O que não tem prazo, e por quê

Conteúdo do usuário (transações, contas, orçamentos, recorrências) não expira.
Não é o produto que decide quando o histórico financeiro de alguém deixou de
ser útil — é a pessoa. Esses dados somem por dois caminhos: exclusão explícita
pelo usuário, ou cascade na exclusão da conta.

Registros fiscais (`Subscription`, `Invoice`, `UsageRecord`) seguem prazo
contábil, não esta política.

A lista completa de isenções está em `RETENTION_EXEMPT`, com justificativa por
tabela. Um modelo novo que não esteja nem na política nem nas isenções faz a
suíte falhar — é uma decisão que precisa ser tomada, não esquecida.

## Como o expurgo roda

Worker BullMQ (`backend/workers/retention.worker.js`), cron diário às 3h — fora
do pico e depois do processamento de recorrentes da meia-noite.

Três propriedades que importam:

- **Idempotente.** O critério é a data, não uma marcação de "já processado".
  Rodar duas vezes no mesmo dia não causa dano.
- **Tolerante a falha parcial.** Um deadlock numa tabela não impede o expurgo
  das outras; a falha é contada e registrada como `warn`.
- **Barulhento quando o schema muda.** Se um modelo da política sumir do client
  Prisma (rename não propagado), o expurgo reporta erro em vez de apagar zero
  linhas em silêncio para sempre.

Para rodar à mão numa investigação: `runRetention()` é exportada e não depende
do agendador.

## Exclusão de conta

`UserService.deleteAccount` implementa o art. 18, VI. Todas as relações filhas
têm `onDelete: Cascade` e somem junto com o usuário.

**A exceção é o `AuditLog`**, cuja relação com `User` é opcional. Ao apagar o
usuário, o Prisma faz `SetNull` e a linha permanece. Isso é proposital: o
registro precisa sobreviver para provar que a exclusão aconteceu.

O que não pode sobreviver é o conteúdo pessoal dessa linha. Antes da correção,
`ipAddress` e `userAgent` ficavam intactos com `userId` nulo — endereço IP é
dado pessoal (art. 5º, I), e o resultado era dado pessoal órfão: sem titular
para reclamá-lo e sem rotina para apagá-lo. O comentário no código dizia
"anonimizados", o que era falso conforto: trocar o `userId` por nulo mantendo o
IP não anonimiza nada.

Hoje `ipAddress`, `userAgent` e `metadata` são limpos **antes** do delete, na
mesma transação. Se o delete falhar, não sobra log meio anonimizado; se a
limpeza falhar, a conta não é apagada e o pedido pode ser repetido.

### Dono de organização

Excluir a conta é bloqueado (409) enquanto a pessoa for dona de alguma
organização — a relação `Organization.owner` é obrigatória e o banco recusaria.

Antes, isso era um beco: a única alternativa era `deleteOrg`, que leva junto os
dados de todos os outros membros. Para exercer o direito de exclusão, a pessoa
precisava destruir o trabalho de terceiros ou manter a conta aberta para
sempre.

`OrgService.transferOwnership` (`POST /orgs/:orgId/members/:userId/transfer-ownership`)
resolve isso. O destinatário precisa já ser membro — promover alguém de fora
daria acesso a dados que essa pessoa nunca teve permissão de ver. O dono
anterior vira `ADMIN` em vez de perder o acesso: quem transfere costuma
continuar trabalhando ali.

## Portabilidade

`UserService.exportUserData` atende o art. 18, V. O backup do frontend
(`INIT_CONFIG.exportarDados`) carrega transações, contas, orçamentos, anexos e
configuração — verificado por `tests/backup-simetria.test.js`, que compara o
que o app persiste contra o que o backup leva.
