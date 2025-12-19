-- Table: project_files
-- Description: Files belonging to a project.

create table public.project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade not null,
  path text not null,
  content_text text,
  storage_path text,
  sha256 text,
  language text,
  is_binary boolean not null default false,
  size_bytes bigint,
  version integer not null default 1,
  last_modified_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Policies
create policy "files_rw" on public.project_files for all using (is_project_member(project_id));
