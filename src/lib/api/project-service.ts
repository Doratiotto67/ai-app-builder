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

// Deletar TODOS os projetos do usuário
export async function deleteAllProjects() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Usuário não autenticado');

  // Buscar todos os projetos primeiro
  const { data: projects, error: fetchError } = await supabase
    .from('projects')
    .select('id');
  
  if (fetchError) throw fetchError;
  
  if (!projects || projects.length === 0) {
    return { deleted: 0 };
  }

  // Deletar todos em paralelo
  const results = await Promise.all(
    projects.map(p => 
      supabase.from('projects').delete().eq('id', p.id)
    )
  );

  const errors = results.filter(r => r.error);
  if (errors.length > 0) {
    console.error('[deleteAllProjects] Erros:', errors);
  }

  return { deleted: projects.length - errors.length, total: projects.length };
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

// Batch save function - gets session ONCE and saves all files in parallel
export async function saveFilesBatch(
  projectId: string, 
  files: Array<{ path: string; content: string }>
): Promise<{ saved: string[]; errors: Array<{ path: string; error: string }> }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const saved: string[] = [];
  const errors: Array<{ path: string; error: string }> = [];
  
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session.access_token}`,
  };

  // Save all files in parallel with the SAME session
  await Promise.all(files.map(async (file) => {
    try {
      const response = await fetch(`${baseUrl}/functions/v1/save-file`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ projectId, path: file.path, content: file.content }),
      });

      if (!response.ok) {
        const err = await response.json();
        errors.push({ path: file.path, error: err.error || 'Failed to save' });
      } else {
        saved.push(file.path);
      }
    } catch (err) {
      errors.push({ path: file.path, error: err instanceof Error ? err.message : 'Unknown error' });
    }
  }));

  console.log(`[saveFilesBatch] Saved ${saved.length}/${files.length} files`);
  return { saved, errors };
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
  onStatus?: (phase: string) => void,
  onDone?: () => void,
  onError?: (error: Error) => void,
  images?: string[] // Base64 encoded images for vision
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
        body: JSON.stringify({ projectId, threadId, message, images }),
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
            } else if (parsed.type === 'status_update') {
              onStatus?.(parsed.data?.phase);
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

export async function generatePRD(
  projectId: string, 
  description: string, 
  context?: string,
  onDelta?: (text: string) => void,
  onStatus?: (phase: string) => void,
  onDone?: (prd: string) => void,
  onError?: (error: Error) => void
) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-prd`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ projectId, description, context, stream: true }),
      }
    );

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Failed to generate PRD');
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let fullPRD = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        onDone?.(fullPRD);
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            onDone?.(fullPRD);
            continue;
          }

          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'message_delta' && parsed.data?.text) {
              fullPRD += parsed.data.text;
              onDelta?.(parsed.data.text);
            } else if (parsed.type === 'status_update') {
              onStatus?.(parsed.data?.phase);
            } else if (parsed.type === 'done') {
              fullPRD = parsed.data?.prd || fullPRD;
              onDone?.(fullPRD);
            } else if (parsed.type === 'error') {
              throw new Error(parsed.data?.message || 'PRD generation error');
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }

    return fullPRD;
  } catch (err) {
    onError?.(err instanceof Error ? err : new Error('Unknown error'));
    throw err;
  }
}

// ============= Code Fixer (AI Agent) =============

export interface FileToFix {
  path: string;
  content: string;
  language: string;
}

export interface FixedFile {
  path: string;
  content: string;
  language: string;
  wasFixed: boolean;
  fixes: string[];
}

export async function fixCode(files: FileToFix[]): Promise<{ files: FixedFile[]; error?: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  console.log(`[fixCode] Enviando ${files.length} arquivos para correção via IA`);

  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/fix-code`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ files }),
      }
    );

    if (!response.ok) {
      const err = await response.json();
      console.error('[fixCode] Erro:', err);
      return { files: files.map(f => ({ ...f, wasFixed: false, fixes: [] })), error: err.error };
    }

    const result = await response.json();
    console.log(`[fixCode] Recebido ${result.files?.length || 0} arquivos corrigidos`);
    return result;
  } catch (error) {
    console.error('[fixCode] Erro de rede:', error);
    return { 
      files: files.map(f => ({ ...f, wasFixed: false, fixes: [] })), 
      error: error instanceof Error ? error.message : 'Network error' 
    };
  }
}

// ============= Organizations =============

export async function getOrganizations() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  
  try {
    // Abordagem simplificada: buscar apenas orgs onde o usuário é owner
    // (relacionamentos complexos com or() causam erros no Supabase)
    const { data: ownedOrgs, error: ownedError } = await supabase
      .from('orgs')
      .select('id, name, slug, owner_user_id, created_at, updated_at')
      .eq('owner_user_id', user.id)
      .order('name');
    
    if (ownedError) {
      console.error('[API] Erro ao buscar orgs do owner:', ownedError);
      return [];
    }
    
    // Buscar orgs onde o usuário é membro (separadamente)
    const { data: memberOrgs, error: memberError } = await supabase
      .from('org_members')
      .select('org_id, orgs(id, name, slug, owner_user_id, created_at, updated_at)')
      .eq('user_id', user.id);
    
    if (memberError) {
      console.warn('[API] Erro ao buscar orgs de membro:', memberError);
      // Retornar apenas as owned se falhar
      return ownedOrgs || [];
    }
    
    // Combinar e deduplicar
    const allOrgs = [...(ownedOrgs || [])];
    const ownedIds = new Set(allOrgs.map(o => o.id));
    
    for (const member of (memberOrgs || [])) {
      const org = member.orgs as any;
      if (org && !ownedIds.has(org.id)) {
        allOrgs.push(org);
      }
    }
    
    return allOrgs.sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    console.error('[API] Erro ao buscar organizações:', err);
    return [];
  }
}


export async function createOrganization(name: string) {
  console.log('[API] createOrganization iniciado:', name);
  
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) {
    console.error('[API] Erro ao obter usuário:', userError);
    throw new Error(`Erro de autenticação: ${userError.message}`);
  }
  if (!user) {
    console.error('[API] Usuário não encontrado');
    throw new Error('Usuário não autenticado');
  }
  
  console.log('[API] Usuário autenticado:', user.id, user.email);

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') + '-' + Math.random().toString(36).substring(2, 8);

  console.log('[API] Inserindo org com slug:', slug);
  
  const { data: org, error: orgError } = await supabase
    .from('orgs')
    .insert({
      name,
      slug,
      owner_user_id: user.id,
    })
    .select()
    .single();

  if (orgError) {
    console.error('[API] Erro ao criar org:', JSON.stringify(orgError, null, 2));
    throw new Error(`Erro ao criar organização: ${orgError.message || orgError.code || 'RLS policy violation'}`);
  }
  
  console.log('[API] Org criada:', org.id);

  console.log('[API] Inserindo membro owner...');
  const { error: memberError } = await supabase
    .from('org_members')
    .insert({
      org_id: org.id,
      user_id: user.id,
      role: 'owner',
    });

  if (memberError) {
    console.error('[API] Erro ao inserir membro:', JSON.stringify(memberError, null, 2));
    throw new Error(`Erro ao adicionar membro: ${memberError.message || memberError.code || 'RLS policy violation'}`);
  }
  
  console.log('[API] Membro adicionado com sucesso');
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
