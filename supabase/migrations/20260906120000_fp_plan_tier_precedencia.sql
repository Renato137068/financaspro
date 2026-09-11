-- ============================================================================
-- fp_plan_tier: resolver pelo MELHOR plano, não pelo mais antigo
-- ============================================================================
-- Achado da auditoria pré-beta (02).
--
-- A versão anterior fazia `order by m."joinedAt" asc limit 1` — a associação
-- mais antiga vencia. Como handle_new_organization cria uma Subscription FREE
-- ACTIVE junto com toda organização, e como todo mundo ganha a própria org no
-- cadastro, essa "mais antiga" é sempre a org pessoal do usuário.
--
-- O efeito prático quebra exatamente o que o Pro vende. O plano tem
-- maxUsers = 2 e teamFeatures = true; o segundo assento existe para alguém ser
-- convidado. Esse convidado se cadastra (org própria FREE, joinedAt = T1),
-- aceita o convite (org Pro, joinedAt = T2 > T1) e continua com os limites do
-- FREE, porque T1 vem primeiro. O dono paga por um assento que não entrega
-- nada.
--
-- O inverso também doía: quem já tinha Pro e era convidado para uma org FREE
-- de um colega podia acabar rebaixado pela ordem de entrada.
--
-- A ordenação passa a ser por precedência de plano — BUSINESS > PRO > FREE —
-- com joinedAt só como desempate entre orgs do mesmo nível. Nenhuma outra
-- regra muda: TRIALING continua exigindo trialEndsAt no futuro, org inativa
-- continua fora, e a ausência de assinatura válida continua caindo em FREE.
-- ============================================================================

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
  order by
    case p.tier::text
      when 'BUSINESS' then 0
      when 'PRO'      then 1
      else                 2
    end asc,
    m."joinedAt" asc
  limit 1;

  if v_tier is not null then
    return v_tier;
  end if;

  return 'FREE';
end;
$$;
