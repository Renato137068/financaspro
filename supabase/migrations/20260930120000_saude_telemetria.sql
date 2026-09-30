-- ============================================================================
-- Painel de saúde: uso por versão, erros por 1.000 sessões e funil de nuvem
-- ============================================================================
-- Etapa 4 do roadmap. Os relatórios de erro (fp_client_error) diziam quantos
-- erros cada versão teve, mas não de quantas vezes o app foi aberto: uma
-- versão com mais usuários parecia pior do que era.
--
-- 1. Contagem de uso anônima (public.fp_app_sessao_dia). O app manda no
--    máximo um aviso por dia por aparelho, só com a versão, pela Edge Function
--    obs-ingest e sob o mesmo opt-out dos relatórios de erro. Aqui só existe o
--    CONTADOR por dia e versão: nenhuma linha por aparelho, sem IP, usuário,
--    user agent ou horário. Retenção de 30 dias, aplicada pela função.
-- 2. Schema `saude`, fora da API: o PostgREST do Supabase só expõe `public` e
--    `graphql_public`, e ninguém além do dono recebe acesso a ele. Leitura
--    pelo painel SQL do Supabase ou pelo script do alerta (conexão direta,
--    scripts/saude-relatorio.cjs).
-- 3. Funil de nuvem por semana de cadastro, das tabelas que já existem (sem
--    coleta nova): conta criada, primeiro lançamento, ativo no 30º dia,
--    trial de boas-vindas, assinatura paga.
-- ============================================================================

-- 1. Contador de uso -----------------------------------------------------------

create table if not exists public.fp_app_sessao_dia (
  dia         date    not null default ((now() at time zone 'utc')::date),
  app_version text    not null,
  sessoes     integer not null default 0 check (sessoes >= 0),
  primary key (dia, app_version),
  -- Só X.Y.Z: a função já valida, e isto impede que lixo infle a tabela.
  constraint fp_app_sessao_dia_versao check (app_version ~ '^\d{1,3}\.\d{1,3}\.\d{1,4}$')
);

alter table public.fp_app_sessao_dia enable row level security;
revoke all on table public.fp_app_sessao_dia from anon, authenticated;

-- Soma 1 ao contador do dia (UTC) e da versão. Atômico: dois avisos ao mesmo
-- tempo não se perdem. Só a Edge Function (service_role) chama.
create or replace function public.fp_obs_contar_sessao(p_versao text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.fp_app_sessao_dia (dia, app_version, sessoes)
  values ((now() at time zone 'utc')::date, p_versao, 1)
  on conflict (dia, app_version)
  do update set sessoes = public.fp_app_sessao_dia.sessoes + 1;
$$;

revoke all on function public.fp_obs_contar_sessao(text) from public, anon, authenticated;
grant execute on function public.fp_obs_contar_sessao(text) to service_role;

-- 2 e 3. Painel -----------------------------------------------------------------

create schema if not exists saude;
revoke all on schema saude from public, anon, authenticated;

-- Por dia e versão: sessões, erros e erros por 1.000 sessões. Os relatórios de
-- erro não carregam identificador de sessão (de propósito), então a métrica é
-- a razão, não "sessões sem erro".
create or replace view saude.versao_diaria as
with erros as (
  select (created_at at time zone 'utc')::date as dia, app_version, count(*)::integer as erros
  from public.fp_client_error
  where kind = 'error' and app_version is not null
  group by 1, 2
)
select
  coalesce(s.dia, e.dia)                 as dia,
  coalesce(s.app_version, e.app_version) as app_version,
  coalesce(s.sessoes, 0)                 as sessoes,
  coalesce(e.erros, 0)                   as erros,
  case when coalesce(s.sessoes, 0) > 0
       then round(1000.0 * coalesce(e.erros, 0) / s.sessoes, 1) end as erros_por_mil
from public.fp_app_sessao_dia s
full join erros e on e.dia = s.dia and e.app_version = s.app_version;

-- Por versão, na janela guardada (30 dias): o que o alerta compara.
create or replace view saude.versao_resumo as
select
  app_version,
  min(dia)     as primeiro_dia,
  max(dia)     as ultimo_dia,
  sum(sessoes)::integer as sessoes,
  sum(erros)::integer   as erros,
  case when sum(sessoes) > 0 then round(1000.0 * sum(erros) / sum(sessoes), 1) end as erros_por_mil
from saude.versao_diaria
group by app_version;

-- Funil de quem tem conta, por semana de cadastro. "Ativo no 30º dia" = lançou
-- algo 30 dias ou mais depois de criar a conta; só conta para semanas que já
-- tiveram 30 dias inteiros (senão fica nulo, em vez de parecer queda).
create or replace view saude.funil_nuvem as
with contas as (
  select
    u.id,
    u."createdAt" as criada_em,
    date_trunc('week', u."createdAt")::date as semana
  from public."User" u
)
select
  c.semana,
  count(*)::integer as contas,
  count(*) filter (where exists (
    select 1 from public."Transaction" t where t."userId" = c.id
  ))::integer as com_lancamento,
  case when c.semana + 37 <= current_date then
    count(*) filter (where exists (
      select 1 from public."Transaction" t
      where t."userId" = c.id and t."createdAt" >= c.criada_em + interval '30 days'
    ))::integer
  end as ativos_d30,
  count(*) filter (where exists (
    select 1 from public.fp_welcome_trial_grant g where g.user_id::text = c.id
  ))::integer as com_trial,
  count(*) filter (where exists (
    select 1
    from public."OrganizationMember" m
    join public."Subscription" s on s."orgId" = m."orgId"
    where m."userId" = c.id and s.status = 'ACTIVE'
  ))::integer as assinantes
from contas c
group by c.semana;

revoke all on all tables in schema saude from public, anon, authenticated;
