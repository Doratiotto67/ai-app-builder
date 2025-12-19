'use client';

/**
 * Módulo de correção de sintaxe para código JSX/TSX
 * Corrige erros comuns antes de enviar ao WebContainer
 */

export interface SyntaxFixResult {
  code: string;
  fixed: boolean;
  fixes: string[];
}

/**
 * Corrige erros de sintaxe comuns em código JSX/TSX
 */
export function fixJSXSyntax(code: string, filename: string): SyntaxFixResult {
  const fixes: string[] = [];
  let fixed = code;

  // 1. Remover 'use client' que não é necessário no Vite
  if (fixed.includes("'use client'") || fixed.includes('"use client"')) {
    fixed = fixed.replace(/['"]use client['"];?\s*\n?/g, '');
    fixes.push("Removido 'use client'");
  }

  // 2. Corrigir import truncado (linha cortada)
  // Detectar imports sem fechamento
  fixed = fixed.replace(/import\s+\{([^}]+)$/gm, (match, imports) => {
    // Se a linha não termina com } from '...', está truncada
    fixes.push('Corrigido import truncado');
    return `import { ${imports.trim()} } from 'lucide-react';`;
  });
  
  // 3. Garantir que imports de lucide-react estão completos
  fixed = fixed.replace(/import\s+\{([^}]+)\}\s+from\s*$/gm, (match, imports) => {
    fixes.push('Adicionado origem do import');
    return `import { ${imports.trim()} } from 'lucide-react';`;
  });

  // 4. Corrigir className truncado ou mal formado
  fixed = fixed.replace(/className="([^"]*)\n/g, (match, classes) => {
    fixes.push('Corrigido className truncado');
    return `className="${classes.trim()}">\n`;
  });

  // 5. Corrigir tags JSX não fechadas
  const selfClosingTags = ['input', 'img', 'br', 'hr', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr'];
  selfClosingTags.forEach(tag => {
    const regex = new RegExp(`<${tag}([^/>]*[^/])>(?!\\s*</${tag}>)`, 'gi');
    const before = fixed;
    fixed = fixed.replace(regex, `<${tag}$1 />`);
    if (fixed !== before) {
      fixes.push(`Corrigido <${tag}> para self-closing`);
    }
  });

  // 6. Garantir espaço antes de />
  fixed = fixed.replace(/([^\s])\/>/g, '$1 />');

  // 7. Remover placeholders "..." que a IA gera
  fixed = fixed.replace(/^\s*\.\.\.\s*$/gm, '');
  fixed = fixed.replace(/^\s*\/\/\s*\.\.\.\s*$/gm, '');
  fixed = fixed.replace(/\{\/\*\s*\.\.\.\s*\*\/\}/g, '');
  fixed = fixed.replace(/\{\s*\/\*\s*conteúdo\s*\*\/\s*\}/g, '');

  // 8. Verificar export default - NÃO ADICIONAR AUTOMATICAMENTE
  // A adição automática estava quebrando código ao inserir no lugar errado
  // Apenas verificar se existe, mas NÃO modificar
  const hasExportDefault = /export\s+default\s+(function|class|const|\w+)/.test(fixed);
  
  // DESABILITADO: A adição automática de export default causava mais problemas do que resolvia
  // O prompt da IA já instrui a gerar exports corretos
  // Se não tiver export default, deixar como está - o erro será mais claro para debugar
  if (!hasExportDefault) {
    // Apenas logar, não modificar
    const funcMatch = fixed.match(/(?:export\s+)?function\s+(\w+)/);
    const constMatch = fixed.match(/(?:export\s+)?const\s+(\w+)\s*[:=]/);
    const componentName = funcMatch?.[1] || constMatch?.[1];
    if (componentName) {
      console.warn(`[SyntaxFixer] Componente ${componentName} sem export default - deixando como está`);
    }
  }

  // 9. Balanceamento de tags HTML - DESABILITADO
  // Essa correção automática estava adicionando tags no final do código
  // de forma cega, corrompendo a estrutura JSX
  // const commonTags = ['div', 'section', 'header', 'footer', ...];
  // DESABILITADO: muito destrutivo

  // 10. Balanceamento de chaves { } - DESABILITADO
  // Essa correção estava adicionando } no final sem saber onde pertence
  // DESABILITADO: muito destrutivo

  // 11. Balanceamento de parênteses ( ) - DESABILITADO
  // Essa correção estava adicionando ) no final sem saber onde pertence
  // DESABILITADO: muito destrutivo

  // 12. Corrigir JSX com texto solto (comum quando IA trunca)
  // Remover linhas que são apenas texto solto sem tags
  fixed = fixed.replace(/^\s*[A-Z][a-zA-Z\s]+[a-z]\s*$/gm, (match) => {
    // Se parece ser uma linha de texto solto, comentar
    if (!match.includes('<') && !match.includes('{') && !match.includes('import') && !match.includes('export') && !match.includes('function') && !match.includes('const') && !match.includes('return')) {
      fixes.push('Removida linha de texto solto');
      return '';
    }
    return match;
  });

  // 13. Remover linhas vazias excessivas
  fixed = fixed.replace(/\n{3,}/g, '\n\n');

  // 14. Garantir que o arquivo termina com newline
  if (!fixed.endsWith('\n')) {
    fixed += '\n';
  }

  // 15. Detectar código truncado - DESABILITADO
  // Essa correção estava tentando "completar" código truncado
  // mas acabava inserindo fechamentos no lugar errado
  // DESABILITADO: muito destrutivo

  // 16. Garantir estrutura mínima - DESABILITADO
  // Adicionar placeholder para componente vazio causava mais problemas
  // DESABILITADO: muito destrutivo

  return {
    code: fixed,
    fixed: fixes.length > 0,
    fixes,
  };
}


/**
 * Valida e corrige um arquivo completo
 */
export function validateAndFixFile(path: string, content: string): SyntaxFixResult {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  
  // Apenas processar arquivos JSX/TSX
  if (!['tsx', 'jsx', 'ts', 'js'].includes(ext)) {
    return { code: content, fixed: false, fixes: [] };
  }

  return fixJSXSyntax(content, path);
}

/**
 * Aplica correções em lote a múltiplos arquivos
 */
export function fixAllFiles(files: Array<{ path: string; content: string; language: string }>): {
  files: Array<{ path: string; content: string; language: string }>;
  totalFixes: number;
  fixesByFile: Record<string, string[]>;
} {
  const fixesByFile: Record<string, string[]> = {};
  let totalFixes = 0;

  const fixedFiles = files.map(file => {
    const result = validateAndFixFile(file.path, file.content);
    
    if (result.fixed) {
      fixesByFile[file.path] = result.fixes;
      totalFixes += result.fixes.length;
      console.log(`[SyntaxFixer] ${file.path}: ${result.fixes.length} correções`, result.fixes);
    }

    return {
      ...file,
      content: result.code,
    };
  });

  return {
    files: fixedFiles,
    totalFixes,
    fixesByFile,
  };
}
