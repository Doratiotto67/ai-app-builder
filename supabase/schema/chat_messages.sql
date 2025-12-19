-- Table: chat_messages
-- Description: Messages in a chat thread.

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade not null,
  thread_id uuid references public.chat_threads(id) on delete cascade not null,
  role public.member_role,
  content text,
  content_json jsonb,
  attachments jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- Policies
create policy "chat_messages_rw" on public.chat_messages for all using (is_project_member(project_id));
