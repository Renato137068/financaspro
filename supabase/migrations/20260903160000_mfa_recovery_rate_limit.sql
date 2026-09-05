-- ============================================================================
-- M1 — Limite de tentativas no consumo de código de recuperação
-- ============================================================================
-- Sinceridade sobre o que isto resolve: os códigos têm 64 bits de entropia, e
-- adivinhar um por força bruta online é inviável mesmo sem limite nenhum. Não
-- é correção de falha — é defesa em profundidade, e vale por três motivos:
--
--   1. Registro. Sem tentativa gravada, ninguém percebe alguém tentando.
--   2. Não depender da premissa de entropia estar certa para sempre. Se um dia
--      o formato do código mudar, o limite já está de pé.
--   3. Custo. Cada chamada faz hash e varre índice; sem teto, é um vetor barato
--      de desperdício de banco para quem já tem a senha da conta.
--
-- Regra: 5 falhas em 15 minutos bloqueiam novas tentativas até a mais antiga
-- sair da janela. Acerto não é bloqueado por falhas anteriores — quem lembrou
-- do código certo entra.
-- ============================================================================

create table if not exists public."MfaRecoveryAttempt" (
  id            bigint generated always as identity primary key,
  "userId"      uuid not null references auth.users(id) on delete cascade,
  "attemptedAt" timestamptz not null default now(),
  "sucesso"     boolean not null default false
);

create index if not exists mfa_recovery_attempt_idx
  on public."MfaRecoveryAttempt" ("userId", "attemptedAt" desc);

-- Mesma postura da tabela de códigos: o cliente nunca toca nela. Só as funções
-- SECURITY DEFINER escrevem, e nada aqui é legível pelo app.
alter table public."MfaRecoveryAttempt" enable row level security;
revoke all on table public."MfaRecoveryAttempt" from anon, authenticated;

-- ─── Consumo com teto de tentativas ─────────────────────────────────────────
create or replace function public.fp_mfa_recovery_consume(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  LIMITE   constant int      := 5;
  JANELA   constant interval := interval '15 minutes';
  uid           uuid := auth.uid();
  alvo          uuid;
  falhas        int;
  falha_antiga  timestamptz;
  segundos      int;
begin
  if uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- Faxina barata: o histórico serve para auditoria recente, não para sempre.
  delete from public."MfaRecoveryAttempt"
   where "userId" = uid
     and "attemptedAt" < now() - interval '24 hours';

  select count(*), min("attemptedAt")
    into falhas, falha_antiga
    from public."MfaRecoveryAttempt"
   where "userId" = uid
     and not "sucesso"
     and "attemptedAt" > now() - JANELA;

  if falhas >= LIMITE then
    -- A janela abre de novo quando a falha mais antiga envelhece.
    segundos := greatest(1, ceil(extract(epoch from (falha_antiga + JANELA - now())))::int);
    raise exception 'RECOVERY_RATE_LIMITED:%', segundos;
  end if;

  select id into alvo
  from public."MfaRecoveryCode"
  where "userId" = uid
    and "usedAt" is null
    and "codeHash" = public.fp_mfa_recovery_hash(uid, p_code)
  limit 1;

  if alvo is null then
    insert into public."MfaRecoveryAttempt" ("userId", "sucesso") values (uid, false);
    return false;
  end if;

  update public."MfaRecoveryCode" set "usedAt" = now() where id = alvo;

  -- Remove o segundo fator: é o que devolve a conta a quem perdeu o aparelho.
  delete from auth.mfa_factors where user_id = uid;

  -- Com o 2FA desligado, os códigos restantes não protegem mais nada e viram
  -- só risco guardado. Fora.
  delete from public."MfaRecoveryCode" where "userId" = uid;

  insert into public."MfaRecoveryAttempt" ("userId", "sucesso") values (uid, true);
  return true;
end;
$$;

revoke all on function public.fp_mfa_recovery_consume(text) from public;
grant execute on function public.fp_mfa_recovery_consume(text) to authenticated;
