-- ============================================================================
-- MFA (2FA) com efeito real — exige AAL2 no banco, não só na tela.
-- ============================================================================
-- Problema que esta migration resolve:
--   signInWithPassword devolve uma sessão AAL1 VÁLIDA mesmo quando a conta tem
--   TOTP ativo. O app mostra a etapa do código, mas quem falar direto com o
--   PostgREST com essa sessão lê e escreve tudo sem passar pelo segundo fator.
--   Enquanto nenhuma policy checar o AAL, o 2FA é decoração.
--
-- Como funciona:
--   Uma policy RESTRICTIVE é combinada com AND às policies permissivas que já
--   existem — ela só pode NEGAR, nunca ampliar acesso. Quem não tem fator
--   verificado não é afetado (a função devolve true).
--
--   service_role ignora RLS por design, então as Edge Functions seguem iguais.
-- ============================================================================

-- ─── Porteiro do AAL ────────────────────────────────────────────────────────
-- SECURITY DEFINER porque auth.mfa_factors não é legível por 'authenticated'.
-- Mesmo padrão de is_org_member/is_org_editor (20260828120000).
create or replace function public.fp_mfa_ok()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select case
    -- Sem JWT (owner/postgres em migrations e testes) → não bloqueia.
    when auth.uid() is null then true
    -- Tem fator TOTP verificado: só passa sessão que completou o segundo fator.
    when exists (
      select 1
      from auth.mfa_factors f
      where f.user_id::text = auth.uid()::text
        and f.status = 'verified'
    ) then coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    -- Sem 2FA configurado: comportamento inalterado.
    else true
  end;
$$;

comment on function public.fp_mfa_ok() is
  'true quando a sessão satisfaz o AAL exigido pela conta. Usada nas policies RESTRICTIVE de 2FA.';

revoke all on function public.fp_mfa_ok() from public;
grant execute on function public.fp_mfa_ok() to authenticated;

-- ─── Policies RESTRICTIVE nas tabelas com dado do usuário ───────────────────
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
    -- Tabela ausente neste ambiente → segue para a próxima.
    continue when to_regclass('public.' || quote_ident(t)) is null;

    execute format('drop policy if exists %I on public.%I;', t || '_require_aal2', t);

    execute format($f$
      create policy %I on public.%I
        as restrictive
        for all
        to authenticated
        using (public.fp_mfa_ok())
        with check (public.fp_mfa_ok());
    $f$, t || '_require_aal2', t);
  end loop;
end $$;
