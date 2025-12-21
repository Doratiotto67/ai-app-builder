// Helper para registrar logs dos agentes no Supabase
// Este arquivo é importado pelas Edge Functions para logging

import { createClient } from 'jsr:@supabase/supabase-js@2';

export type AgentType = 'chat-stream' | 'fix-code' | 'generate-prd' | 'analyze-image' | 'save-file';

export interface LogEntry {
    project_id?: string | null;
    user_id?: string | null;
    agent_type: AgentType;
    status_code: number;
    error_code?: string | null;
    error_message?: string | null;
    error_details?: Record<string, unknown> | null;
    execution_time_ms?: number | null;
    tokens_used?: number | null;
    model_used?: string | null;
    request_summary?: string | null;
    files_count?: number | null;
}

export async function logAgentEvent(entry: LogEntry): Promise<void> {
    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

        if (!supabaseUrl || !supabaseKey) {
            console.warn('[AgentLogger] Supabase URL ou Service Role Key não configuradas');
            return;
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        const { error } = await supabase
            .from('agent_logs')
            .insert({
                project_id: entry.project_id || null,
                user_id: entry.user_id || null,
                agent_type: entry.agent_type,
                status_code: entry.status_code,
                error_code: entry.error_code || null,
                error_message: entry.error_message || null,
                error_details: entry.error_details || null,
                execution_time_ms: entry.execution_time_ms || null,
                tokens_used: entry.tokens_used || null,
                model_used: entry.model_used || null,
                request_summary: entry.request_summary?.slice(0, 500) || null,
                files_count: entry.files_count || null,
            });

        if (error) {
            console.error('[AgentLogger] Erro ao inserir log:', error.message);
        } else {
            console.log(`[AgentLogger] ✓ Log registrado: ${entry.agent_type} - ${entry.status_code}`);
        }
    } catch (err) {
        console.error('[AgentLogger] Exceção ao registrar log:', err);
    }
}
