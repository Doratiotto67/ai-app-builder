// Helper para registrar logs dos agentes no Supabase
// Este arquivo é importado pelas Edge Functions para logging
// Integrado com a taxonomia de erros padronizada

import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
    type ErrorCode,
    type ErrorCategory,
    type ErrorSeverity,
    type AppError,
    createAppError,
    ERROR_DEFINITIONS
} from './error-taxonomy.ts';

// Re-export para facilitar uso
export { type ErrorCode, type ErrorCategory, type ErrorSeverity, type AppError, createAppError, ERROR_DEFINITIONS };

export type AgentType = 'chat-stream' | 'fix-code' | 'generate-prd' | 'analyze-image' | 'save-file';

export interface LogEntry {
    project_id?: string | null;
    user_id?: string | null;
    agent_type: AgentType;
    status_code: number;
    // Campos de erro padronizados
    error_code?: ErrorCode | string | null;
    error_category?: ErrorCategory | null;
    error_severity?: ErrorSeverity | null;
    error_message?: string | null;
    error_details?: Record<string, unknown> | null;
    error_recoverable?: boolean | null;
    // Campos adicionais
    execution_time_ms?: number | null;
    tokens_used?: number | null;
    model_used?: string | null;
    request_summary?: string | null;
    files_count?: number | null;
}

/**
 * Cria um LogEntry a partir de um AppError
 */
export function createLogEntryFromError(
    agentType: AgentType,
    statusCode: number,
    appError: AppError,
    extras?: Partial<LogEntry>
): LogEntry {
    return {
        agent_type: agentType,
        status_code: statusCode,
        error_code: appError.code,
        error_category: appError.category,
        error_severity: appError.severity,
        error_message: appError.message,
        error_details: appError.details || null,
        error_recoverable: appError.recoverable,
        ...extras
    };
}

/**
 * Atalhos para criar LogEntry com erros comuns
 */
export const LogErrors = {
    // LLM Errors
    llmStreamParseError: (agentType: AgentType, detail: string, extras?: Partial<LogEntry>) =>
        createLogEntryFromError(agentType, 500, createAppError('LLM_STREAM_PARSE_ERROR', { detail }), extras),

    llmJsonInvalid: (agentType: AgentType, detail: string, extras?: Partial<LogEntry>) =>
        createLogEntryFromError(agentType, 500, createAppError('LLM_JSON_INVALID', { detail }), extras),

    llmTimeout: (agentType: AgentType, timeout: number, extras?: Partial<LogEntry>) =>
        createLogEntryFromError(agentType, 504, createAppError('LLM_TIMEOUT', { timeout }), extras),

    // Syntax Errors
    syntaxInvalidPostFix: (agentType: AgentType, detail: string, extras?: Partial<LogEntry>) =>
        createLogEntryFromError(agentType, 422, createAppError('SYNTAX_INVALID_POST_FIX', { detail }), extras),

    // Import Errors
    importGraphBroken: (agentType: AgentType, from: string, to: string, extras?: Partial<LogEntry>) =>
        createLogEntryFromError(agentType, 422, createAppError('IMPORT_GRAPH_BROKEN', { from, to }), extras),

    // Stub Errors
    stubGenerationInvalid: (agentType: AgentType, detail: string, extras?: Partial<LogEntry>) =>
        createLogEntryFromError(agentType, 422, createAppError('STUB_GENERATION_INVALID', { detail }), extras),

    // WebContainer Errors
    wcBootFail: (agentType: AgentType, detail: string, extras?: Partial<LogEntry>) =>
        createLogEntryFromError(agentType, 500, createAppError('WC_BOOT_FAIL', { detail }), extras),

    wcInstallFail: (agentType: AgentType, detail: string, extras?: Partial<LogEntry>) =>
        createLogEntryFromError(agentType, 500, createAppError('WC_INSTALL_FAIL', { detail }), extras),

    wcDevServerFail: (agentType: AgentType, detail: string, extras?: Partial<LogEntry>) =>
        createLogEntryFromError(agentType, 500, createAppError('WC_DEVSERVER_FAIL', { detail }), extras),

    // Stream Errors
    streamAborted: (agentType: AgentType, extras?: Partial<LogEntry>) =>
        createLogEntryFromError(agentType, 499, createAppError('STREAM_ABORTED'), extras),

    streamNetworkError: (agentType: AgentType, detail: string, extras?: Partial<LogEntry>) =>
        createLogEntryFromError(agentType, 502, createAppError('STREAM_NETWORK_ERROR', { detail }), extras),

    // Generic
    unknown: (agentType: AgentType, detail: string, extras?: Partial<LogEntry>) =>
        createLogEntryFromError(agentType, 500, createAppError('UNKNOWN_ERROR', { detail }), extras),
};

export async function logAgentEvent(entry: LogEntry): Promise<void> {
    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

        if (!supabaseUrl || !supabaseKey) {
            console.warn('[AgentLogger] Supabase URL ou Service Role Key não configuradas');
            return;
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        // Log formatado no console para debug rápido
        if (entry.error_code) {
            console.error(`[AgentLogger] ❌ [${entry.error_code}] ${entry.error_message || 'Sem mensagem'}`);
            if (entry.error_category) {
                console.error(`  ├─ Categoria: ${entry.error_category}`);
            }
            if (entry.error_severity) {
                console.error(`  ├─ Severidade: ${entry.error_severity}`);
            }
            if (entry.error_details) {
                console.error(`  └─ Detalhes:`, entry.error_details);
            }
        }

        const { error } = await supabase
            .from('agent_logs')
            .insert({
                project_id: entry.project_id || null,
                user_id: entry.user_id || null,
                agent_type: entry.agent_type,
                status_code: entry.status_code,
                error_code: entry.error_code || null,
                error_message: entry.error_message || null,
                error_details: entry.error_details ? {
                    ...entry.error_details,
                    category: entry.error_category,
                    severity: entry.error_severity,
                    recoverable: entry.error_recoverable
                } : null,
                execution_time_ms: entry.execution_time_ms || null,
                tokens_used: entry.tokens_used || null,
                model_used: entry.model_used || null,
                request_summary: entry.request_summary?.slice(0, 500) || null,
                files_count: entry.files_count || null,
            });

        if (error) {
            console.error('[AgentLogger] Erro ao inserir log:', error.message);
        } else {
            const icon = entry.error_code ? '❌' : '✓';
            console.log(`[AgentLogger] ${icon} Log registrado: ${entry.agent_type} - ${entry.status_code}${entry.error_code ? ` [${entry.error_code}]` : ''}`);
        }
    } catch (err) {
        console.error('[AgentLogger] Exceção ao registrar log:', err);
    }
}

/**
 * Converte um erro genérico para LogEntry com código padronizado
 */
export function errorToLogEntry(
    agentType: AgentType,
    error: unknown,
    defaultCode: ErrorCode = 'UNKNOWN_ERROR',
    extras?: Partial<LogEntry>
): LogEntry {
    let errorCode: ErrorCode = defaultCode;
    let errorMessage = 'Erro desconhecido';
    let errorDetails: Record<string, unknown> = {};

    if (error instanceof Error) {
        errorMessage = error.message;
        errorDetails = { stack: error.stack };

        // Tentar detectar tipo de erro pela mensagem
        const msg = error.message.toLowerCase();

        if (msg.includes('timeout')) {
            errorCode = 'LLM_TIMEOUT';
        } else if (msg.includes('json') && msg.includes('parse')) {
            errorCode = 'LLM_JSON_INVALID';
        } else if (msg.includes('stream')) {
            errorCode = 'LLM_STREAM_PARSE_ERROR';
        } else if (msg.includes('module not found') || msg.includes('cannot find module')) {
            errorCode = 'IMPORT_MODULE_NOT_FOUND';
        } else if (msg.includes('unterminated string')) {
            errorCode = 'SYNTAX_UNTERMINATED_STRING';
        } else if (msg.includes('network') || msg.includes('fetch')) {
            errorCode = 'NETWORK_FETCH_FAILED';
        }
    } else if (typeof error === 'string') {
        errorMessage = error;
    } else if (error && typeof error === 'object' && 'code' in error) {
        // Já é um AppError
        const appError = error as AppError;
        return createLogEntryFromError(agentType, 500, appError, extras);
    }

    const appError = createAppError(errorCode, {
        originalError: errorMessage,
        ...errorDetails
    });

    return createLogEntryFromError(agentType, 500, appError, extras);
}
