-- ============================================================================
-- Trigger de sincronização Supabase Auth → public."User"
-- Cria a linha em "User" quando um usuário se cadastra no Auth. Idempotente.
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public."User" (id, email, name, role, active, "createdAt", "updatedAt")
  values (
    new.id::text,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    'USER', true, now(), now()
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
