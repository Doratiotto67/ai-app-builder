/**
 * Sistema de Validação de Código - Versão Simplificada
 * Apenas o essencial para fazer o preview funcionar.
 */

export { 
  validateImports, 
  generateComponentStub, 
  validateAndCompleteFiles,
  type ExtractedFile,
  type ImportValidationResult,
  type MissingImport,
} from './validate-imports';

export {
  checkSyntax,
  type SyntaxResult,
} from './syntax-checker';

export {
  fixDependencies,
} from './dependency-fixer';

// Funções removidas (eram muito complexas e causavam problemas):
// - fixJSXSyntax, validateAndFixFile, fixAllFiles (syntax-fixer.ts)
// - validateProject, hasUnfixableErrors (project-validator.ts)
// - validateCodeCompleteness (code-completeness.ts)
// - completeCode, validateCompletion (code-completer.ts)
// - autoFix (auto-fix.ts)

// Substitutos simples para compatibilidade:

export interface SyntaxFixResult {
  code: string;
  fixed: boolean;
  fixes: string[];
}

export function fixJSXSyntax(code: string, _filename: string): SyntaxFixResult {
  // Apenas retorna o código sem modificações
  // A IA (fix-code) é quem deve corrigir erros
  return { code, fixed: false, fixes: [] };
}

export function validateAndFixFile(code: string, _filename: string): SyntaxFixResult {
  return { code, fixed: false, fixes: [] };
}

export function fixAllFiles(files: Array<{ path: string; content: string; language: string }>): {
  files: Array<{ path: string; content: string; language: string }>;
  totalFixes: number;
  fixesByFile: Record<string, string[]>;
} {
  // Apenas retorna os arquivos sem modificações
  return { files, totalFixes: 0, fixesByFile: {} };
}

export interface ProjectValidationResult {
  needsAIFix: boolean;
  errorLevel: 'none' | 'minor' | 'major' | 'critical';
  criticalErrors: Array<{ path: string; type: string; message: string }>;
  warnings: string[];
  structure: {
    hasPackageJson: boolean;
    hasIndexHtml: boolean;
    hasMainTsx: boolean;
    hasAppTsx: boolean;
    hasViteConfig: boolean;
    hasTsConfig: boolean;
    hasTailwindConfig: boolean;
  };
  missingFiles: string[];
  removedDuplicates: string[];
}

export function validateProject(files: Array<{ path: string; content: string; language: string }>): ProjectValidationResult {
  const paths = new Set(files.map(f => f.path));
  
  return {
    // SEMPRE precisa de AI fix para garantir código correto
    needsAIFix: true,
    errorLevel: 'none',
    criticalErrors: [],
    warnings: [],
    structure: {
      hasPackageJson: paths.has('package.json'),
      hasIndexHtml: paths.has('index.html'),
      hasMainTsx: paths.has('src/main.tsx') || paths.has('src/main.jsx'),
      hasAppTsx: paths.has('src/App.tsx') || paths.has('src/App.jsx'),
      hasViteConfig: paths.has('vite.config.ts') || paths.has('vite.config.js'),
      hasTsConfig: paths.has('tsconfig.json'),
      hasTailwindConfig: paths.has('tailwind.config.js') || paths.has('tailwind.config.ts'),
    },
    missingFiles: [],
    removedDuplicates: [],
  };
}

export function hasUnfixableErrors(_files: Array<{ path: string; content: string; language: string }>): boolean {
  return false;
}

export interface CompletenessResult {
  isComplete: boolean;
  confidence: number;
  issues: Array<{ type: string; severity: string; message: string; line?: number }>;
}

export function validateCodeCompleteness(_code: string, _language: string): CompletenessResult {
  // Assume que o código está completo - a IA corrige se não estiver
  return { isComplete: true, confidence: 100, issues: [] };
}

export interface CompletionResult {
  code: string;
  completed: boolean;
  changes: string[];
}

export function completeCode(code: string, _language: string): CompletionResult {
  return { code, completed: false, changes: [] };
}

export function validateCompletion(_original: string, _completed: string, _language: string): boolean {
  return true;
}
