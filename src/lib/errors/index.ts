/**
 * Errors Module Index
 * ===================
 * Re-exporta todos os utilitários de tratamento de erros
 */

export {
    // Types
    type AppError,
    type ErrorCode,
    type ErrorCategory,
    type ErrorSeverity,

    // Constants
    ERROR_DEFINITIONS,

    // Factory Functions
    createAppError,
    toAppError,
    isAppError,
    getErrorDefinition,

    // Quick Creators
    Errors,

    // Logging
    logError,
    logAndCreateError
} from './error-taxonomy';
