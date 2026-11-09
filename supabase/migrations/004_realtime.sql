-- Migration 004: Enable Realtime for observations and notifications
-- Idempotent, safe to run multiple times

-- Add tables to supabase_realtime publication
-- Using DO block to handle "already in publication" gracefully
do $$
begin
  -- Add observations table
  begin
    alter publication supabase_realtime add table public.observations;
  exception when duplicate_object then
    -- Table already in publication, ignore
    null;
  end;

  -- Add notifs table
  begin
    alter publication supabase_realtime add table public.notifs;
  exception when duplicate_object then
    -- Table already in publication, ignore
    null;
  end;
end $$;

-- Set REPLICA IDENTITY to FULL for proper UPDATE/DELETE events
alter table public.observations replica identity full;
alter table public.notifs replica identity full;
