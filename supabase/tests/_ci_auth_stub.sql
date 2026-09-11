-- Bootstrap mínimo para pgTAP no Postgres de CI (sem supabase start).
-- Emula auth.uid()/auth.jwt() e schema auth.* usados pelas migrations e testes.
--
-- pgTAP é carregado ANTES deste arquivo por test-supabase-pgtap.cjs (via
-- psql -f do pgtap--<versão>.sql do cliente), porque a imagem postgres:alpine
-- do CI não traz a extensão instalada no servidor — CREATE EXTENSION falharia.

CREATE SCHEMA IF NOT EXISTS auth;

-- No Supabase o pgcrypto mora no schema `extensions` (ex.: extensions.digest
-- usado pelas migrations de MFA/recovery codes). O Postgres cru do CI não tem
-- isso; recriamos. pgcrypto é contrib e vem na imagem postgres, ao contrário
-- do pgtap.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role;
  END IF;
END $$;

-- No Supabase real o service_role ignora RLS (BYPASSRLS). As Edge Functions
-- contam com isso; replicamos para os testes que exercitam esse caminho.
ALTER ROLE service_role BYPASSRLS;

GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
GRANT USAGE ON SCHEMA auth TO authenticated, service_role;

-- Concessões padrão do Supabase: os papéis recebem privilégios nas tabelas de
-- public e a RLS (policies) é que filtra as linhas. Roda depois do prisma
-- migrate (tabelas já existem) e ANTES das migrations Supabase, que então
-- REVOGAM tabelas específicas (ex.: as de MFA, acessadas só por funções SECDEF).
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

-- E o mesmo para as tabelas que as migrations Supabase criam DEPOIS deste
-- bootstrap (ex.: fp_plan_limit_config, lido pelos triggers de quota que NÃO
-- são SECDEF). As migrations rodam como este mesmo papel, então default
-- privileges cobrem o que elas criarem; as tabelas de MFA revogam a seguir.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  email text,
  -- Espelha o Supabase real: o trigger de novo usuário lê os metadados do JWT.
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb
);
-- Idempotente para bancos reaproveitados em dev (o CI recria o banco a cada run).
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS raw_user_meta_data jsonb DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS auth.mfa_factors (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  friendly_name text,
  factor_type text,
  status text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$$;

-- Retorna uuid como o auth.uid() real do Supabase: as migrations comparam
-- colunas uuid (ex.: "userId" = auth.uid()) e um retorno text quebra com
-- "operator does not exist: uuid = text". O sub do JWT é um uuid em texto.
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid;
$$;

GRANT EXECUTE ON FUNCTION auth.jwt() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon, service_role;
