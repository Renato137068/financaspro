-- ============================================================================
-- Diagnóstico rápido — cadastro / Auth (cole no SQL Editor do Supabase)
-- ============================================================================

-- 1) Tabelas existem?
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('User', 'Plan', 'Organization', 'Subscription')
ORDER BY tablename;

-- 2) Trigger de auth instalado?
SELECT tgname, tgrelid::regclass AS tabela
FROM pg_trigger
WHERE tgname IN ('on_auth_user_created', 'on_organization_created');

-- 3) Usuários no Auth (últimos 5)
SELECT id, email, email_confirmed_at, created_at
FROM auth.users
ORDER BY created_at DESC
LIMIT 5;

-- 4) Linhas em public."User" (deve bater com auth.users)
SELECT id, email, name, active, "createdAt"
FROM public."User"
ORDER BY "createdAt" DESC
LIMIT 5;

-- 5) Planos FREE para bootstrap de org
SELECT id, tier, name FROM public."Plan" WHERE tier = 'FREE';

-- 6) Auth sem linha em User? (trigger falhou ou não rodou)
SELECT u.id, u.email, u.created_at
FROM auth.users u
LEFT JOIN public."User" p ON p.id = u.id::text
WHERE p.id IS NULL
ORDER BY u.created_at DESC
LIMIT 10;
