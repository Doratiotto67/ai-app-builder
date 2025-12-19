import { createClient } from '@/lib/supabase/client';
import type { Project, ProjectFile, ChatMessage } from '@/types/database';

const supabase = createClient();

// ============= Projects =============

export async function getProjects() {
  const { data, error } = await supabase
    .from('projects')
    .select('*, orgs(name, slug)')
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return data;
}

export async function getProject(projectId: string) {
  const { data, error } = await supabase
    .from('projects')
    .select('*, orgs(name, slug), project_settings(*)')
    .eq('id', projectId)
    .single();

  if (error) throw error;
  return data;
}

export async function createProject(orgId: string, name: string, description?: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Usuário não autenticado');

  const { data, error } = await supabase
    .from('projects')
    .insert({
      org_id: orgId,
      name,
      slug,
      description,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateProject(
  projectId: string,
  updates: Partial<Pick<Project, 'name' | 'description'>>
) {
  const { data, error } = await supabase
    .from('projects')
    .update(updates)
    .eq('id', projectId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteProject(projectId: string) {
  const { error } = await supabase.from('projects').delete().eq('id', projectId);
  if (error) throw error;
}

// ============= Files =============

export async function getProjectFiles(projectId: string) {
  const { data, error } = await supabase
    .from('project_files')
    .select('*')
    .eq('project_id', projectId)
    .order('path');

  if (error) throw error;
  return data;
}

export async function getFile(fileId: string) {
  const { data, error } = await supabase
    .from('project_files')
    .select('*')
    .eq('id', fileId)
    .single();

  if (error) throw error;
  return data;
}

export async function saveFile(projectId: string, path: string, content: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/save-file`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ projectId, path, content }),
    }
  );

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || 'Failed to save file');
  }

  return response.json();
}

export async function deleteFile(fileId: string) {
  const { error } = await supabase.from('project_files').delete().eq('id', fileId);
  if (error) throw error;
}

// ============= Chat =============

export async function getChatThreads(projectId: string) {
  const { data, error } = await supabase
    .from('chat_threads')
    .select('*')
    .eq('project_id', projectId)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return data;
}

export async function getOrCreateChatThread(projectId: string, title?: string) {
  const { data: existingThreads } = await supabase
    .from('chat_threads')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (existingThreads && existingThreads.length > 0) {
    return existingThreads[0];
  }

  const { data, error } = await supabase
    .from('chat_threads')
    .insert({
      project_id: projectId,
      title: title || 'Nova conversa',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getChatMessages(threadId: string) {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at');

  if (error) throw error;
  return data;
}

export async function sendChatMessage(
  projectId: string,
  threadId: string,
  message: string,
  onDelta?: (text: string) => void,
  onDone?: () => void,
  onError?: (error: Error) => void
) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/chat-stream`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ projectId, threadId, message }),
      }
    );

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Failed to send message');
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let receivedDone = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        // Stream terminou - chamar onDone se ainda não foi chamado
        if (!receivedDone) {
          onDone?.();
        }
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            receivedDone = true;
            onDone?.();
            continue;
          }

          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'message_delta' && parsed.data?.text) {
              onDelta?.(parsed.data.text);
            } else if (parsed.type === 'done') {
              receivedDone = true;
              onDone?.();
            } else if (parsed.type === 'error') {
              throw new Error(parsed.data?.message || 'Stream error');
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  } catch (err) {
    onError?.(err instanceof Error ? err : new Error('Unknown error'));
    throw err;
  }
}

// ============= Image Analysis =============

export async function analyzeImage(imageUrl: string, prompt?: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/analyze-image`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ imageUrl, prompt }),
    }
  );

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || 'Failed to analyze image');
  }

  return response.json();
}

// ============= PRD Generation =============

export async function generatePRD(projectId: string, description: string, context?: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-prd`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ projectId, description, context }),
    }
  );

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || 'Failed to generate PRD');
  }

  return response.json();
}

// ============= Organizations =============

export async function getOrganizations() {
  const { data, error } = await supabase
    .from('orgs')
    .select('*, org_members!inner(role)')
    .order('name');

  if (error) throw error;
  return data;
}

export async function createOrganization(name: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') + '-' + Math.random().toString(36).substring(2, 8);

  const { data: org, error: orgError } = await supabase
    .from('orgs')
    .insert({
      name,
      slug,
      owner_user_id: user.id,
    })
    .select()
    .single();

  if (orgError) throw orgError;

  const { error: memberError } = await supabase
    .from('org_members')
    .insert({
      org_id: org.id,
      user_id: user.id,
      role: 'owner',
    });

  if (memberError) throw memberError;

  return org;
}

// ============= Real-time Subscriptions =============

export function subscribeToProjectFiles(
  projectId: string,
  callback: (payload: { eventType: string; new: ProjectFile; old: ProjectFile }) => void
) {
  return supabase
    .channel(`project-files-${projectId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'project_files',
        filter: `project_id=eq.${projectId}`,
      },
      callback as (payload: unknown) => void
    )
    .subscribe();
}

export function subscribeToChatMessages(
  threadId: string,
  callback: (payload: { eventType: string; new: ChatMessage }) => void
) {
  return supabase
    .channel(`chat-messages-${threadId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `thread_id=eq.${threadId}`,
      },
      callback as (payload: unknown) => void
    )
    .subscribe();
}
