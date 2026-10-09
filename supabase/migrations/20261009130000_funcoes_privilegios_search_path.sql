-- ============================================================================
-- Detalhes de permissão das funções privilegiadas (achado 7 da auditoria do
-- servidor, 09/10/2026)
-- ============================================================================

-- ─── fp_plan_tier: anon não executa ─────────────────────────────────────────
-- SECURITY DEFINER e executável por qualquer papel: quem soubesse o id de
-- outra pessoa descobria o plano dela sem login. Ninguém chama como anon: o
-- app não faz rpc('fp_plan_tier') e as Edge Functions não usam; quem chama
-- são os gatilhos de cota (fp_enforce_*_quota, SECURITY INVOKER), que rodam
-- como o papel de quem grava. Ficam authenticated (o app logado) e
-- service_role.
--
-- Não entra aqui a outra metade da sugestão da auditoria (aceitar só o
-- próprio auth.uid() fora dos gatilhos): muda o que a função devolve para
-- membro de org e para service_role, e merece teste próprio.
revoke execute on function public.fp_plan_tier(text) from public, anon;
grant execute on function public.fp_plan_tier(text) to authenticated, service_role;

-- ─── search_path com pg_temp no fim ─────────────────────────────────────────
-- Sem pg_temp explícito, o Postgres procura pg_temp ANTES do search_path
-- declarado para tabelas e visões: uma tabela temporária com o mesmo nome
-- seria usada no lugar da real dentro de uma função SECURITY DEFINER. Todas
-- as outras funções privilegiadas do projeto já terminam com pg_temp.
-- ALTER muda só a configuração: corpo, dono e permissões ficam como estão.
alter function public.fp_obs_contar_sessao(text) set search_path = public, pg_temp;
alter function public.handle_new_user() set search_path = public, pg_temp;
