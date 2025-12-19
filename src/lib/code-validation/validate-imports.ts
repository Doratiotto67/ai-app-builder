'use client';

/**
 * Módulo de validação de imports e geração de stubs
 * Garante que todos os imports são resolvíveis antes de enviar ao WebContainer
 */

export interface ExtractedFile {
  path: string;
  content: string;
  language: string;
}

export interface MissingImport {
  sourceFile: string;
  importPath: string;
  importedName: string;
  suggestedPath: string;
}

export interface ImportValidationResult {
  valid: boolean;
  missingImports: MissingImport[];
}

// Regex para extrair imports relativos
const IMPORT_REGEX = /import\s+(?:{[^}]+}|\w+|\*\s+as\s+\w+)\s+from\s+['"](\.[^'"]+)['"]/g;
const IMPORT_NAME_REGEX = /import\s+(?:{([^}]+)}|(\w+))/;

/**
 * Normaliza um caminho de import para um caminho de arquivo
 */
function resolveImportPath(basePath: string, importPath: string): string {
  // Remover ./ do início se existir
  const cleanImport = importPath.replace(/^\.\//, '');
  
  // Pegar diretório base do arquivo
  const baseDir = basePath.includes('/') 
    ? basePath.substring(0, basePath.lastIndexOf('/'))
    : '';
  
  // Resolver caminho relativo
  let resolved: string;
  if (importPath.startsWith('../')) {
    // Subir diretório
    const parts = baseDir.split('/').filter(Boolean);
    const upCount = (importPath.match(/\.\.\//g) || []).length;
    const remaining = importPath.replace(/\.\.\//g, '');
    const newBase = parts.slice(0, parts.length - upCount).join('/');
    resolved = newBase ? `${newBase}/${remaining}` : remaining;
  } else if (importPath.startsWith('./')) {
    resolved = baseDir ? `${baseDir}/${cleanImport}` : cleanImport;
  } else {
    resolved = cleanImport;
  }
  
  // Adicionar extensão se não tiver
  if (!resolved.match(/\.(tsx?|jsx?|css|json)$/)) {
    resolved += '.tsx';
  }
  
  return resolved;
}

/**
 * Extrai o nome do componente de um import
 */
function extractImportName(importStatement: string): string {
  const match = importStatement.match(IMPORT_NAME_REGEX);
  if (match) {
    // Import com chaves: { Component }
    if (match[1]) {
      const names = match[1].split(',').map(n => n.trim().split(' as ')[0].trim());
      return names[0] || 'Component';
    }
    // Import default
    if (match[2]) {
      return match[2];
    }
  }
  return 'Component';
}

/**
 * Valida se todos os imports são resolvíveis
 */
export function validateImports(files: ExtractedFile[]): ImportValidationResult {
  const missingImports: MissingImport[] = [];
  
  // Criar mapa de arquivos existentes (normalizado sem src/ inicial)
  const existingPaths = new Set<string>();
  for (const file of files) {
    const normalizedPath = file.path.replace(/^src\//, '');
    existingPaths.add(file.path);
    existingPaths.add(normalizedPath);
    // Também adicionar versões sem extensão para matching
    existingPaths.add(file.path.replace(/\.(tsx?|jsx?)$/, ''));
    existingPaths.add(normalizedPath.replace(/\.(tsx?|jsx?)$/, ''));
  }
  
  console.log('[validateImports] Arquivos existentes:', Array.from(existingPaths));
  
  for (const file of files) {
    // Apenas processar arquivos JS/TS
    if (!file.path.match(/\.(tsx?|jsx?)$/)) continue;
    
    // Encontrar todos os imports relativos
    const content = file.content;
    let match;
    IMPORT_REGEX.lastIndex = 0;
    
    while ((match = IMPORT_REGEX.exec(content)) !== null) {
      const importPath = match[0];
      const relativePath = match[1];
      
      // Ignorar imports de pacotes (não relativos)
      if (!relativePath.startsWith('.')) continue;
      
      // Resolver o caminho do import
      const resolvedPath = resolveImportPath(file.path, relativePath);
      const resolvedWithoutExt = resolvedPath.replace(/\.(tsx?|jsx?)$/, '');
      
      // Verificar se existe (com ou sem extensão)
      const exists = existingPaths.has(resolvedPath) || 
                     existingPaths.has(resolvedWithoutExt) ||
                     existingPaths.has(`src/${resolvedPath}`) ||
                     existingPaths.has(`src/${resolvedWithoutExt}`);
      
      if (!exists) {
        const importedName = extractImportName(importPath);
        console.log(`[validateImports] Import faltante: ${importedName} em ${file.path} → ${resolvedPath}`);
        
        missingImports.push({
          sourceFile: file.path,
          importPath: relativePath,
          importedName,
          suggestedPath: resolvedPath.startsWith('src/') ? resolvedPath : `src/${resolvedPath}`,
        });
      }
    }
  }
  
  return {
    valid: missingImports.length === 0,
    missingImports,
  };
}

/**
 * Gera um componente stub para um import faltante
 */
export function generateComponentStub(componentName: string, path: string): ExtractedFile {
  // Capitalizar nome do componente
  const name = componentName.charAt(0).toUpperCase() + componentName.slice(1);
  
  // Determinar tipo baseado no path
  let stubType = 'feature';
  if (path.includes('/layout/') || ['Header', 'Footer', 'Sidebar', 'Navbar'].some(n => name.includes(n))) {
    stubType = 'layout';
  } else if (path.includes('/ui/') || ['Button', 'Card', 'Input', 'Modal'].some(n => name.includes(n))) {
    stubType = 'ui';
  }
  
  // Gerar conteúdo baseado no tipo
  let content: string;
  
  if (stubType === 'layout') {
    content = `// ${path} - Auto-generated stub
import { ${name.includes('Header') ? 'Menu' : name.includes('Footer') ? 'Github' : 'Layout'} } from 'lucide-react';

export function ${name}() {
  return (
    <div className="w-full p-4 bg-zinc-900/50 border border-zinc-800 backdrop-blur">
      <div className="flex items-center justify-between max-w-6xl mx-auto">
        <div className="flex items-center gap-2">
          <${name.includes('Header') ? 'Menu' : name.includes('Footer') ? 'Github' : 'Layout'} className="h-5 w-5 text-violet-400" />
          <span className="font-medium text-zinc-200">${name}</span>
        </div>
        <span className="text-xs text-zinc-500">Componente placeholder</span>
      </div>
    </div>
  );
}

export default ${name};
`;
  } else if (stubType === 'ui') {
    content = `// ${path} - Auto-generated stub
import { Box } from 'lucide-react';

export function ${name}({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return (
    <div className={\`p-4 rounded-lg border border-zinc-700 bg-zinc-800/50 \${className}\`}>
      {children || (
        <div className="flex items-center gap-2 text-zinc-400">
          <Box className="h-4 w-4" />
          <span>${name}</span>
        </div>
      )}
    </div>
  );
}

export default ${name};
`;
  } else {
    // Feature/Section component
    content = `// ${path} - Auto-generated stub
import { Sparkles } from 'lucide-react';

export function ${name}() {
  return (
    <section className="py-16 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col items-center justify-center p-12 rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/30">
          <Sparkles className="h-8 w-8 text-violet-400 mb-4" />
          <h2 className="text-2xl font-bold text-zinc-200 mb-2">${name}</h2>
          <p className="text-zinc-500 text-center max-w-md">
            Este componente será implementado em breve. 
            Peça ao AI Assistant para criar o conteúdo.
          </p>
        </div>
      </div>
    </section>
  );
}

export default ${name};
`;
  }
  
  return {
    path: path.replace(/\.(jsx?)$/, '.tsx'), // Garantir extensão .tsx
    content,
    language: 'tsx',
  };
}

/**
 * Valida e completa arquivos com stubs para imports faltantes
 */
export function validateAndCompleteFiles(files: ExtractedFile[]): {
  files: ExtractedFile[];
  stubsGenerated: number;
  validation: ImportValidationResult;
} {
  const validation = validateImports(files);
  
  if (validation.valid) {
    return { files, stubsGenerated: 0, validation };
  }
  
  // Gerar stubs para imports faltantes (evitar duplicatas)
  const generatedPaths = new Set<string>();
  const stubs: ExtractedFile[] = [];
  
  for (const missing of validation.missingImports) {
    if (!generatedPaths.has(missing.suggestedPath)) {
      generatedPaths.add(missing.suggestedPath);
      stubs.push(generateComponentStub(missing.importedName, missing.suggestedPath));
      console.log(`[validateAndCompleteFiles] Stub gerado: ${missing.suggestedPath}`);
    }
  }
  
  return {
    files: [...files, ...stubs],
    stubsGenerated: stubs.length,
    validation,
  };
}
