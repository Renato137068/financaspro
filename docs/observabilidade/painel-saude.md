# Painel de saúde

Etapa 4 do roadmap. Responde, por versão do app: **quantos erros por 1.000
sessões** ela tem, se a versão nova ficou pior que a anterior, **quais erros**
mais acontecem, e como anda o funil de quem cria conta na nuvem.

## De onde vêm os números

| Dado | Origem | O que fica guardado | Prazo |
|---|---|---|---|
| Erros | `OBS.captureError` → Edge Function `obs-ingest` → `fp_client_error` | mensagem mascarada, versão, tela, onde (`contexto`), user-agent | 30 dias |
| Sessões | `OBS.contarSessao` (1×/dia por aparelho, no boot) → `obs-ingest` → `fp_obs_contar_sessao` | **só** um contador por dia (UTC) e versão em `fp_app_sessao_dia` | 30 dias |
| Funil | tabelas que já existem (`User`, `Transaction`, `fp_welcome_trial_grant`, `Subscription`) | nada novo | — |

O aviso de uso leva só `{ kind: 'sessao', app: 'X.Y.Z' }`. A função ignora
qualquer outro campo e não grava IP, user-agent nem horário. Segue o mesmo
opt-out dos relatórios de erro (**Perfil → Enviar relatórios de erro**) e não
sai do aparelho no modo local (sem `CONFIG.SUPABASE_URL`) nem quando há um
coletor próprio em `obsEndpoint`. Textos para o usuário: `privacidade.html`
(seção 1) e `docs/play-store-data-safety.md`.

Os relatórios de erro não carregam identificador de sessão, de propósito; por
isso a métrica é a **razão** erros ÷ sessões, e não "sessões sem erro".

O que vira relatório: erros não tratados (`window.onerror`,
`unhandledrejection`), módulo do boot que não subiu (`boot:<módulo>`), tela
que não renderizou (`render:<tela>`), ação de botão ou de modal que quebrou
(`acao:…`, `modal.onOk`), troca de aba (`mudarAba`) e sync recusado pela nuvem
(`sync.push`, `sync.pull`, `sync.reconciliar`; falta de rede não conta). O
mesmo erro sai uma vez por sessão, até 20 por sessão; sem rede, até 10 ficam
guardados no aparelho e saem quando a rede volta ou na próxima abertura.

## Onde ler

Schema `saude` (migração `supabase/migrations/20260930120000_saude_telemetria.sql`),
fora da API: o PostgREST do Supabase só expõe `public` e `graphql_public`, e
nem `anon` nem `authenticated` têm acesso a ele.

| View | Linha por | Colunas |
|---|---|---|
| `saude.versao_diaria` | dia e versão | `sessoes`, `erros`, `erros_por_mil` |
| `saude.versao_resumo` | versão (janela de 30 dias) | `primeiro_dia`, `ultimo_dia`, `sessoes`, `erros`, `erros_por_mil` |
| `saude.funil_nuvem` | semana de cadastro | `contas`, `com_lancamento`, `ativos_d30`, `com_trial`, `assinantes` |
| `saude.retencao_nuvem` | semana de cadastro | `contas`, `d1`, `d7`, `d30` e as mesmas em `%` (`d1_pct`…) |
| `saude.erros_frequentes` | versão, mensagem e onde (últimos 7 dias) | `ocorrencias`, `primeira`, `ultima`, `pilha` (1ª linha de código do caso mais recente), `novo` |

`ativos_d30` = contas que lançaram algo 30 dias ou mais depois do cadastro.
Fica nulo até a semana completar 30 dias, para não parecer queda.

`d1`, `d7`, `d30` (migração `20261009130000_saude_retencao_nuvem.sql`) = contas
com pelo menos um lançamento que **chegou à nuvem** entre N e N+1 dias (blocos
de 24 h) depois do cadastro: retenção no dia exato, não "em algum dia ≥ N".
Mede "lançou", não "abriu"; quem lançou sem rede aparece no dia em que
sincronizou. Cada coluna fica nula até a semana inteira passar do dia N.

No dia a dia: **Supabase → SQL Editor** →
`select * from saude.versao_resumo order by ultimo_dia desc;` e
`select * from saude.erros_frequentes order by ocorrencias desc limit 20;`

## Alerta diário

`.github/workflows/saude.yml` roda todo dia (e à mão, em Actions) o
`scripts/saude-relatorio.cjs`, que publica o relatório (com os 10 erros mais
frequentes) no resumo do job e **abre uma issue por alerta**:

| Alerta | Quando |
|---|---|
| Versão pior que a anterior | `erros_por_mil(nova) > 1,5 × erros_por_mil(anterior) + 2`, só entre versões com **200+ sessões** na janela (menos que isso, um aparelho com problema vira "a versão piorou") |
| Versão acima do teto | a mais nova com 200+ sessões passa de **20 erros por 1.000 sessões** (pega a primeira versão, que não tem anterior) |
| Avisos de uso pararam | nenhum aviso de uso há **2 dias**, depois de já ter havido: função fora do ar, app que quebra antes do boot ou CSP bloqueando. Sem isto, "sem erros" e "sem dados" ficam iguais |
| Erro novo | mensagem que não existia antes da janela de 7 dias e já apareceu **10+ vezes** (até 3 por dia; só depois de 7 dias de histórico, senão tudo seria novo) |

Se a issue com aquele título já está aberta, o job comenta nela em vez de
abrir outra. Sem o segredo abaixo, o job só avisa e sai verde. Feche a issue
quando resolver; se o problema voltar, outra é aberta.

### Configurar o segredo

Crie um papel que só lê o schema `saude` (no SQL Editor do Supabase, uma vez):

```sql
create role saude_leitura login password '<senha forte>';
grant usage on schema saude to saude_leitura;
grant select on all tables in schema saude to saude_leitura;
-- Views que migrações futuras criarem no schema também ficam legíveis.
alter default privileges in schema saude grant select on tables to saude_leitura;
-- As views leem as tabelas com o dono delas; o papel não precisa de acesso
-- a public.
```

Depois, em **GitHub → Settings → Secrets and variables → Actions**, crie
`SAUDE_DATABASE_URL` com a connection string **direta** (Supabase → Project
Settings → Database → Connection string), trocando usuário e senha pelos do
papel acima.

Rodar localmente: `SAUDE_DATABASE_URL=postgresql://... node scripts/saude-relatorio.cjs`
(precisa do `psql`).

## Testes

- `supabase/tests/saude_telemetria.test.sql` (pgTAP): quem pode escrever e ler,
  soma atômica, versão inválida recusada, contas do painel e do funil.
- `tests/obs-sanitize.test.js`: o aviso de uso só deixa passar a versão.
- `tests/observability-envio.test.js`: 1×/dia, opt-out, modo local.
- `supabase/tests/saude_erros_frequentes.test.sql` (pgTAP): agrupamento,
  janela, pilha, `novo` e quem lê.
- `supabase/tests/saude_retencao_nuvem.test.sql` (pgTAP): janelas do D1/D7/D30,
  limites, nulos de semana recente e quem lê.
- `tests/saude-relatorio.test.js`: as regras dos alertas e o workflow.
- `tests/lifecycle-real.test.js`, `tests/supabase-sync.test.js`: falha de boot
  e de sync viram relatório (rede e cota, não).
