-- Migration 001: Add auth_user_id link between agents and Supabase Auth
-- Idempotent, no data loss, reversible

-- Add auth_user_id column to agents table
alter table if exists public.agents
add column if not exists auth_user_id uuid unique;

-- Index for fast lookup by auth_user_id
create index if not exists idx_agents_auth_user_id
on public.agents(auth_user_id);

-- Comment for documentation
comment on column public.agents.auth_user_id is
'Links to auth.users.id. Populated by migration script after Supabase Auth user creation.';
