-- Table: orgs
-- Description: Organizations that own projects and have members.

create table public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  owner_user_id uuid references auth.users(id) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Policies
create policy "orgs_select" on public.orgs for select using (is_org_member(id));
create policy "orgs_insert" on public.orgs for insert with check (auth.uid() = owner_user_id);
create policy "orgs_update" on public.orgs for update using (is_org_admin(id));
