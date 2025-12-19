-- Audit Logs, Theme Tokens and Embeddings

-- Theme Tokens
create table public.theme_tokens (
  project_id uuid primary key references public.projects(id) on delete cascade not null,
  tokens jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

-- Embeddings
create table public.embeddings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade not null,
  scope text not null, -- 'file', 'thread', etc.
  ref_id uuid,
  chunk_index integer not null default 0,
  content text not null,
  embedding vector(1536), -- Assuming standard OpenAI embedding size
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Audit Log
create table public.audit_log (
  id bigint primary key generated always as identity,
  project_id uuid references public.projects(id) on delete cascade,
  actor_user_id uuid references auth.users(id),
  action text not null,
  target_type text,
  target_id uuid,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Build Runs
create table public.build_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade not null,
  runtime public.runtime_type not null,
  status text not null default 'queued',
  exit_code integer,
  meta jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

-- Build Logs
create table public.build_logs (
  id bigint primary_key generated always as identity,
  build_id uuid references public.build_runs(id) on delete cascade not null,
  ts timestamptz not null default now(),
  level text not null default 'info',
  message text not null
);

-- Preview Sessions
create table public.preview_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade not null,
  runtime public.runtime_type not null,
  status text not null default 'active',
  base_url text,
  last_heartbeat timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
