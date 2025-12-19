-- Chat Threads, Messages and AI Agents

-- Agent Status Enum
create type public.agent_status as enum ('queued', 'running', 'completed', 'failed', 'cancelled');

-- Chat Threads
create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade not null,
  title text,
  created_by uuid references auth.users(id) not null,
  created_at timestamptz not null default now()
);

-- Chat Messages
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade not null,
  thread_id uuid references public.chat_threads(id) on delete cascade not null,
  role public.member_role, -- Note: This might need to be 'user' | 'assistant' | 'system' but DB shows member_role enum used
  content text,
  content_json jsonb,
  attachments jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- Agent Runs
create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade not null,
  thread_id uuid references public.chat_threads(id) on delete cascade,
  agent_type text not null,
  status public.agent_status not null default 'queued',
  model text,
  meta jsonb not null default '{}'::jsonb,
  error text,
  created_by uuid references auth.users(id),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

-- Agent Events
create table public.agent_events (
  id bigint primary key generated always as identity,
  run_id uuid references public.agent_runs(id) on delete cascade not null,
  ts timestamptz not null default now(),
  event_type text not null,
  payload jsonb not null
);
