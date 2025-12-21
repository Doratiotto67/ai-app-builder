/**
 * Verificador de Sintaxe Simplificado para Edge Functions
 * Apenas detecta problemas óbvios, não tenta corrigir.
 */

export interface SyntaxResult {
  valid: boolean;
  errors: string[];
}

export function checkSyntax(code: string, filename: string): SyntaxResult {
  const errors: string[] = [];

  // Ignorar arquivos que não são código JS/TS
  if (!filename.match(/\.(tsx|jsx|ts|js)$/)) {
    return { valid: true, errors: [] };
  }

  // 1. Verificar balanceamento de chaves
  const openBraces = (code.match(/{/g) || []).length;
  const closeBraces = (code.match(/}/g) || []).length;
  if (openBraces !== closeBraces) {
    errors.push(`Chaves desbalanceadas: ${openBraces} '{' vs ${closeBraces} '}'`);
  }

  // 2. Verificar balanceamento de parênteses
  const openParens = (code.match(/\(/g) || []).length;
  const closeParens = (code.match(/\)/g) || []).length;
  if (openParens !== closeParens) {
    errors.push(`Parênteses desbalanceados: ${openParens} '(' vs ${closeParens} ')'`);
  }

  // 3. Verificar balanceamento de colchetes
  const openBrackets = (code.match(/\[/g) || []).length;
  const closeBrackets = (code.match(/\]/g) || []).length;
  if (openBrackets !== closeBrackets) {
    errors.push(`Colchetes desbalanceados: ${openBrackets} '[' vs ${closeBrackets} ']'`);
  }

  // 4. Detectar código truncado óbvio
  const trimmed = code.trim();
  if (trimmed.endsWith('=') || trimmed.endsWith('{') || trimmed.endsWith('(')) {
    errors.push(`Código parece estar truncado`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Verifica integridade entre arquivos (imports que existem)
 */
export function checkFilesIntegrity(files: Array<{ path: string; content: string }>): Array<{ path: string; errors: string[] }> {
  const results: Array<{ path: string; errors: string[] }> = [];
  const existingPaths = new Set(files.map(f => f.path));
  
  // Adicionar caminhos com extensões inferidas
  files.forEach(f => {
    const basePath = f.path.replace(/\.(tsx|ts|jsx|js)$/, '');
    existingPaths.add(basePath);
    existingPaths.add(basePath + '.ts');
    existingPaths.add(basePath + '.tsx');
    existingPaths.add(basePath + '.js');
    existingPaths.add(basePath + '.jsx');
    existingPaths.add(basePath + '/index.ts');
    existingPaths.add(basePath + '/index.tsx');
  });

  for (const file of files) {
    if (!file.path.match(/\.(tsx|jsx|ts|js)$/)) continue;
    
    const errors: string[] = [];
    
    // Encontrar imports relativos
    const importRegex = /import\s+.*?from\s+['"](\.[^'"]+)['"]/g;
    let match;
    
    while ((match = importRegex.exec(file.content)) !== null) {
      const importPath = match[1];
      const dir = file.path.substring(0, file.path.lastIndexOf('/'));
      
      // Resolver caminho relativo
      let resolvedPath: string;
      if (importPath.startsWith('./')) {
        resolvedPath = dir + '/' + importPath.substring(2);
      } else if (importPath.startsWith('../')) {
        const parts = dir.split('/');
        parts.pop();
        resolvedPath = parts.join('/') + '/' + importPath.substring(3);
      } else {
        resolvedPath = dir + '/' + importPath;
      }
      
      // Normalizar
      resolvedPath = resolvedPath.replace(/\/+/g, '/').replace(/^\//, '');
      
      // Verificar se existe (com ou sem extensão)
      const possiblePaths = [
        resolvedPath,
        resolvedPath + '.ts',
        resolvedPath + '.tsx',
        resolvedPath + '.js',
        resolvedPath + '.jsx',
        resolvedPath + '/index.ts',
        resolvedPath + '/index.tsx',
      ];
      
      const exists = possiblePaths.some(p => existingPaths.has(p));
      if (!exists) {
        errors.push(`Arquivo '${resolvedPath}' importado mas não encontrado`);
      }
    }
    
    if (errors.length > 0) {
      results.push({ path: file.path, errors });
    }
  }
  
  return results;
}
