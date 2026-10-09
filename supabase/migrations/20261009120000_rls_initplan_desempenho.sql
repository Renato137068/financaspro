-- ============================================================================
-- RLS com custo por consulta, não por linha (achado 3 da auditoria do servidor,
-- 09/10/2026)
-- ============================================================================
-- As regras chamavam auth.uid(), is_org_member()/is_org_editor() e
-- fp_mfa_ok() como expressão da linha. O Postgres reavaliava as três a cada
-- linha lida e, sem um valor fixo para comparar, não usava os índices de
-- "userId" e "orgId": o pull do app (select * paginado, sem filtro, confiando
-- na RLS) varria a tabela inteira de todos os usuários a cada página.
--
-- Mesma regra, outra forma:
--   * auth.uid() e fp_mfa_ok() entram como (select ...): viram InitPlan,
--     calculados uma vez por consulta.
--   * is_org_member("orgId") / is_org_editor("orgId") viram
--     "orgId" = any(<ids das orgs do usuário>), com a lista calculada uma vez
--     (fp_org_ids_membro / fp_org_ids_editor, abaixo). Com valores fixos, o
--     planejador combina os índices de "userId" e "orgId" (BitmapOr).
--
-- Semântica idêntica, linha a linha:
--   is_org_member(o) = exists(membro com orgId = o e userId = auth.uid())
--                    = o = any(array dos orgId em que auth.uid() é membro)
--   e o mesmo para editor (papéis OWNER, ADMIN, MEMBER; VIEWER só lê).
--   As duas funções são SECURITY DEFINER e leem OrganizationMember como as
--   antigas (ignorando a RLS dela), e como elas ficam executáveis por PUBLIC:
--   só devolvem as orgs de quem chama.
--
-- Medido em Postgres 16 local, 200 mil lançamentos de 200 usuários, 10% em
-- org, como `authenticated`, primeira página de 1.000 do último usuário:
--   antes: 1.898 a 2.033 ms sem order (Seq Scan) e 1.050 a 1.124 ms com
--          order by id (Index Scan na chave primária, 111 mil linhas descartadas)
--   depois: 1,0 a 1,6 ms nos dois casos (Bitmap Index Scan em userId + orgId)
--
-- Idempotente: drop policy if exists + create; funções com create or replace.
-- ============================================================================

-- ─── Orgs do usuário, calculadas uma vez por consulta ───────────────────────
create or replace function public.fp_org_ids_membro()
returns text[]
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(array_agg(m."orgId"), '{}'::text[])
  from public."OrganizationMember" m
  where m."userId" = auth.uid()::text;
$$;

create or replace function public.fp_org_ids_editor()
returns text[]
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(array_agg(m."orgId"), '{}'::text[])
  from public."OrganizationMember" m
  where m."userId" = auth.uid()::text
    and m.role::text in ('OWNER','ADMIN','MEMBER');   -- VIEWER é só leitura
$$;

comment on function public.fp_org_ids_membro() is
  'Orgs em que auth.uid() é membro. Forma indexável de is_org_member() nas policies.';
comment on function public.fp_org_ids_editor() is
  'Orgs em que auth.uid() edita (OWNER, ADMIN, MEMBER). Forma indexável de is_org_editor() nas policies.';

-- ─── Tabelas financeiras (dono OU org) ──────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['Transaction','Account','Budget','RecurringTransaction']
  loop
    continue when to_regclass('public.' || quote_ident(t)) is null;

    execute format('drop policy if exists %I on public.%I;', t||'_select', t);
    execute format($f$
      create policy %I on public.%I for select using (
        "userId" = (select auth.uid())::text
        or ("orgId" is not null and "orgId" = any ((select public.fp_org_ids_membro())::text[]))
      );$f$, t||'_select', t);

    execute format('drop policy if exists %I on public.%I;', t||'_insert', t);
    execute format($f$
      create policy %I on public.%I for insert with check (
        "userId" = (select auth.uid())::text
        and ("orgId" is null or "orgId" = any ((select public.fp_org_ids_editor())::text[]))
      );$f$, t||'_insert', t);

    execute format('drop policy if exists %I on public.%I;', t||'_update', t);
    execute format($f$
      create policy %I on public.%I for update using (
        "userId" = (select auth.uid())::text
        or ("orgId" is not null and "orgId" = any ((select public.fp_org_ids_editor())::text[]))
      );$f$, t||'_update', t);

    execute format('drop policy if exists %I on public.%I;', t||'_delete', t);
    execute format($f$
      create policy %I on public.%I for delete using (
        "userId" = (select auth.uid())::text
        or ("orgId" is not null and "orgId" = any ((select public.fp_org_ids_editor())::text[]))
      );$f$, t||'_delete', t);
  end loop;
end $$;

-- ─── Tabelas só-do-dono ─────────────────────────────────────────────────────
drop policy if exists userconfig_all on public."UserConfig";
create policy userconfig_all on public."UserConfig"
  for all using ("userId" = (select auth.uid())::text) with check ("userId" = (select auth.uid())::text);

drop policy if exists syncop_all on public."SyncOp";
create policy syncop_all on public."SyncOp"
  for all using ("userId" = (select auth.uid())::text) with check ("userId" = (select auth.uid())::text);

drop policy if exists ofc_all on public."OpenFinanceConnection";
create policy ofc_all on public."OpenFinanceConnection"
  for all using ("userId" = (select auth.uid())::text) with check ("userId" = (select auth.uid())::text);

-- ─── 2FA: as RESTRICTIVE de 20260902120000_require_aal2.sql ────────────────
-- fp_mfa_ok() consulta auth.mfa_factors; como expressão da linha, era uma
-- consulta por linha lida.
do $$
declare t text;
begin
  foreach t in array array[
    'Transaction','Account','Budget','RecurringTransaction',
    'UserConfig','SyncOp','OpenFinanceConnection',
    'User','Organization','OrganizationMember','Invitation',
    'Subscription','UsageRecord','Invoice'
  ]
  loop
    continue when to_regclass('public.' || quote_ident(t)) is null;

    execute format('drop policy if exists %I on public.%I;', t || '_require_aal2', t);
    execute format($f$
      create policy %I on public.%I
        as restrictive
        for all
        to authenticated
        using ((select public.fp_mfa_ok()))
        with check ((select public.fp_mfa_ok()));
    $f$, t || '_require_aal2', t);
  end loop;
end $$;
