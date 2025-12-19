// Sistema de Debug Centralizado
// Logs organizados por categoria e com cores distintas

type LogCategory = 
  | 'CHAT'        // Mensagens do chat e IA
  | 'PREVIEW'     // WebContainer e preview
  | 'FILES'       // Operações de arquivos
  | 'STORE'       // Zustand store
  | 'AUTH'        // Autenticação
  | 'API'         // Chamadas de API
  | 'EXTRACT'     // Extração de código
  | 'WEBCONTAINER'; // WebContainer específico

type LogLevel = 'info' | 'warn' | 'error' | 'success' | 'debug';

const COLORS: Record<LogCategory, string> = {
  CHAT: '#8B5CF6',        // Violet
  PREVIEW: '#06B6D4',     // Cyan
  FILES: '#10B981',       // Emerald
  STORE: '#F59E0B',       // Amber
  AUTH: '#EC4899',        // Pink
  API: '#3B82F6',         // Blue
  EXTRACT: '#F97316',     // Orange
  WEBCONTAINER: '#14B8A6', // Teal
};

const LEVEL_ICONS: Record<LogLevel, string> = {
  info: 'ℹ️',
  warn: '⚠️',
  error: '❌',
  success: '✅',
  debug: '🔍',
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  info: '#94A3B8',
  warn: '#FBBF24',
  error: '#EF4444',
  success: '#22C55E',
  debug: '#A855F7',
};

// Flag para habilitar/desabilitar debug globalmente
const DEBUG_ENABLED = process.env.NODE_ENV === 'development';

// Categorias habilitadas (pode ser configurado)
const ENABLED_CATEGORIES: Set<LogCategory> = new Set([
  'CHAT',
  'PREVIEW',
  'FILES',
  'STORE',
  'AUTH',
  'API',
  'EXTRACT',
  'WEBCONTAINER',
]);

class Logger {
  private category: LogCategory;
  private startTimes: Map<string, number> = new Map();

  constructor(category: LogCategory) {
    this.category = category;
  }

  private isEnabled(): boolean {
    return DEBUG_ENABLED && ENABLED_CATEGORIES.has(this.category);
  }

  private formatMessage(level: LogLevel, message: string, data?: unknown): void {
    if (!this.isEnabled()) return;

    const timestamp = new Date().toLocaleTimeString('pt-BR', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      fractionalSecondDigits: 3 
    });

    const categoryColor = COLORS[this.category];
    const levelIcon = LEVEL_ICONS[level];
    const levelColor = LEVEL_COLORS[level];

    // Estilo do console
    const categoryStyle = `background: ${categoryColor}; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;`;
    const timeStyle = 'color: #6B7280; font-size: 10px;';
    const messageStyle = `color: ${levelColor}; font-weight: 500;`;

    if (data !== undefined) {
      console.groupCollapsed(
        `%c${this.category}%c ${timestamp} %c${levelIcon} ${message}`,
        categoryStyle,
        timeStyle,
        messageStyle
      );
      console.log(data);
      console.groupEnd();
    } else {
      console.log(
        `%c${this.category}%c ${timestamp} %c${levelIcon} ${message}`,
        categoryStyle,
        timeStyle,
        messageStyle
      );
    }
  }

  info(message: string, data?: unknown): void {
    this.formatMessage('info', message, data);
  }

  warn(message: string, data?: unknown): void {
    this.formatMessage('warn', message, data);
  }

  error(message: string, data?: unknown): void {
    this.formatMessage('error', message, data);
  }

  success(message: string, data?: unknown): void {
    this.formatMessage('success', message, data);
  }

  debug(message: string, data?: unknown): void {
    this.formatMessage('debug', message, data);
  }

  // Timer para medir performance
  time(label: string): void {
    if (!this.isEnabled()) return;
    this.startTimes.set(label, performance.now());
    this.debug(`⏱️ Timer iniciado: ${label}`);
  }

  timeEnd(label: string): void {
    if (!this.isEnabled()) return;
    const startTime = this.startTimes.get(label);
    if (startTime) {
      const duration = performance.now() - startTime;
      this.startTimes.delete(label);
      this.success(`⏱️ ${label}: ${duration.toFixed(2)}ms`);
    }
  }

  // Log de tabela para dados estruturados
  table(message: string, data: unknown[]): void {
    if (!this.isEnabled()) return;
    const categoryColor = COLORS[this.category];
    const categoryStyle = `background: ${categoryColor}; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;`;
    console.log(`%c${this.category}%c 📊 ${message}`, categoryStyle, 'color: #94A3B8;');
    console.table(data);
  }
}

// Factory para criar loggers por categoria
export const createLogger = (category: LogCategory): Logger => new Logger(category);

// Loggers pré-configurados para uso direto
export const chatLog = createLogger('CHAT');
export const previewLog = createLogger('PREVIEW');
export const filesLog = createLogger('FILES');
export const storeLog = createLogger('STORE');
export const authLog = createLogger('AUTH');
export const apiLog = createLogger('API');
export const extractLog = createLogger('EXTRACT');
export const webcontainerLog = createLogger('WEBCONTAINER');

// Função para listar todos os logs habilitados
export function logSystemStatus(): void {
  if (!DEBUG_ENABLED) return;
  
  console.log('%c🔧 DEBUG SYSTEM ENABLED', 'background: #1F2937; color: #10B981; padding: 8px 16px; font-size: 14px; border-radius: 4px;');
  console.log('%cCategorias ativas:', 'color: #9CA3AF; margin-left: 8px;');
  
  ENABLED_CATEGORIES.forEach(cat => {
    console.log(`  %c${cat}`, `color: ${COLORS[cat]}; font-weight: bold;`);
  });
}
