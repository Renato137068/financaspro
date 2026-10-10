-- ============================================================================
-- Painel de saúde: retenção D1, D7 e D30 por semana de cadastro
-- (complementa saude.funil_nuvem, de 20260930120000_saude_telemetria).
--
-- funil_nuvem só diz quem lançou algo 30 dias ou mais depois do cadastro.
-- Esta view mede a volta no dia 1, no dia 7 e no dia 30, das tabelas que já
-- existem (User e Transaction): nenhuma coleta nova, nada sai do aparelho
-- além do que o sync já manda.
--
-- Definições (contadas em blocos de 24 horas a partir de "User"."createdAt"):
--   • "voltou no dia N" = tem pelo menos um lançamento cujo "createdAt" no
--     servidor está em [cadastro + N dias, cadastro + N+1 dias). É a retenção
--     "no dia exato", não "em algum dia >= N": quem lançou só no dia 3 não
--     conta no D1 nem no D7.
--   • "createdAt" do lançamento é a hora em que ele CHEGOU ao servidor (o app
--     não manda esse campo; o default now() vale no primeiro upsert). Quem
--     lançou sem rede e sincronizou depois aparece no dia da sincronização.
--   • Lançamento apagado depois (deletedAt) conta: a pessoa voltou e lançou.
--   • Mede "lançou", não "abriu o app".
--   • A coluna do dia N fica nula até TODAS as contas da semana terem passado
--     do dia N inteiro (semana + 7 + N + 1 dias <= hoje), para uma semana
--     recente não parecer queda.
--   • *_pct = porcentagem das contas da semana, com uma casa decimal.
--
-- Mesmo isolamento do schema saude: fora da API, sem anon/authenticated.
-- ============================================================================

create or replace view saude.retencao_nuvem as
with contas as (
  select
    u.id,
    u."createdAt" as criada_em,
    date_trunc('week', u."createdAt")::date as semana
  from public."User" u
),
voltas as (
  select
    c.id,
    c.semana,
    bool_or(t."createdAt" >= c.criada_em + interval '1 day'
        and t."createdAt" <  c.criada_em + interval '2 days')  as d1,
    bool_or(t."createdAt" >= c.criada_em + interval '7 days'
        and t."createdAt" <  c.criada_em + interval '8 days')  as d7,
    bool_or(t."createdAt" >= c.criada_em + interval '30 days'
        and t."createdAt" <  c.criada_em + interval '31 days') as d30
  from contas c
  left join public."Transaction" t on t."userId" = c.id
  group by c.id, c.semana
),
semanas as (
  select
    semana,
    count(*)::integer as contas,
    case when semana + 9 <= current_date
         then (count(*) filter (where d1))::integer end as d1,
    case when semana + 15 <= current_date
         then (count(*) filter (where d7))::integer end as d7,
    case when semana + 38 <= current_date
         then (count(*) filter (where d30))::integer end as d30
  from voltas
  group by semana
)
select
  semana,
  contas,
  d1,
  d7,
  d30,
  round(100.0 * d1  / contas, 1) as d1_pct,
  round(100.0 * d7  / contas, 1) as d7_pct,
  round(100.0 * d30 / contas, 1) as d30_pct
from semanas;

revoke all on saude.retencao_nuvem from public, anon, authenticated;

-- O papel de leitura do alerta diário (docs/observabilidade/painel-saude.md)
-- recebeu SELECT nas views que existiam quando foi criado; esta é nova.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'saude_leitura') then
    grant select on saude.retencao_nuvem to saude_leitura;
  end if;
end $$;
