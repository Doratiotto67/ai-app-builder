-- Table: projects
-- Description: Projects created within an organization.

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.orgs(id) on delete cascade not null,
  name text not null,
  description text,
  slug text,
  runtime_preference public.runtime_type not null default 'webcontainer',
  created_by uuid references auth.users(id) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Policies
create policy "projects_select" on public.projects for select using (is_org_member(org_id));
create policy "projects_rw" on public.projects for all using (is_org_admin(org_id));
