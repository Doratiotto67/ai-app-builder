-- RLS Policies for All Tables

-- 1. Organizations
alter table public.orgs enable row level security;

create policy "orgs_select" on public.orgs
  for select using (is_org_member(id));

create policy "orgs_insert" on public.orgs
  for insert with check (auth.uid() = owner_user_id);

create policy "orgs_update" on public.orgs
  for update using (is_org_admin(id));

-- 2. Organization Members
alter table public.org_members enable row level security;

create policy "members_select" on public.org_members
  for select using (is_org_member(org_id));

-- 3. Projects
alter table public.projects enable row level security;

create policy "projects_select" on public.projects
  for select using (is_org_member(org_id));

create policy "projects_rw" on public.projects
  for all using (is_org_admin(org_id));

-- 4. Project Files, Docs, Settings, Theme
alter table public.project_files enable row level security;
create policy "files_rw" on public.project_files
  for all using (is_project_member(project_id));

alter table public.file_versions enable row level security;
create policy "file_versions_rw" on public.file_versions
  for all using (is_project_member(project_id));

alter table public.project_docs enable row level security;
create policy "docs_rw" on public.project_docs
  for all using (is_project_member(project_id));

alter table public.project_settings enable row level security;
create policy "settings_rw" on public.project_settings
  for all using (is_project_member(project_id));

alter table public.theme_tokens enable row level security;
create policy "theme_rw" on public.theme_tokens
  for all using (is_project_member(project_id));

-- 5. Chat & AI
alter table public.chat_threads enable row level security;
create policy "chat_threads_rw" on public.chat_threads
  for all using (is_project_member(project_id));

alter table public.chat_messages enable row level security;
create policy "chat_messages_rw" on public.chat_messages
  for all using (is_project_member(project_id));

alter table public.agent_runs enable row level security;
create policy "agent_runs_rw" on public.agent_runs
  for all using (is_project_member(project_id));

alter table public.agent_events enable row level security;
create policy "agent_events_rw" on public.agent_events
  for all using (exists (
    select 1 from public.agent_runs r 
    where r.id = run_id and is_project_member(r.project_id)
  ));

-- 6. Infrastructure
alter table public.audit_log enable row level security;
create policy "audit_log_select" on public.audit_log
  for select using (is_project_member(project_id));

alter table public.embeddings enable row level security;
create policy "embeddings_rw" on public.embeddings
  for all using (is_project_member(project_id));

alter table public.build_runs enable row level security;
create policy "build_runs_rw" on public.build_runs
  for all using (is_project_member(project_id));

alter table public.preview_sessions enable row level security;
create policy "preview_sessions_rw" on public.preview_sessions
  for all using (is_project_member(project_id));
