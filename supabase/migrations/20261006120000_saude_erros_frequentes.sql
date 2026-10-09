-- ============================================================================
-- Painel de saúde: QUAIS erros (complementa 20260930120000_saude_telemetria).
--
-- versao_resumo diz que uma versão piorou; para corrigir é preciso saber o
-- quê. Esta view agrupa os relatórios dos últimos 7 dias por versão, mensagem
-- e onde aconteceu (contexto->>'contexto'), com a primeira linha da pilha do
-- caso mais recente. `novo` marca a mensagem que não apareceu antes da janela
-- (o painel só a trata como novidade quando há histórico anterior).
--
-- Mesmo isolamento do schema saude: fora da API, sem anon/authenticated.
-- ============================================================================

create or replace view saude.erros_frequentes as
select
  e.app_version,
  e.message,
  e.contexto ->> 'contexto' as onde,
  count(*)::integer as ocorrencias,
  min(e.created_at) as primeira,
  max(e.created_at) as ultima,
  (array_agg(split_part(coalesce(e.stack, ''), E'\n', 2) order by e.created_at desc))[1] as pilha,
  not exists (
    select 1 from public.fp_client_error o
    where o.kind = 'error' and o.message = e.message
      and o.created_at < now() - interval '7 days'
  ) as novo
from public.fp_client_error e
where e.kind = 'error' and e.created_at >= now() - interval '7 days'
group by e.app_version, e.message, e.contexto ->> 'contexto';

revoke all on saude.erros_frequentes from public, anon, authenticated;

-- O papel de leitura do alerta diário (docs/observabilidade/painel-saude.md)
-- recebeu SELECT nas views que existiam quando foi criado; esta é nova.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'saude_leitura') then
    grant select on saude.erros_frequentes to saude_leitura;
  end if;
end $$;
