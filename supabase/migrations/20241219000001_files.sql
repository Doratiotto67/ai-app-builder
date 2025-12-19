-- File and Documentation Management

-- Project Files
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

-- File Versions (History)
create table public.file_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade not null,
  file_id uuid references public.project_files(id) on delete cascade not null,
  version integer not null,
  diff_patch text,
  snapshot_storage_path text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- Project Documentation
create table public.project_docs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade not null,
  doc_type text not null, -- 'prd', 'architecture', etc.
  version integer not null default 1,
  content_md text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- Project Settings
create table public.project_settings (
  project_id uuid primary key references public.projects(id) on delete cascade not null,
  code_model text not null default 'glm-4.6',
  vl_model text,
  limits jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
