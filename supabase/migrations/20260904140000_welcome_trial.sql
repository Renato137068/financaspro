-- ============================================================================
-- Pro de boas-vindas: 14 dias de PRO na criacao da conta, sem cartao
-- ============================================================================
-- Trial reverso. O trial de 7 dias do SKU da loja exige cartao antes de o
-- usuario ter visto valor nenhum, e 7 dias nem cobrem um fechamento de mes --
-- que e exatamente quando o app mostra para que serve. Aqui o usuario passa
-- duas semanas COM os recursos pagos, forma habito, e depois os perde: a
-- decisao deixa de ser sobre uma lista de features e passa a ser sobre algo
-- que ele ja viveu.
--
-- Nao e assinatura da loja, e entitlement nosso (status TRIALING com
-- trialEndsAt). Por isso convive com o trial do SKU sem conflitar com a
-- politica da Play.
-- ============================================================================

-- ─── Idempotencia: uma concessao por usuario, para sempre ───────────────────
-- Sem esta tabela, sair da conta e entrar de novo renovaria o Pro
-- indefinidamente. A chave e o usuario, nao a org: criar uma org nova tambem
-- nao pode ganhar mais 14 dias.
create table if not exists public.fp_welcome_trial_grant (
  user_id    uuid primary key,
  org_id     text        not null,
  granted_at timestamptz not null default now(),
  ends_at    timestamptz not null
);

alter table public.fp_welcome_trial_grant enable row level security;

-- Só o dono enxerga a própria concessão; a escrita é exclusiva da Edge
-- Function (service_role), nunca do cliente.
drop policy if exists fp_welcome_trial_self_read on public.fp_welcome_trial_grant;
create policy fp_welcome_trial_self_read
  on public.fp_welcome_trial_grant
  for select
  using (auth.uid() = user_id);

-- ─── Trial vencido nao vale mais tier ───────────────────────────────────────
-- fp_plan_tier aceitava TRIALING sem olhar a data. Para assinatura do Stripe
-- isso funcionava porque o webhook vira o status; um entitlement nosso nao tem
-- webhook nenhum, entao um trial vencido daria PRO para sempre. A data passa a
-- ser a fonte da verdade -- o que tambem protege contra webhook atrasado.
create or replace function public.fp_plan_tier(uid text)
returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_tier text;
begin
  if uid is null or btrim(uid) = '' then
    return 'FREE';
  end if;

  select p.tier::text into v_tier
  from public."OrganizationMember" m
  join public."Organization" o on o.id = m."orgId"
  join public."Subscription" s on s."orgId" = o.id
  join public."Plan" p on p.id = s."planId"
  where m."userId" = uid
    and o.active = true
    and (
      s.status::text = 'ACTIVE'
      or (
        s.status::text = 'TRIALING'
        and (s."trialEndsAt" is null or s."trialEndsAt" > now())
      )
    )
  order by m."joinedAt" asc
  limit 1;

  if v_tier is not null then
    return v_tier;
  end if;

  return 'FREE';
end;
$$;
