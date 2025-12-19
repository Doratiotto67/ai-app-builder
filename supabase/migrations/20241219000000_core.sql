-- Core Table Structure: Organizations and Projects

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Member roles enum
create type public.member_role as enum ('owner', 'admin', 'editor', 'viewer');

-- Runtime types enum
create type public.runtime_type as enum ('webcontainer', 'docker', 'native');

-- Organizations
create table public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  owner_user_id uuid references auth.users(id) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Organization Members
create table public.org_members (
  org_id uuid references public.orgs(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.member_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- Projects
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

-- Helper functions for RLS
create or replace function public.is_org_member(_org_id uuid)
returns boolean as $$
  select exists (
    select 1 from public.org_members m
    where m.org_id = _org_id and m.user_id = auth.uid()
  );
$$ language sql security definer;

create or replace function public.is_org_admin(_org_id uuid)
returns boolean as $$
  select exists (
    select 1 from public.org_members m
    where m.org_id = _org_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin')
  );
$$ language sql security definer;

create or replace function public.is_project_member(_project_id uuid)
returns boolean as $$
  select exists (
    select 1
    from public.projects p
    join public.org_members m on m.org_id = p.org_id
    where p.id = _project_id and m.user_id = auth.uid()
  );
$$ language sql security definer;
