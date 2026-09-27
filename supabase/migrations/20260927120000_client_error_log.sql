-- ============================================================================
-- Relatórios de erro do app (telemetria de falhas, sem dado financeiro)
-- ============================================================================
-- Até aqui o OBS do app capturava erros só num buffer local de 50 entradas:
-- um crash no aparelho de um cliente era invisível. A Edge Function
-- `obs-ingest` passa a gravar aqui um relatório por erro.
--
-- O que NÃO entra: valor, descrição, categoria, e-mail ou id de transação. A
-- função já recebe a mensagem cortada em 300 caracteres e a pilha em 6 linhas,
-- mascara e-mails e sequências longas de dígitos, e só aceita chaves de
-- contexto de uma allowlist (contexto, type, line, chave, aba).
--
-- Acesso: ninguém lê nem escreve pelo PostgREST. RLS ligada sem policy + revoke
-- explícito — a única escrita é a da Edge Function com service_role, e a
-- leitura é pelo painel do Supabase. Retenção de 30 dias, aplicada pela própria
-- função (ver supabase/functions/obs-ingest).
-- ============================================================================

create table if not exists public.fp_client_error (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  app_version text,
  kind        text        not null default 'error',
  message     text        not null,
  stack       text,
  contexto    jsonb       not null default '{}'::jsonb,
  path        text,
  user_agent  text,
  constraint fp_client_error_message_len check (char_length(message) <= 400),
  constraint fp_client_error_stack_len   check (stack is null or char_length(stack) <= 2000)
);

create index if not exists fp_client_error_created_at_idx
  on public.fp_client_error (created_at);

alter table public.fp_client_error enable row level security;

revoke all on table public.fp_client_error from anon, authenticated;
