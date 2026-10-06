-- ============================================================================
-- Painel de saúde: quais erros (pgTAP) —
-- supabase/migrations/20261006120000_saude_erros_frequentes.sql
--
-- O que precisa ser verdade:
--   • agrupa por versão, mensagem e onde, só na janela de 7 dias, só kind=error;
--   • a pilha mostrada é a primeira linha de código do caso mais recente;
--   • `novo` só para mensagem que não apareceu antes da janela;
--   • authenticated não lê; o papel de leitura do painel lê.
-- ============================================================================

begin;
select plan(7);

select has_view('saude', 'erros_frequentes', 'view dos erros mais frequentes existe');

insert into public.fp_client_error (created_at, app_version, message, stack, contexto) values
  (now() - interval '1 day',  '11.3.19', 'x is undefined', E'TypeError: x\n    at a (app.bundle.js:1:10)', '{"contexto":"render:resumo"}'),
  (now() - interval '2 hours', '11.3.19', 'x is undefined', E'TypeError: x\n    at b (app.bundle.js:1:20)', '{"contexto":"render:resumo"}'),
  (now() - interval '1 hour', '11.3.19', 'x is undefined', E'TypeError: x\n    at c (app.bundle.js:1:30)', '{"contexto":"render:extrato"}'),
  (now() - interval '3 days', '11.3.19', 'velho', null, '{}'),
  (now() - interval '20 days', '11.3.18', 'velho', null, '{}'),
  (now() - interval '9 days', '11.3.19', 'fora da janela', null, '{}');
insert into public.fp_client_error (app_version, kind, message) values ('11.3.19', 'outro', 'x is undefined');

select results_eq(
  $$ select onde, ocorrencias from saude.erros_frequentes
     where message = 'x is undefined' order by onde $$,
  $$ values ('render:extrato', 1), ('render:resumo', 2) $$,
  'agrupa por onde aconteceu e ignora o que não é erro'
);
select is(
  (select pilha from saude.erros_frequentes where message = 'x is undefined' and onde = 'render:resumo'),
  '    at b (app.bundle.js:1:20)',
  'pilha: primeira linha de código do caso mais recente'
);
select is_empty(
  $$ select 1 from saude.erros_frequentes where message = 'fora da janela' $$,
  'erro de mais de 7 dias fica de fora'
);
select results_eq(
  $$ select message, novo from saude.erros_frequentes
     where message in ('x is undefined', 'velho') and coalesce(onde, '') <> 'render:extrato' order by message $$,
  $$ values ('velho'::text, false), ('x is undefined'::text, true) $$,
  'novo só para a mensagem que não apareceu antes da janela'
);

set local role authenticated;
select throws_ok(
  $$ select count(*) from saude.erros_frequentes $$,
  '42501', null, 'authenticated não lê os erros do painel'
);
reset role;

create role saude_leitura_teste2;
grant usage on schema saude to saude_leitura_teste2;
grant select on all tables in schema saude to saude_leitura_teste2;
set local role saude_leitura_teste2;
select lives_ok(
  $$ select * from saude.erros_frequentes $$,
  'papel com grant só no schema saude lê os erros'
);
reset role;

select * from finish();
