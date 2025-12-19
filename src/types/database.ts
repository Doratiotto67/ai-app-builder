// Database types for the AI App Builder

export type MemberRole = 'owner' | 'admin' | 'editor' | 'viewer';
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';
export type AgentStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
export type RuntimeType = 'webcontainer' | 'remote_container';

export interface Org {
  id: string;
  name: string;
  slug: string;
  owner_user_id: string;
  created_at: string;
  updated_at: string;
}

export interface OrgMember {
  org_id: string;
  user_id: string;
  role: MemberRole;
  created_at: string;
}

export interface Project {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  created_by: string;
  runtime_preference: RuntimeType;
  created_at: string;
  updated_at: string;
}

export interface ProjectSettings {
  project_id: string;
  code_model: string;
  vl_model: string | null;
  limits: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ProjectFile {
  id: string;
  project_id: string;
  path: string;
  content_text: string | null;
  storage_path: string | null;
  sha256: string | null;
  language: string | null;
  is_binary: boolean;
  size_bytes: number | null;
  version: number;
  last_modified_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface FileVersion {
  id: string;
  project_id: string;
  file_id: string;
  version: number;
  diff_patch: string | null;
  snapshot_storage_path: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ChatThread {
  id: string;
  project_id: string;
  title: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  project_id: string;
  thread_id: string;
  role: MessageRole;
  content: string | null;
  content_json: Record<string, unknown> | null;
  attachments: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
}

export interface AgentRun {
  id: string;
  project_id: string;
  thread_id: string | null;
  agent_type: string;
  status: AgentStatus;
  model: string | null;
  meta: Record<string, unknown>;
  error: string | null;
  created_by: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface AgentEvent {
  id: number;
  run_id: string;
  ts: string;
  event_type: string;
  payload: Record<string, unknown>;
}

export interface BuildRun {
  id: string;
  project_id: string;
  runtime: RuntimeType;
  status: string;
  exit_code: number | null;
  meta: Record<string, unknown>;
  created_by: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface BuildLog {
  id: number;
  build_id: string;
  ts: string;
  level: string;
  message: string;
}

export interface PreviewSession {
  id: string;
  project_id: string;
  runtime: RuntimeType;
  status: string;
  base_url: string | null;
  last_heartbeat: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ThemeTokens {
  project_id: string;
  tokens: Record<string, unknown>;
  updated_by: string | null;
  updated_at: string;
}

export interface ProjectDoc {
  id: string;
  project_id: string;
  doc_type: string;
  version: number;
  content_md: string;
  created_by: string | null;
  created_at: string;
}

export interface Embedding {
  id: string;
  project_id: string;
  scope: string;
  ref_id: string | null;
  chunk_index: number;
  content: string;
  embedding: number[] | null;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface AuditLog {
  id: number;
  project_id: string | null;
  actor_user_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

// SSE Event types for streaming
export interface SSEEvent {
  type: 'message_delta' | 'status_update' | 'tool_result' | 'error' | 'done';
  data: unknown;
}

export interface MessageDeltaEvent {
  type: 'message_delta';
  data: {
    text: string;
  };
}

export interface StatusUpdateEvent {
  type: 'status_update';
  data: {
    phase: string;
    message?: string;
  };
}

export interface ToolResultEvent {
  type: 'tool_result';
  data: {
    tool: string;
    result: unknown;
  };
}

export interface ErrorEvent {
  type: 'error';
  data: {
    message: string;
    code?: string;
  };
}

export interface DoneEvent {
  type: 'done';
  data: {
    ok: boolean;
  };
}
