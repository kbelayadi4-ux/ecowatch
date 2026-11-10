-- Migration 003: Secure RLS policies using auth.uid() and is_admin()
-- Idempotent, reversible (old policies preserved in comments below)
-- Apply AFTER 001 and 002, and AFTER agents.auth_user_id is populated

-- ============================================================
-- AGENTS TABLE
-- ============================================================
-- Agents can read their own profile + admins read all
drop policy if exists "agents_read_own_or_admin" on public.agents;
create policy "agents_read_own_or_admin" on public.agents
for select using (
  auth_user_id = auth.uid()
  or public.is_admin()
);

-- Agents can update their own profile (not role, not auth_user_id)
drop policy if exists "agents_update_own" on public.agents;
create policy "agents_update_own" on public.agents
for update using (
  auth_user_id = auth.uid()
) with check (
  auth_user_id = auth.uid()
  and role = (select role from public.agents where auth_user_id = auth.uid())
  and auth_user_id = (select auth_user_id from public.agents where auth_user_id = auth.uid())
);

-- Insert: only via migration script (service_role) or admin
-- No public insert policy for agents

-- ============================================================
-- OBSERVATIONS TABLE
-- ============================================================
-- Agents read own observations; admins read all
drop policy if exists "obs_read_own_or_admin" on public.observations;
create policy "obs_read_own_or_admin" on public.observations
for select using (
  agent_id = public.current_agent_id()
  or public.is_admin()
);

-- Agents insert own observations (agent_id forced by current_agent_id)
drop policy if exists "obs_insert_own" on public.observations;
create policy "obs_insert_own" on public.observations
for insert with check (
  agent_id = public.current_agent_id()
);

-- Agents update own observations; admins update all
drop policy if exists "obs_update_own_or_admin" on public.observations;
create policy "obs_update_own_or_admin" on public.observations
for update using (
  agent_id = public.current_agent_id()
  or public.is_admin()
) with check (
  agent_id = public.current_agent_id()
  or public.is_admin()
);

-- Admins delete observations
drop policy if exists "obs_delete_admin" on public.observations;
create policy "obs_delete_admin" on public.observations
for delete using (public.is_admin());

-- ============================================================
-- NOTIFICATIONS TABLE
-- ============================================================
-- Only admins can read notifications
drop policy if exists "notifs_admin_read" on public.notifs;
create policy "notifs_admin_read" on public.notifs
for select using (public.is_admin());

-- Only admins can update notifications (mark read/unread)
drop policy if exists "notifs_admin_update" on public.notifs;
create policy "notifs_admin_update" on public.notifs
for update using (public.is_admin())
with check (public.is_admin());

-- Only system (trigger with SECURITY DEFINER) can insert notifications
-- No public insert policy
drop policy if exists "notifs_system_insert" on public.notifs;
create policy "notifs_system_insert" on public.notifs
for insert with check (false); -- effectively blocks client inserts

-- Admins can delete notifications
drop policy if exists "notifs_delete_admin" on public.notifs;
create policy "notifs_delete_admin" on public.notifs
for delete using (public.is_admin());

-- ============================================================
-- REVERT INSTRUCTIONS (keep for rollback)
-- ============================================================
-- To rollback, run:
-- drop policy if exists "agents_read_own_or_admin" on public.agents;
-- drop policy if exists "agents_update_own" on public.agents;
-- drop policy if exists "obs_read_own_or_admin" on public.observations;
-- drop policy if exists "obs_insert_own" on public.observations;
-- drop policy if exists "obs_update_own_or_admin" on public.observations;
-- drop policy if exists "obs_delete_admin" on public.observations;
-- drop policy if exists "notifs_admin_read" on public.notifs;
-- drop policy if exists "notifs_admin_update" on public.notifs;
-- drop policy if exists "notifs_system_insert" on public.notifs;
-- drop policy if exists "notifs_delete_admin" on public.notifs;
-- Then re-enable old permissive policies from 000_initial_schema.sql
