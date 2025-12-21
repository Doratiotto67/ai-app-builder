'use client';

import { useCallback, useState } from 'react';
import { useIDEStore } from '@/stores/ide-store';
import { fixCode as fixCodeViaAI } from '@/lib/api/project-service';

interface CodeError {
  line: number;
  message: string;
  severity: 'error' | 'warning';
}

interface UseCodeFixerResult {
  hasErrors: boolean;
  errors: CodeError[];
  isFixing: boolean;
  fixCode: () => Promise<string | null>;
  analyzeCode: (code: string) => CodeError[];
  requestAIFix: () => Promise<string | null>;
}

// Padrões de erros comuns em JSX/TSX
const ERROR_PATTERNS = [
  { regex: /<(\w+)([^>]*[^/])>(?![^<]*<\/\1>)/g, message: 'Tag não fechada', severity: 'error' as const },
  { regex: /className=\{[^}]*$/gm, message: 'className não fechado', severity: 'error' as const },
  { regex: /\.\.\./g, message: 'Placeholder "..." detectado', severity: 'warning' as const },
  { regex: /<input(?![^>]*\/>)/gi, message: '<input> deve ser self-closing', severity: 'error' as const },
  { regex: /<img(?![^>]*\/>)/gi, message: '<img> deve ser self-closing', severity: 'error' as const },
  { regex: /<br(?![^>]*\/>)/gi, message: '<br> deve ser self-closing', severity: 'error' as const },
  { regex: /import\s+{[^}]+}\s+from\s+['"][^'"]+['"]\s*[^;]/gm, message: 'Import sem ponto e vírgula', severity: 'warning' as const },
];

export function useCodeFixer(): UseCodeFixerResult {
  const { activeFile, editorContent, setEditorContent, files, updateFile } = useIDEStore();
  const [isFixing, setIsFixing] = useState(false);
  const [errors, setErrors] = useState<CodeError[]>([]);

  // Analisa o código em busca de erros comuns
  const analyzeCode = useCallback((code: string): CodeError[] => {
    const foundErrors: CodeError[] = [];
    const lines = code.split('\n');

    lines.forEach((line, index) => {
      ERROR_PATTERNS.forEach(pattern => {
        if (pattern.regex.test(line)) {
          foundErrors.push({
            line: index + 1,
            message: pattern.message,
            severity: pattern.severity,
          });
        }
        // Reset regex lastIndex
        pattern.regex.lastIndex = 0;
      });
    });

    // Verificar balanceamento de chaves/parênteses
    let braces = 0;
    let parens = 0;
    let brackets = 0;

    for (let i = 0; i < code.length; i++) {
      const char = code[i];
      if (char === '{') braces++;
      if (char === '}') braces--;
      if (char === '(') parens++;
      if (char === ')') parens--;
      if (char === '[') brackets++;
      if (char === ']') brackets--;
    }

    if (braces !== 0) {
      foundErrors.push({ line: 0, message: `Chaves desbalanceadas: ${braces > 0 ? 'faltando }' : 'sobrando }'}`, severity: 'error' });
    }
    if (parens !== 0) {
      foundErrors.push({ line: 0, message: `Parênteses desbalanceados: ${parens > 0 ? 'faltando )' : 'sobrando )'}`, severity: 'error' });
    }
    if (brackets !== 0) {
      foundErrors.push({ line: 0, message: `Colchetes desbalanceados: ${brackets > 0 ? 'faltando ]' : 'sobrando ]'}`, severity: 'error' });
    }

    return foundErrors;
  }, []);

  // Aplica correções automáticas no código
  const autoFixCode = useCallback((code: string): string => {
    let fixed = code;

    // Corrigir tags self-closing
    const selfClosingTags = ['input', 'img', 'br', 'hr', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr'];
    selfClosingTags.forEach(tag => {
      // Corrigir <tag ...> para <tag ... />
      const regex = new RegExp(`<${tag}(\\s[^>]*[^/])?>`, 'gi');
      fixed = fixed.replace(regex, (match) => {
        if (match.endsWith('/>')) return match;
        return match.slice(0, -1) + ' />';
      });
    });

    // Remover placeholders "..."
    fixed = fixed.replace(/^\s*\.\.\.\s*$/gm, '');
    fixed = fixed.replace(/^\s*\/\/\s*\.\.\.\s*$/gm, '');
    fixed = fixed.replace(/^\s*{\s*\/\*\s*\.\.\.\s*\*\/\s*}\s*$/gm, '');

    // Adicionar ponto e vírgula em imports
    fixed = fixed.replace(/(import\s+{[^}]+}\s+from\s+['"][^'"]+['"])\s*\n/g, '$1;\n');

    // Remover linhas vazias consecutivas (mais de 2)
    fixed = fixed.replace(/\n{3,}/g, '\n\n');

    return fixed;
  }, []);

  // Função principal de correção
  const fixCode = useCallback(async (): Promise<string | null> => {
    if (!activeFile) return null;

    setIsFixing(true);

    try {
      const currentContent = editorContent[activeFile.id] || activeFile.content_text || '';

      // Analisar erros
      const foundErrors = analyzeCode(currentContent);
      setErrors(foundErrors);

      if (foundErrors.length === 0) {
        setIsFixing(false);
        return null;
      }

      // Aplicar correções automáticas
      const fixedCode = autoFixCode(currentContent);

      // Atualizar no editor
      setEditorContent(activeFile.id, fixedCode);

      // Atualizar no store de arquivos
      updateFile(activeFile.id, { content_text: fixedCode });

      setIsFixing(false);
      return fixedCode;
    } catch (error) {
      console.error('Erro ao corrigir código:', error);
      setIsFixing(false);
      return null;
    }
  }, [activeFile, editorContent, analyzeCode, autoFixCode, setEditorContent, updateFile]);

  // Solicitar correção via API de chat para erros complexos
  const requestAIFix = useCallback(async (): Promise<string | null> => {
    if (!activeFile) return null;

    setIsFixing(true);

    try {
      const currentContent = editorContent[activeFile.id] || activeFile.content_text || '';

      // 1. Tentar correções automáticas locais primeiro
      const fixedByAuto = autoFixCode(currentContent);

      // 2. Enviar para IA (Edge Function)
      // Precisamos identificar o arquivo corretamente
      const filesToFix = [{
        path: activeFile.path,
        content: fixedByAuto,
        language: activeFile.language || 'tsx'
      }];

      const { files: aiFixedFiles, error } = await fixCodeViaAI(filesToFix, {
        intent: 'fix_syntax_and_imports',
        strict_scope: true
      });

      if (error) {
        throw new Error(error);
      }

      if (aiFixedFiles && aiFixedFiles.length > 0) {
        const bestFix = aiFixedFiles[0];

        // Atualizar no editor e store
        setEditorContent(activeFile.id, bestFix.content);
        updateFile(activeFile.id, { content_text: bestFix.content });
        setIsFixing(false);
        return bestFix.content;
      }

      // Fallback: se IA não retornou nada, usar auto-fix local
      setEditorContent(activeFile.id, fixedByAuto);
      updateFile(activeFile.id, { content_text: fixedByAuto });

      setIsFixing(false);
      return fixedByAuto;
    } catch (error) {
      console.error('Erro ao solicitar correção via IA:', error);
      setIsFixing(false);
      return null;
    }
  }, [activeFile, editorContent, autoFixCode, setEditorContent, updateFile]);

  // Verificar se há erros no arquivo ativo
  const hasErrors = errors.length > 0;

  return {
    hasErrors,
    errors,
    isFixing,
    fixCode,
    analyzeCode,
    requestAIFix,
  };
}
