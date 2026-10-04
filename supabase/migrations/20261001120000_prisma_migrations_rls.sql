-- ============================================================================
-- _prisma_migrations fora da API (achado B1 da reauditoria de 30/09)
-- ============================================================================
-- Era a única tabela do `public` sem RLS. O teste de cobertura a liberava
-- dizendo que ela "nunca é exposta pelo PostgREST", mas o PostgREST expõe
-- todo o `public` a quem tem privilégio, e os privilégios padrão do Supabase
-- dão SELECT a anon/authenticated nas tabelas que o dono cria. Qualquer um
-- com a chave anon lia nomes e datas de migração e os logs de erro do Prisma.
--
-- RLS sem policy nega tudo a anon/authenticated. O Prisma não sente: conecta
-- como dono da tabela, e o dono passa por cima de RLS (não há FORCE). O
-- revoke fecha também o caminho do privilégio.
--
-- Condicional: num banco em que o Prisma nunca rodou (supabase db reset
-- local), a tabela não existe e não há o que fechar.
-- ============================================================================

do $$
begin
  if to_regclass('public._prisma_migrations') is not null then
    execute 'alter table public._prisma_migrations enable row level security';
    execute 'revoke all on table public._prisma_migrations from anon, authenticated';
  end if;
end
$$;
