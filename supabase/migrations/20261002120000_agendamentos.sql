-- ============================================================================
-- Tarefas agendadas no banco: retenção de dados e reconciliação de assinaturas
-- ============================================================================
-- Até aqui as duas rodavam como workers BullMQ do backend Express
-- (backend/workers/retention.worker.js e billing-reconcile.worker.js), que
-- saiu do projeto (ADR 0007). O agendador passa a ser o pg_cron do Supabase:
--
--   fp-retencao           03:17 UTC  select public.fp_purge_retention()
--   fp-billing-reconcile  04:41 UTC  select public.fp_disparar_billing_reconcile()
--
-- A retenção é SQL puro. A reconciliação precisa da API do Google e do Stripe,
-- então o pg_cron só dispara a Edge Function billing-reconcile pelo pg_net,
-- com o segredo guardado no Vault (passo a passo em
-- docs/release/ligar-operacao.md). Sem os segredos, o disparo não faz nada e
-- diz por quê.
--
-- Num Postgres sem pg_cron (o do CI, por exemplo) as funções são criadas e o
-- agendamento é pulado com um aviso: os testes exercitam as funções direto.
-- ============================================================================

-- ─── Retenção (LGPD art. 15 e 16) ───────────────────────────────────────────
--
-- Prazos e motivos em docs/retencao-de-dados.md. Quanto mais o registro
-- identifica alguém, mais curto o prazo. O teste tests/retencao-politica.test.js
-- exige que todo modelo do schema.prisma esteja aqui ou na lista de isentos.
--
-- Idempotente (o critério é a data) e tolerante a falha parcial: uma tabela
-- que falha não impede as outras e aparece no resultado como "erro: …", em vez
-- de a política parecer aplicada enquanto o dado se acumula.

create or replace function public.fp_purge_retention(p_agora timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  n bigint;
  resultado jsonb := '{}'::jsonb;
begin
  for r in
    select * from (values
      ('Session',            'expiresAt',   30),
      ('VerificationToken',  'expiresAt',    7),
      ('Invitation',         'expiresAt',   30),
      ('JobLog',             'createdAt',   90),
      ('AuditLog',           'createdAt',  365),
      ('SyncOp',             'processedAt', 90),
      ('StripeWebhookEvent', 'processedAt', 90)
    ) as politica(tabela, campo, dias)
  loop
    begin
      execute format('delete from public.%I where %I < $1', r.tabela, r.campo)
        using (p_agora - make_interval(days => r.dias)) at time zone 'UTC';
      get diagnostics n = row_count;
      resultado := resultado || jsonb_build_object(r.tabela, n);
    exception when others then
      raise warning 'retenção: % falhou: %', r.tabela, sqlerrm;
      resultado := resultado || jsonb_build_object(r.tabela, 'erro: ' || sqlerrm);
    end;
  end loop;
  return resultado;
end;
$$;

revoke all on function public.fp_purge_retention(timestamptz) from public, anon, authenticated;

-- ─── Disparo da reconciliação ───────────────────────────────────────────────
--
-- Lê do Vault a URL do projeto (fp_project_url, ex. https://<ref>.supabase.co)
-- e o segredo da função (fp_billing_reconcile_secret, o mesmo valor de
-- BILLING_RECONCILE_SECRET nas secrets das Edge Functions) e faz o POST. O
-- pg_net é assíncrono: o resultado fica em net._http_response.

create or replace function public.fp_disparar_billing_reconcile()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_url text;
  v_segredo text;
  v_id bigint;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    return 'sem-pg_net';
  end if;
  if to_regclass('vault.decrypted_secrets') is null then
    return 'sem-vault';
  end if;

  execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'fp_project_url'$q$
    into v_url;
  execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'fp_billing_reconcile_secret'$q$
    into v_segredo;
  if coalesce(v_url, '') = '' or coalesce(v_segredo, '') = '' then
    raise warning 'billing-reconcile: faltam fp_project_url ou fp_billing_reconcile_secret no Vault';
    return 'sem-segredos';
  end if;

  execute $q$select net.http_post(url := $1, headers := $2, body := '{}'::jsonb, timeout_milliseconds := 60000)$q$
    into v_id
    using rtrim(v_url, '/') || '/functions/v1/billing-reconcile',
          jsonb_build_object('Content-Type', 'application/json', 'x-fp-cron-secret', v_segredo);
  return 'disparado:' || v_id;
end;
$$;

revoke all on function public.fp_disparar_billing_reconcile() from public, anon, authenticated;

-- ─── Agendamento ────────────────────────────────────────────────────────────
--
-- cron.schedule com nome substitui o job de mesmo nome: reaplicar a migração
-- não duplica. Minutos quebrados para não cair no pico de jobs do :00.

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;

  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('fp-retencao', '17 3 * * *', 'select public.fp_purge_retention()');
    perform cron.schedule('fp-billing-reconcile', '41 4 * * *', 'select public.fp_disparar_billing_reconcile()');
  else
    raise notice 'pg_cron indisponível neste Postgres: fp-retencao e fp-billing-reconcile não foram agendados';
  end if;
end;
$$;
