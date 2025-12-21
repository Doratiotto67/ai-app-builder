import { ALLOWED_PACKAGES } from './allowed-packages';

export interface SyntaxResult {
    valid: boolean;
    errors: string[];
}

export function checkSyntax(code: string, filename: string): SyntaxResult {
    const errors: string[] = [];

    // Ignorar arquivos não-JS/TS/CSS que não precisam de validação estrita
    if (!filename.match(/\.(tsx|jsx|ts|js)$/)) {
        return { valid: true, errors: [] };
    }

    // 1. Verificar imports válidos e formato
    const importLines = code.match(/import\s+.*?from\s+['"](.*)['"]]/g);
    const importPathsRegex = /from\s+['"](.*)['"]]/;

    // Verificar imports sem aspas (Erro fatal comum) -> "import x from y"
    const importsWithoutQuotes = code.match(/import\s+.*?from\s+(?!['\"])[\w@/-]+(?!['\"])/g);
    if (importsWithoutQuotes) {
        importsWithoutQuotes.forEach(imp => {
            if (!imp.includes("'") && !imp.includes('"')) {
                errors.push(`❌ Import sem aspas detectado: "${imp}". Imports devem usar aspas simples ou duplas.`);
            }
        });
    }

    if (importLines) {
        for (const line of importLines) {
            const pathMatch = line.match(importPathsRegex);
            if (pathMatch && pathMatch[1]) {
                const path = pathMatch[1];

                if (!path.startsWith('.') && !path.startsWith('@/') && !path.startsWith('/')) {
                    const basePackage = path.split('/')[0].startsWith('@')
                        ? `${path.split('/')[0]}/${path.split('/')[1]}`
                        : path.split('/')[0];

                    // Validação permissiva para não bloquear criatividade
                }
            }
        }
    }

    // 2. Verificar Funções e Blocos (Chaves)
    const openBraces = (code.match(/{/g) || []).length;
    const closeBraces = (code.match(/}/g) || []).length;

    if (openBraces !== closeBraces) {
        const diff = Math.abs(openBraces - closeBraces);
        if (diff > 0) {
            errors.push(`❌ Desbalanço de chaves detectado: ${openBraces} '{' vs ${closeBraces} '}'. O código pode estar incompleto.`);
        }
    }

    // 3. Verificar parênteses balanceados
    const openParens = (code.match(/\(/g) || []).length;
    const closeParens = (code.match(/\)/g) || []).length;
    if (openParens !== closeParens) {
        errors.push(`❌ Parênteses desbalanceados: ${openParens} '(' vs ${closeParens} ')'`);
    }

    // 4. Verificar colchetes balanceados
    const openBrackets = (code.match(/\[/g) || []).length;
    const closeBrackets = (code.match(/\]/g) || []).length;
    if (openBrackets !== closeBrackets) {
        errors.push(`❌ Colchetes desbalanceados: ${openBrackets} '[' vs ${closeBrackets} ']'`);
    }

    // 5. Verificar Export Default (para componentes e páginas)
    if (filename.match(/\.(tsx|jsx)$/) && !code.includes('export default') && !code.includes('export {') && !code.includes('export function') && !code.includes('export const')) {
        if (!filename.includes('/types/') && !filename.includes('.d.ts')) {
            errors.push(`⚠️ Nenhum export encontrado em ${filename}. Componentes geralmente precisam de 'export default'.`);
        }
    }

    // 6. Verificar "rest of code" (alucinação comum)
    if (code.includes('// ... rest of code') || code.includes('// ... existing code')) {
        errors.push(`❌ O código contém comentários placeholder ('// ... rest of code'). A IA deve gerar o arquivo COMPLETO.`);
    }

    // 7. NOVO: Verificar strings não fechadas (aspas duplas e simples)
    const codeWithoutTemplates = code.replace(/`[^`]*`/g, '""');
    const codeWithoutComments = codeWithoutTemplates
        .replace(/\/\/.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');

    // Contar aspas MANUALMENTE (sem lookbehind - compatibilidade)
    function countUnescapedQuotes(str: string, quoteChar: string): number {
        let count = 0;
        let escaped = false;

        for (let i = 0; i < str.length; i++) {
            const char = str[i];

            if (escaped) {
                escaped = false;
                continue;
            }

            if (char === '\\') {
                escaped = true;
                continue;
            }

            if (char === quoteChar) {
                count++;
            }
        }

        return count;
    }

    const doubleQuotes = countUnescapedQuotes(codeWithoutComments, '"');
    if (doubleQuotes % 2 !== 0) {
        errors.push(`❌ Aspas duplas desbalanceadas: ${doubleQuotes} encontradas (deve ser par)`);
    }

    const singleQuotes = countUnescapedQuotes(codeWithoutComments, "'");
    if (singleQuotes % 2 !== 0) {
        errors.push(`❌ Aspas simples desbalanceadas: ${singleQuotes} encontradas (deve ser par)`);
    }

    // 8. NOVO: Detectar className ou atributo truncado no final
    const lastLines = code.split('\n').slice(-5).join('\n');
    if (/className=["'][^"']*$/.test(lastLines)) {
        errors.push(`❌ Atributo className truncado no final do arquivo`);
    }
    if (/\w+=["'][^"']*$/.test(lastLines) && !lastLines.trim().endsWith('>') && !lastLines.trim().endsWith('/>')) {
        errors.push(`❌ Atributo JSX com valor não fechado no final do arquivo`);
    }

    // 9. NOVO: Detectar tag JSX aberta sem fechamento
    const lastLine = code.split('\n').pop() || '';
    if (/<[A-Za-z][A-Za-z0-9]*[^/>]*$/.test(lastLine.trim())) {
        errors.push(`❌ Tag JSX não fechada na última linha: "${lastLine.trim().substring(0, 50)}..."`);
    }

    // 10. NOVO: Detectar código que termina abruptamente
    const trimmedCode = code.trim();
    const suspiciousEndings = [
        /=\s*$/,
        /{\s*$/,
        /\(\s*$/,
        /<[A-Za-z]+[^>]*$/,
    ];

    for (const pattern of suspiciousEndings) {
        if (pattern.test(trimmedCode)) {
            errors.push(`❌ Código parece truncado (termina com padrão suspeito)`);
            break;
        }
    }

    return {
        valid: errors.length === 0,
        errors
    };
}
