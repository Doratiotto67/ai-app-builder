/**
 * Taxonomia de Erros Padronizada (Frontend)
 * ==========================================
 * 
 * Versão frontend da taxonomia de erros.
 * Mantém consistência com o backend para debug unificado.
 * 
 * Uso:
 *   import { Errors, ErrorCode } from '@/lib/errors/error-taxonomy';
 *   throw Errors.wcBootFail('Failed to initialize');
 */

// ============================================
// Tipos e Interfaces
// ============================================

export interface AppError {
    code: ErrorCode;
    message: string;
    category: ErrorCategory;
    severity: ErrorSeverity;
    details?: Record<string, unknown>;
    timestamp?: string;
    recoverable: boolean;
}

export type ErrorCategory =
    | 'LLM'           // Erros de IA/modelo
    | 'SYNTAX'        // Erros de sintaxe de código
    | 'IMPORT'        // Erros de imports/módulos
    | 'STUB'          // Erros de geração de stubs
    | 'WEBCONTAINER'  // Erros do WebContainer
    | 'STREAM'        // Erros de streaming
    | 'VALIDATION'    // Erros de validação
    | 'NETWORK'       // Erros de rede
    | 'UNKNOWN';      // Erros não categorizados

export type ErrorSeverity =
    | 'LOW'      // Informativo, não impede funcionamento
    | 'MEDIUM'   // Pode afetar funcionalidade parcialmente
    | 'HIGH'     // Impede funcionalidade importante
    | 'CRITICAL'; // Sistema não funciona

// ============================================
// Códigos de Erro
// ============================================

export type ErrorCode =
    // LLM Errors (AI/Model Issues)
    | 'LLM_STREAM_PARSE_ERROR'      // Perda de chunk / streaming incompleto
    | 'LLM_JSON_INVALID'            // Modelo devolveu JSON quebrado/inválido
    | 'LLM_RESPONSE_EMPTY'          // Modelo não retornou resposta
    | 'LLM_RESPONSE_TRUNCATED'      // Resposta do modelo foi truncada
    | 'LLM_TIMEOUT'                 // Timeout na chamada ao modelo
    | 'LLM_RATE_LIMITED'            // Rate limit atingido
    | 'LLM_MODEL_UNAVAILABLE'       // Modelo indisponível
    | 'LLM_CONTEXT_OVERFLOW'        // Contexto excedeu limite do modelo

    // Syntax Errors (Code Quality)
    | 'SYNTAX_INVALID_POST_FIX'     // AutoFix aplicado mas código ainda inválido
    | 'SYNTAX_JSX_MALFORMED'        // JSX com sintaxe incorreta
    | 'SYNTAX_TYPESCRIPT_ERROR'     // Erro de TypeScript
    | 'SYNTAX_UNTERMINATED_STRING'  // String não terminada
    | 'SYNTAX_UNCLOSED_TAG'         // Tag JSX não fechada
    | 'SYNTAX_BRACKET_MISMATCH'     // Parênteses/chaves não combinando

    // Import Errors (Module Resolution)
    | 'IMPORT_GRAPH_BROKEN'         // Import aponta para arquivo inexistente
    | 'IMPORT_CIRCULAR_DETECTED'    // Dependência circular detectada
    | 'IMPORT_MODULE_NOT_FOUND'     // Módulo não encontrado
    | 'IMPORT_INVALID_PATH'         // Caminho de import inválido
    | 'IMPORT_DEFAULT_MISSING'      // Export default não encontrado
    | 'IMPORT_NAMED_MISSING'        // Export nomeado não encontrado

    // Stub Generation Errors
    | 'STUB_GENERATION_INVALID'     // Stub gerado com TypeScript inválido
    | 'STUB_PROPS_MISMATCH'         // Props do stub não combinam com uso
    | 'STUB_EXPORT_MISSING'         // Stub sem export adequado

    // WebContainer Errors
    | 'WC_BOOT_FAIL'                // Falha ao inicializar WebContainer
    | 'WC_INSTALL_FAIL'             // Falha ao instalar dependências
    | 'WC_DEVSERVER_FAIL'           // Falha ao iniciar dev server
    | 'WC_FILE_WRITE_FAIL'          // Falha ao escrever arquivo
    | 'WC_FILE_READ_FAIL'           // Falha ao ler arquivo
    | 'WC_PROCESS_CRASH'            // Processo do WebContainer crashou
    | 'WC_MEMORY_EXCEEDED'          // Limite de memória excedido
    | 'WC_TIMEOUT'                  // Timeout em operação do WebContainer

    // Stream Errors
    | 'STREAM_ABORTED'              // Stream abortado pelo usuário
    | 'STREAM_NETWORK_ERROR'        // Erro de rede durante stream
    | 'STREAM_PARSE_CHUNK_FAIL'     // Falha ao parsear chunk do stream
    | 'STREAM_INCOMPLETE'           // Stream terminou antes do esperado

    // Validation Errors
    | 'VALIDATION_SCHEMA_FAIL'      // Falha na validação de schema
    | 'VALIDATION_INPUT_INVALID'    // Input inválido
    | 'VALIDATION_FILE_TOO_LARGE'   // Arquivo muito grande
    | 'VALIDATION_UNSUPPORTED_TYPE' // Tipo de arquivo não suportado

    // Network Errors
    | 'NETWORK_TIMEOUT'             // Timeout de rede
    | 'NETWORK_CORS_ERROR'          // Erro de CORS
    | 'NETWORK_FETCH_FAILED'        // Fetch falhou
    | 'NETWORK_API_ERROR'           // Erro de API externa

    // Generic
    | 'UNKNOWN_ERROR';              // Erro desconhecido

// ============================================
// Definições de Erro (Metadata)
// ============================================

interface ErrorDefinition {
    code: ErrorCode;
    category: ErrorCategory;
    severity: ErrorSeverity;
    messageTemplate: string;
    recoverable: boolean;
    suggestedAction?: string;
}

export const ERROR_DEFINITIONS: Record<ErrorCode, ErrorDefinition> = {
    // LLM Errors
    LLM_STREAM_PARSE_ERROR: {
        code: 'LLM_STREAM_PARSE_ERROR',
        category: 'LLM',
        severity: 'HIGH',
        messageTemplate: 'Falha ao parsear stream da IA: {detail}',
        recoverable: true,
        suggestedAction: 'Tentar novamente a requisição'
    },
    LLM_JSON_INVALID: {
        code: 'LLM_JSON_INVALID',
        category: 'LLM',
        severity: 'HIGH',
        messageTemplate: 'IA retornou JSON inválido: {detail}',
        recoverable: true,
        suggestedAction: 'Tentar novamente ou ajustar o prompt'
    },
    LLM_RESPONSE_EMPTY: {
        code: 'LLM_RESPONSE_EMPTY',
        category: 'LLM',
        severity: 'MEDIUM',
        messageTemplate: 'IA não retornou resposta',
        recoverable: true,
        suggestedAction: 'Verificar prompt e tentar novamente'
    },
    LLM_RESPONSE_TRUNCATED: {
        code: 'LLM_RESPONSE_TRUNCATED',
        category: 'LLM',
        severity: 'MEDIUM',
        messageTemplate: 'Resposta da IA foi truncada: {detail}',
        recoverable: true,
        suggestedAction: 'Reduzir contexto ou dividir requisição'
    },
    LLM_TIMEOUT: {
        code: 'LLM_TIMEOUT',
        category: 'LLM',
        severity: 'HIGH',
        messageTemplate: 'Timeout na chamada à IA após {timeout}ms',
        recoverable: true,
        suggestedAction: 'Tentar novamente com contexto menor'
    },
    LLM_RATE_LIMITED: {
        code: 'LLM_RATE_LIMITED',
        category: 'LLM',
        severity: 'MEDIUM',
        messageTemplate: 'Rate limit atingido. Aguarde {waitTime}s',
        recoverable: true,
        suggestedAction: 'Aguardar e tentar novamente'
    },
    LLM_MODEL_UNAVAILABLE: {
        code: 'LLM_MODEL_UNAVAILABLE',
        category: 'LLM',
        severity: 'CRITICAL',
        messageTemplate: 'Modelo {model} indisponível',
        recoverable: false,
        suggestedAction: 'Verificar configuração do modelo'
    },
    LLM_CONTEXT_OVERFLOW: {
        code: 'LLM_CONTEXT_OVERFLOW',
        category: 'LLM',
        severity: 'HIGH',
        messageTemplate: 'Contexto excedeu limite: {tokens} tokens',
        recoverable: true,
        suggestedAction: 'Reduzir tamanho do contexto'
    },

    // Syntax Errors
    SYNTAX_INVALID_POST_FIX: {
        code: 'SYNTAX_INVALID_POST_FIX',
        category: 'SYNTAX',
        severity: 'HIGH',
        messageTemplate: 'Código ainda inválido após auto-fix: {detail}',
        recoverable: true,
        suggestedAction: 'Revisar código manualmente ou pedir nova correção'
    },
    SYNTAX_JSX_MALFORMED: {
        code: 'SYNTAX_JSX_MALFORMED',
        category: 'SYNTAX',
        severity: 'HIGH',
        messageTemplate: 'JSX malformado em {file}: {detail}',
        recoverable: true,
        suggestedAction: 'Corrigir sintaxe JSX'
    },
    SYNTAX_TYPESCRIPT_ERROR: {
        code: 'SYNTAX_TYPESCRIPT_ERROR',
        category: 'SYNTAX',
        severity: 'MEDIUM',
        messageTemplate: 'Erro TypeScript: {detail}',
        recoverable: true,
        suggestedAction: 'Corrigir tipagem'
    },
    SYNTAX_UNTERMINATED_STRING: {
        code: 'SYNTAX_UNTERMINATED_STRING',
        category: 'SYNTAX',
        severity: 'HIGH',
        messageTemplate: 'String não terminada na linha {line}',
        recoverable: true,
        suggestedAction: 'Fechar string com aspas'
    },
    SYNTAX_UNCLOSED_TAG: {
        code: 'SYNTAX_UNCLOSED_TAG',
        category: 'SYNTAX',
        severity: 'HIGH',
        messageTemplate: 'Tag JSX não fechada: <{tag}>',
        recoverable: true,
        suggestedAction: 'Adicionar tag de fechamento'
    },
    SYNTAX_BRACKET_MISMATCH: {
        code: 'SYNTAX_BRACKET_MISMATCH',
        category: 'SYNTAX',
        severity: 'HIGH',
        messageTemplate: 'Parênteses/chaves não combinam: {detail}',
        recoverable: true,
        suggestedAction: 'Verificar balanceamento de brackets'
    },

    // Import Errors
    IMPORT_GRAPH_BROKEN: {
        code: 'IMPORT_GRAPH_BROKEN',
        category: 'IMPORT',
        severity: 'HIGH',
        messageTemplate: 'Import quebrado: {from} -> {to}',
        recoverable: true,
        suggestedAction: 'Criar arquivo faltante ou corrigir caminho'
    },
    IMPORT_CIRCULAR_DETECTED: {
        code: 'IMPORT_CIRCULAR_DETECTED',
        category: 'IMPORT',
        severity: 'MEDIUM',
        messageTemplate: 'Dependência circular: {chain}',
        recoverable: true,
        suggestedAction: 'Refatorar para eliminar ciclo'
    },
    IMPORT_MODULE_NOT_FOUND: {
        code: 'IMPORT_MODULE_NOT_FOUND',
        category: 'IMPORT',
        severity: 'HIGH',
        messageTemplate: 'Módulo não encontrado: {module}',
        recoverable: true,
        suggestedAction: 'Instalar pacote ou criar arquivo'
    },
    IMPORT_INVALID_PATH: {
        code: 'IMPORT_INVALID_PATH',
        category: 'IMPORT',
        severity: 'MEDIUM',
        messageTemplate: 'Caminho de import inválido: {path}',
        recoverable: true,
        suggestedAction: 'Corrigir caminho do import'
    },
    IMPORT_DEFAULT_MISSING: {
        code: 'IMPORT_DEFAULT_MISSING',
        category: 'IMPORT',
        severity: 'MEDIUM',
        messageTemplate: 'Export default não encontrado em {file}',
        recoverable: true,
        suggestedAction: 'Adicionar export default ou usar import nomeado'
    },
    IMPORT_NAMED_MISSING: {
        code: 'IMPORT_NAMED_MISSING',
        category: 'IMPORT',
        severity: 'MEDIUM',
        messageTemplate: 'Export {name} não encontrado em {file}',
        recoverable: true,
        suggestedAction: 'Verificar nome do export'
    },

    // Stub Errors
    STUB_GENERATION_INVALID: {
        code: 'STUB_GENERATION_INVALID',
        category: 'STUB',
        severity: 'HIGH',
        messageTemplate: 'Stub gerado com TypeScript inválido: {detail}',
        recoverable: true,
        suggestedAction: 'Regenerar stub'
    },
    STUB_PROPS_MISMATCH: {
        code: 'STUB_PROPS_MISMATCH',
        category: 'STUB',
        severity: 'MEDIUM',
        messageTemplate: 'Props do stub {component} não combinam com uso',
        recoverable: true,
        suggestedAction: 'Atualizar props do stub'
    },
    STUB_EXPORT_MISSING: {
        code: 'STUB_EXPORT_MISSING',
        category: 'STUB',
        severity: 'MEDIUM',
        messageTemplate: 'Stub {file} sem export adequado',
        recoverable: true,
        suggestedAction: 'Adicionar export ao stub'
    },

    // WebContainer Errors
    WC_BOOT_FAIL: {
        code: 'WC_BOOT_FAIL',
        category: 'WEBCONTAINER',
        severity: 'CRITICAL',
        messageTemplate: 'Falha ao inicializar WebContainer: {detail}',
        recoverable: true,
        suggestedAction: 'Recarregar página'
    },
    WC_INSTALL_FAIL: {
        code: 'WC_INSTALL_FAIL',
        category: 'WEBCONTAINER',
        severity: 'HIGH',
        messageTemplate: 'Falha ao instalar dependências: {detail}',
        recoverable: true,
        suggestedAction: 'Verificar package.json e tentar novamente'
    },
    WC_DEVSERVER_FAIL: {
        code: 'WC_DEVSERVER_FAIL',
        category: 'WEBCONTAINER',
        severity: 'HIGH',
        messageTemplate: 'Falha ao iniciar dev server: {detail}',
        recoverable: true,
        suggestedAction: 'Verificar configuração do Vite'
    },
    WC_FILE_WRITE_FAIL: {
        code: 'WC_FILE_WRITE_FAIL',
        category: 'WEBCONTAINER',
        severity: 'MEDIUM',
        messageTemplate: 'Falha ao escrever arquivo {file}: {detail}',
        recoverable: true,
        suggestedAction: 'Tentar novamente'
    },
    WC_FILE_READ_FAIL: {
        code: 'WC_FILE_READ_FAIL',
        category: 'WEBCONTAINER',
        severity: 'MEDIUM',
        messageTemplate: 'Falha ao ler arquivo {file}: {detail}',
        recoverable: true,
        suggestedAction: 'Verificar se arquivo existe'
    },
    WC_PROCESS_CRASH: {
        code: 'WC_PROCESS_CRASH',
        category: 'WEBCONTAINER',
        severity: 'CRITICAL',
        messageTemplate: 'Processo do WebContainer crashou: {detail}',
        recoverable: true,
        suggestedAction: 'Recarregar página'
    },
    WC_MEMORY_EXCEEDED: {
        code: 'WC_MEMORY_EXCEEDED',
        category: 'WEBCONTAINER',
        severity: 'CRITICAL',
        messageTemplate: 'Limite de memória excedido',
        recoverable: false,
        suggestedAction: 'Reduzir tamanho do projeto'
    },
    WC_TIMEOUT: {
        code: 'WC_TIMEOUT',
        category: 'WEBCONTAINER',
        severity: 'HIGH',
        messageTemplate: 'Timeout em operação do WebContainer: {operation}',
        recoverable: true,
        suggestedAction: 'Tentar novamente'
    },

    // Stream Errors
    STREAM_ABORTED: {
        code: 'STREAM_ABORTED',
        category: 'STREAM',
        severity: 'LOW',
        messageTemplate: 'Stream abortado pelo usuário',
        recoverable: true,
        suggestedAction: 'Iniciar nova requisição'
    },
    STREAM_NETWORK_ERROR: {
        code: 'STREAM_NETWORK_ERROR',
        category: 'STREAM',
        severity: 'HIGH',
        messageTemplate: 'Erro de rede durante stream: {detail}',
        recoverable: true,
        suggestedAction: 'Verificar conexão e tentar novamente'
    },
    STREAM_PARSE_CHUNK_FAIL: {
        code: 'STREAM_PARSE_CHUNK_FAIL',
        category: 'STREAM',
        severity: 'MEDIUM',
        messageTemplate: 'Falha ao parsear chunk: {detail}',
        recoverable: true,
        suggestedAction: 'Tentar novamente'
    },
    STREAM_INCOMPLETE: {
        code: 'STREAM_INCOMPLETE',
        category: 'STREAM',
        severity: 'MEDIUM',
        messageTemplate: 'Stream terminou antes do esperado',
        recoverable: true,
        suggestedAction: 'Tentar novamente'
    },

    // Validation Errors
    VALIDATION_SCHEMA_FAIL: {
        code: 'VALIDATION_SCHEMA_FAIL',
        category: 'VALIDATION',
        severity: 'MEDIUM',
        messageTemplate: 'Falha na validação de schema: {detail}',
        recoverable: true,
        suggestedAction: 'Verificar formato dos dados'
    },
    VALIDATION_INPUT_INVALID: {
        code: 'VALIDATION_INPUT_INVALID',
        category: 'VALIDATION',
        severity: 'LOW',
        messageTemplate: 'Input inválido: {detail}',
        recoverable: true,
        suggestedAction: 'Corrigir input'
    },
    VALIDATION_FILE_TOO_LARGE: {
        code: 'VALIDATION_FILE_TOO_LARGE',
        category: 'VALIDATION',
        severity: 'MEDIUM',
        messageTemplate: 'Arquivo muito grande: {size}MB (máx: {max}MB)',
        recoverable: true,
        suggestedAction: 'Reduzir tamanho do arquivo'
    },
    VALIDATION_UNSUPPORTED_TYPE: {
        code: 'VALIDATION_UNSUPPORTED_TYPE',
        category: 'VALIDATION',
        severity: 'LOW',
        messageTemplate: 'Tipo de arquivo não suportado: {type}',
        recoverable: true,
        suggestedAction: 'Usar tipo suportado'
    },

    // Network Errors
    NETWORK_TIMEOUT: {
        code: 'NETWORK_TIMEOUT',
        category: 'NETWORK',
        severity: 'HIGH',
        messageTemplate: 'Timeout de rede após {timeout}ms',
        recoverable: true,
        suggestedAction: 'Verificar conexão e tentar novamente'
    },
    NETWORK_CORS_ERROR: {
        code: 'NETWORK_CORS_ERROR',
        category: 'NETWORK',
        severity: 'HIGH',
        messageTemplate: 'Erro de CORS: {detail}',
        recoverable: false,
        suggestedAction: 'Verificar configuração de CORS'
    },
    NETWORK_FETCH_FAILED: {
        code: 'NETWORK_FETCH_FAILED',
        category: 'NETWORK',
        severity: 'HIGH',
        messageTemplate: 'Fetch falhou: {detail}',
        recoverable: true,
        suggestedAction: 'Verificar conexão'
    },
    NETWORK_API_ERROR: {
        code: 'NETWORK_API_ERROR',
        category: 'NETWORK',
        severity: 'HIGH',
        messageTemplate: 'Erro de API: {status} - {detail}',
        recoverable: true,
        suggestedAction: 'Verificar API e tentar novamente'
    },

    // Generic
    UNKNOWN_ERROR: {
        code: 'UNKNOWN_ERROR',
        category: 'UNKNOWN',
        severity: 'MEDIUM',
        messageTemplate: 'Erro desconhecido: {detail}',
        recoverable: true,
        suggestedAction: 'Verificar logs para mais detalhes'
    }
};

// ============================================
// Factory Functions
// ============================================

/**
 * Cria um objeto de erro padronizado
 */
export function createAppError(
    code: ErrorCode,
    details?: Record<string, unknown>,
    customMessage?: string
): AppError {
    const definition = ERROR_DEFINITIONS[code];

    // Interpola o template da mensagem com os detalhes
    let message = customMessage || definition.messageTemplate;
    if (details) {
        Object.entries(details).forEach(([key, value]) => {
            message = message.replace(`{${key}}`, String(value));
        });
    }

    return {
        code,
        message,
        category: definition.category,
        severity: definition.severity,
        details,
        timestamp: new Date().toISOString(),
        recoverable: definition.recoverable
    };
}

/**
 * Converte um erro qualquer para AppError
 */
export function toAppError(error: unknown, defaultCode: ErrorCode = 'UNKNOWN_ERROR'): AppError {
    if (isAppError(error)) {
        return error;
    }

    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    return createAppError(defaultCode, {
        originalError: message,
        stack
    });
}

/**
 * Type guard para verificar se é um AppError
 */
export function isAppError(error: unknown): error is AppError {
    return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        'category' in error &&
        'severity' in error
    );
}

/**
 * Retorna a definição de um código de erro
 */
export function getErrorDefinition(code: ErrorCode): ErrorDefinition {
    return ERROR_DEFINITIONS[code];
}

// ============================================
// Quick Error Creators (Atalhos)
// ============================================

export const Errors = {
    // LLM
    llmStreamParseError: (detail: string) =>
        createAppError('LLM_STREAM_PARSE_ERROR', { detail }),

    llmJsonInvalid: (detail: string) =>
        createAppError('LLM_JSON_INVALID', { detail }),

    llmResponseEmpty: () =>
        createAppError('LLM_RESPONSE_EMPTY'),

    llmTimeout: (timeout: number) =>
        createAppError('LLM_TIMEOUT', { timeout }),

    // Syntax
    syntaxInvalidPostFix: (detail: string) =>
        createAppError('SYNTAX_INVALID_POST_FIX', { detail }),

    syntaxJsxMalformed: (file: string, detail: string) =>
        createAppError('SYNTAX_JSX_MALFORMED', { file, detail }),

    syntaxUnterminatedString: (line: number) =>
        createAppError('SYNTAX_UNTERMINATED_STRING', { line }),

    syntaxUnclosedTag: (tag: string) =>
        createAppError('SYNTAX_UNCLOSED_TAG', { tag }),

    // Import
    importGraphBroken: (from: string, to: string) =>
        createAppError('IMPORT_GRAPH_BROKEN', { from, to }),

    importModuleNotFound: (module: string) =>
        createAppError('IMPORT_MODULE_NOT_FOUND', { module }),

    importCircularDetected: (chain: string) =>
        createAppError('IMPORT_CIRCULAR_DETECTED', { chain }),

    // Stub
    stubGenerationInvalid: (detail: string) =>
        createAppError('STUB_GENERATION_INVALID', { detail }),

    // WebContainer
    wcBootFail: (detail: string) =>
        createAppError('WC_BOOT_FAIL', { detail }),

    wcInstallFail: (detail: string) =>
        createAppError('WC_INSTALL_FAIL', { detail }),

    wcDevServerFail: (detail: string) =>
        createAppError('WC_DEVSERVER_FAIL', { detail }),

    wcFileWriteFail: (file: string, detail: string) =>
        createAppError('WC_FILE_WRITE_FAIL', { file, detail }),

    wcTimeout: (operation: string) =>
        createAppError('WC_TIMEOUT', { operation }),

    // Stream
    streamAborted: () =>
        createAppError('STREAM_ABORTED'),

    streamNetworkError: (detail: string) =>
        createAppError('STREAM_NETWORK_ERROR', { detail }),

    streamParseChunkFail: (detail: string) =>
        createAppError('STREAM_PARSE_CHUNK_FAIL', { detail }),

    // Network
    networkTimeout: (timeout: number) =>
        createAppError('NETWORK_TIMEOUT', { timeout }),

    networkFetchFailed: (detail: string) =>
        createAppError('NETWORK_FETCH_FAILED', { detail }),

    networkApiError: (status: number, detail: string) =>
        createAppError('NETWORK_API_ERROR', { status, detail }),

    // Generic
    unknown: (detail: string) =>
        createAppError('UNKNOWN_ERROR', { detail })
};

// ============================================
// Console Logger com Códigos de Erro
// ============================================

/**
 * Logger formatado para console com código de erro
 */
export function logError(error: AppError): void {
    const severityColors: Record<ErrorSeverity, string> = {
        LOW: '#6b7280',      // gray
        MEDIUM: '#f59e0b',   // amber
        HIGH: '#ef4444',     // red
        CRITICAL: '#dc2626'  // dark red
    };

    const color = severityColors[error.severity];

    console.error(
        `%c[${error.code}]%c ${error.message}`,
        `color: ${color}; font-weight: bold;`,
        'color: inherit;',
        '\n',
        {
            category: error.category,
            severity: error.severity,
            recoverable: error.recoverable,
            details: error.details,
            timestamp: error.timestamp
        }
    );
}

/**
 * Cria e loga um erro em uma única chamada
 */
export function logAndCreateError(
    code: ErrorCode,
    details?: Record<string, unknown>
): AppError {
    const error = createAppError(code, details);
    logError(error);
    return error;
}

// Export default para facilitar import
export default {
    Errors,
    createAppError,
    toAppError,
    isAppError,
    getErrorDefinition,
    logError,
    logAndCreateError,
    ERROR_DEFINITIONS
};
