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

  // 8. Verificar e adicionar export default se não existir
  const hasExportDefault = /export\s+default\s+(function|class|const|\w+)/.test(fixed);
  const hasNamedExport = /export\s+(function|const|class)\s+\w+/.test(fixed);
  
  if (!hasExportDefault) {
    // Encontrar o nome do componente
    const funcMatch = fixed.match(/(?:export\s+)?function\s+(\w+)/);
    const constMatch = fixed.match(/(?:export\s+)?const\s+(\w+)\s*[:=]/);
    const componentName = funcMatch?.[1] || constMatch?.[1];
    
    if (componentName) {
      // Se já tem export function, adicionar export default no final
      if (hasNamedExport) {
        if (!fixed.includes(`export default ${componentName}`)) {
          fixed = fixed.trimEnd() + `\n\nexport default ${componentName};\n`;
          fixes.push(`Adicionado export default ${componentName}`);
        }
      } else {
        // Adicionar export na função
        fixed = fixed.replace(
          new RegExp(`function\\s+${componentName}`),
          `export default function ${componentName}`
        );
        fixes.push(`Adicionado export default function ${componentName}`);
      }
    }
  }

  // 9. Corrigir tags de abertura sem fechamento correspondente
  // Verificar balanceamento de TODAS as tags HTML comuns (não só div)
  const commonTags = ['div', 'section', 'header', 'footer', 'main', 'nav', 'article', 'aside', 'span', 'p', 'ul', 'ol', 'li', 'button', 'form', 'table', 'thead', 'tbody', 'tr', 'td', 'th'];
  
  commonTags.forEach(tag => {
    const openRegex = new RegExp(`<${tag}(?:\\s|>)`, 'gi');
    const closeRegex = new RegExp(`</${tag}>`, 'gi');
    const openCount = (fixed.match(openRegex) || []).length;
    const closeCount = (fixed.match(closeRegex) || []).length;
    
    if (openCount > closeCount) {
      const missing = openCount - closeCount;
      // Adicionar as tags de fechamento antes do último fechamento ou no final
      fixed = fixed.trimEnd() + '\n' + `</${tag}>\n`.repeat(missing);
      fixes.push(`Adicionadas ${missing} tags </${tag}> faltantes`);
    }
  });


  // 10. Verificar balanceamento de chaves { }
  const openBraces = (fixed.match(/\{/g) || []).length;
  const closeBraces = (fixed.match(/\}/g) || []).length;
  
  if (openBraces > closeBraces) {
    const missing = openBraces - closeBraces;
    // Adicionar fechamentos antes do final
    const lastReturn = fixed.lastIndexOf('return');
    if (lastReturn > -1) {
      // Encontrar o final da função e adicionar }
      fixed = fixed.trimEnd() + '\n' + '}\n'.repeat(missing);
      fixes.push(`Adicionadas ${missing} chaves } faltantes`);
    }
  }

  // 11. Verificar balanceamento de parênteses ( )
  const openParens = (fixed.match(/\(/g) || []).length;
  const closeParens = (fixed.match(/\)/g) || []).length;
  
  if (openParens > closeParens) {
    const missing = openParens - closeParens;
    fixed = fixed.trimEnd() + ')'.repeat(missing) + ';\n';
    fixes.push(`Adicionados ${missing} parênteses ) faltantes`);
  }

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

  // 15. Detectar código truncado no return - estrutura JSX incompleta
  // Verificar se há um return ( sem o ) correspondente no final
  const returnMatch = fixed.match(/return\s*\(\s*([\s\S]*?)$/);
  if (returnMatch) {
    const jsxContent = returnMatch[1];
    // Se o JSX não termina com ); ou ) seguido de }, provavelmente está truncado
    const endsCorrectly = /\)\s*;?\s*\}?\s*$/.test(fixed.trim());
    if (!endsCorrectly) {
      // Verificar qual tag raiz foi aberta para fechar corretamente
      const rootTagMatch = jsxContent.match(/^\s*<(\w+)/);
      if (rootTagMatch) {
        const rootTag = rootTagMatch[1];
        // Verificar se a tag raiz está fechada
        const rootCloseRegex = new RegExp(`</${rootTag}>\\s*$`);
        if (!rootCloseRegex.test(jsxContent.trim())) {
          fixed = fixed.trimEnd() + `\n    </${rootTag}>\n  );\n}\n`;
          fixes.push(`Adicionado fechamento para raiz <${rootTag}> e estrutura de função`);
        }
      }
    }
  }

  // 16. Garantir estrutura mínima de componente React
  // Se tem export default function mas não tem return nem JSX, adicionar placeholder
  if (/export\s+default\s+function\s+\w+/.test(fixed) && !fixed.includes('return')) {
    const funcNameMatch = fixed.match(/export\s+default\s+function\s+(\w+)/);
    if (funcNameMatch) {
      // Encontrar onde a função termina e adicionar um return básico
      fixed = fixed.replace(
        /export\s+default\s+function\s+(\w+)\s*\([^)]*\)\s*\{/,
        `export default function $1() {\n  return (\n    <div className="p-4">Carregando...</div>\n  );\n`
      );
      fixes.push('Adicionado return placeholder para componente vazio');
    }
  }

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
