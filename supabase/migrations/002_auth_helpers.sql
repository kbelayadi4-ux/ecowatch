-- Migration 002: Auth helpers and notification trigger
-- Idempotent, no data loss

-- Function to check if current user is admin
-- Uses app_metadata.role from JWT (set by Supabase Admin API)
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.agents
    where auth_user_id = auth.uid()
    and role = 'admin'
  );
$$;

-- Function to get current user's agent_id (for observations FK)
create or replace function public.current_agent_id()
returns text
language sql
security definer
set search_path = public
as $$
  select id from public.agents
  where auth_user_id = auth.uid()
  limit 1;
$$;

-- Trigger function: create notification when observation is inserted
-- Runs with SECURITY DEFINER (service_role privileges) to bypass RLS on notifs
create or replace function public.create_notification_for_observation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifs (
    id,
    obs_id,
    agent_nom,
    type_probleme,
    zone,
    date_creation,
    lu
  ) values (
    'n-' || new.id,
    new.id,
    new.agent_nom,
    new.type_probleme,
    new.zone,
    new.date_creation,
    false
  );
  return new;
end;
$$;

-- Attach trigger to observations table
drop trigger if exists trigger_create_notification on public.observations;
create trigger trigger_create_notification
after insert on public.observations
for each row
execute function public.create_notification_for_observation();

-- Grant execute on helper functions to anon/authenticated roles
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.current_agent_id() to anon, authenticated;
