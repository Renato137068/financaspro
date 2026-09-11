-- ============================================================================
-- Códigos de recuperação do 2FA
-- ============================================================================
-- Sem isto, perder o aparelho com o autenticador = perder a conta. O Supabase
-- não oferece backup codes prontos, então o fluxo é nosso:
--
--   gerar   → exige AAL2 (quem já está dentro com o segundo fator)
--   consumir→ funciona em AAL1 (é justamente quem NÃO tem mais o autenticador)
--
-- Consumir um código remove o fator TOTP verificado da conta. O usuário volta
-- a entrar só com a senha e é instruído a reativar o 2FA. É a única saída
-- possível dentro do modelo do Supabase: um JWT AAL1 não vira AAL2 por SQL.
--
-- Por isso o código é tratado como segredo de alto valor: 64 bits de entropia,
-- guardado só como SHA-256, uso único, e todos os demais são invalidados
-- junto (com o 2FA desligado, eles não servem para mais nada).
-- ============================================================================

create table if not exists public."MfaRecoveryCode" (
  id         uuid primary key default gen_random_uuid(),
  "userId"   uuid not null references auth.users(id) on delete cascade,
  "codeHash" text not null,
  "usedAt"   timestamptz,
  "createdAt" timestamptz not null default now()
);

create index if not exists mfa_recovery_user_idx
  on public."MfaRecoveryCode" ("userId") where "usedAt" is null;

-- Negado por padrão: o cliente nunca lê nem escreve esta tabela direto.
-- Todo acesso passa pelas funções abaixo (SECURITY DEFINER), que decidem o
-- que pode ser feito e em qual nível de autenticação.
alter table public."MfaRecoveryCode" enable row level security;
revoke all on table public."MfaRecoveryCode" from anon, authenticated;

-- ─── Hash ───────────────────────────────────────────────────────────────────
-- O userId entra no hash: dois usuários com o mesmo código não colidem, e um
-- vazamento da tabela não permite comparar hashes entre contas.
create or replace function public.fp_mfa_recovery_hash(p_user uuid, p_code text)
returns text
language sql
immutable
set search_path = public, extensions, pg_temp
as $$
  select encode(
    extensions.digest(p_user::text || ':' || upper(regexp_replace(p_code, '[^a-zA-Z0-9]', '', 'g')), 'sha256'),
    'hex'
  );
$$;

-- ─── Gerar (exige AAL2) ─────────────────────────────────────────────────────
create or replace function public.fp_mfa_recovery_generate()
returns setof text
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  uid uuid := auth.uid();
  novo text;
  i int;
begin
  if uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- Gerar códigos é operação sensível: só para quem já provou o segundo fator.
  -- fp_mfa_ok() devolve true para quem ainda não tem 2FA (está ativando agora).
  if not public.fp_mfa_ok() then
    raise exception 'MFA_REQUIRED';
  end if;

  -- Gerar de novo invalida os anteriores — a lista impressa antiga não vale.
  delete from public."MfaRecoveryCode" where "userId" = uid;

  for i in 1..10 loop
    -- 8 bytes = 64 bits, em 16 hex maiúsculos: FA3C-91B0-77DE-2A45
    novo := upper(encode(extensions.gen_random_bytes(8), 'hex'));
    novo := substr(novo,1,4) || '-' || substr(novo,5,4) || '-'
         || substr(novo,9,4) || '-' || substr(novo,13,4);

    insert into public."MfaRecoveryCode" ("userId", "codeHash")
    values (uid, public.fp_mfa_recovery_hash(uid, novo));

    return next novo;
  end loop;
end;
$$;

-- ─── Quantos restam ─────────────────────────────────────────────────────────
create or replace function public.fp_mfa_recovery_count()
returns integer
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select coalesce(count(*), 0)::int
  from public."MfaRecoveryCode"
  where "userId" = auth.uid() and "usedAt" is null;
$$;

-- ─── Consumir (funciona em AAL1 — é o ponto) ────────────────────────────────
create or replace function public.fp_mfa_recovery_consume(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  uid uuid := auth.uid();
  alvo uuid;
begin
  if uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select id into alvo
  from public."MfaRecoveryCode"
  where "userId" = uid
    and "usedAt" is null
    and "codeHash" = public.fp_mfa_recovery_hash(uid, p_code)
  limit 1;

  if alvo is null then
    return false;
  end if;

  update public."MfaRecoveryCode" set "usedAt" = now() where id = alvo;

  -- Remove o segundo fator: é o que devolve a conta a quem perdeu o aparelho.
  delete from auth.mfa_factors where user_id = uid;

  -- Com o 2FA desligado, os códigos restantes não protegem mais nada e viram
  -- só risco guardado. Fora.
  delete from public."MfaRecoveryCode" where "userId" = uid;

  return true;
end;
$$;

revoke all on function public.fp_mfa_recovery_generate() from public;
revoke all on function public.fp_mfa_recovery_count() from public;
revoke all on function public.fp_mfa_recovery_consume(text) from public;
grant execute on function public.fp_mfa_recovery_generate() to authenticated;
grant execute on function public.fp_mfa_recovery_count() to authenticated;
grant execute on function public.fp_mfa_recovery_consume(text) to authenticated;
