/**
 * Verificador de Sintaxe Simplificado
 * Apenas detecta problemas óbvios, sem tentar corrigir.
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
