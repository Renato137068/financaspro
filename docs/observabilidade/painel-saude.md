# Painel de saúde

Etapa 4 do roadmap. Responde, por versão do app: **quantos erros por 1.000
sessões** ela tem, se a versão nova ficou pior que a anterior, e como anda o
funil de quem cria conta na nuvem.

## De onde vêm os números

| Dado | Origem | O que fica guardado | Prazo |
|---|---|---|---|
| Erros | `OBS.captureError` → Edge Function `obs-ingest` → `fp_client_error` | mensagem mascarada, versão, tela, user-agent | 30 dias |
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

## Onde ler

Schema `saude` (migração `supabase/migrations/20260930120000_saude_telemetria.sql`),
fora da API: o PostgREST do Supabase só expõe `public` e `graphql_public`, e
nem `anon` nem `authenticated` têm acesso a ele.

| View | Linha por | Colunas |
|---|---|---|
| `saude.versao_diaria` | dia e versão | `sessoes`, `erros`, `erros_por_mil` |
| `saude.versao_resumo` | versão (janela de 30 dias) | `primeiro_dia`, `ultimo_dia`, `sessoes`, `erros`, `erros_por_mil` |
| `saude.funil_nuvem` | semana de cadastro | `contas`, `com_lancamento`, `ativos_d30`, `com_trial`, `assinantes` |

`ativos_d30` = contas que lançaram algo 30 dias ou mais depois do cadastro.
Fica nulo até a semana completar 30 dias, para não parecer queda.

No dia a dia: **Supabase → SQL Editor** →
`select * from saude.versao_resumo order by ultimo_dia desc;`

## Alerta diário

`.github/workflows/saude.yml` roda todo dia (e à mão, em Actions) o
`scripts/saude-relatorio.cjs`, que publica o relatório no resumo do job e
**abre uma issue** quando a versão mais nova com uso suficiente passa do
limite em relação à anterior:

- só entram versões com **200+ sessões** na janela (menos que isso, um
  aparelho com problema vira "a versão piorou");
- alerta quando `erros_por_mil(nova) > 1,5 × erros_por_mil(anterior) + 2`.

Se a issue daquela versão já está aberta, o job comenta nela em vez de abrir
outra. Sem o segredo abaixo, o job só avisa e sai verde.

### Configurar o segredo

Crie um papel que só lê o schema `saude` (no SQL Editor do Supabase, uma vez):

```sql
create role saude_leitura login password '<senha forte>';
grant usage on schema saude to saude_leitura;
grant select on all tables in schema saude to saude_leitura;
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
- `tests/saude-relatorio.test.js`: a regra do alerta e o workflow.
