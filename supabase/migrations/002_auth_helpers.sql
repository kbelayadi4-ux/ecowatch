-- Migration 002: Auth helpers and notification trigger
-- Idempotent, no data loss

-- Function to check if current user is admin
-- Uses app_metadata.role from JWT (set by Supabase Admin API)
-- SECURITY DEFINER with fixed search_path for safety
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin';
$$;

-- Function to get current user's agent_id (for observations FK)
-- Returns the historical agents.id linked to auth.uid()
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
-- Runs with SECURITY DEFINER to bypass RLS on notifs
-- Gets agent_nom from agents table using NEW.agent_id (never trust client input)
create or replace function public.create_notification_for_observation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agent_nom text;
begin
  -- Fetch agent name from agents table using the agent_id from the observation
  select nom into v_agent_nom
  from public.agents
  where id = new.agent_id
  limit 1;

  -- Only create notification if agent exists
  if v_agent_nom is not null then
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
      v_agent_nom,
      new.type_probleme,
      new.zone,
      new.date_creation,
      false
    );
  end if;
  return new;
end;
$$;

-- Attach trigger to observations table
drop trigger if exists trigger_create_notification on public.observations;
create trigger trigger_create_notification
after insert on public.observations
for each row
execute function public.create_notification_for_observation();

-- Grant execute on helper functions to authenticated role only (not anon)
grant execute on function public.is_admin() to authenticated;
grant execute on function public.current_agent_id() to authenticated;
