/**
 * Módulo compartilhado: Syntax Checker
 * Valida código TypeScript/JSX para detectar erros comuns.
 */

export interface SyntaxResult {
    valid: boolean;
    errors: string[];
}

export interface FileToCheck {
    path: string;
    content: string;
}

// Pacotes permitidos no projeto
const ALLOWED_PACKAGES = [
    'react', 'react-dom', 'react-dom/client', 'react/jsx-runtime',
    'react-router-dom',
    'clsx', 'tailwind-merge', 'framer-motion',
    'lucide-react', 'react-icons', 'react-icons/fa', 'react-icons/fi',
    'react-icons/md', 'react-icons/bi', 'react-icons/bs', 'react-icons/hi',
    '@supabase/supabase-js', 'axios', 'swr', '@tanstack/react-query',
    'react-hook-form', 'zod', '@hookform/resolvers/zod',
    'date-fns', 'uuid', 'lodash', 'canvas-confetti',
    '@headlessui/react', 'react-hot-toast',
    'recharts', 'chart.js', 'react-chartjs-2'
];

/**
 * Extrai exports nomeados e default de um arquivo
 */
function extractExports(content: string): { named: string[]; hasDefault: boolean } {
    const named: string[] = [];
    let hasDefault = false;

    // export default
    if (/export\s+default\s+/.test(content)) {
        hasDefault = true;
    }

    // export function Name
    const funcExports = content.match(/export\s+function\s+(\w+)/g) || [];
    funcExports.forEach(m => {
        const match = m.match(/export\s+function\s+(\w+)/);
        if (match) named.push(match[1]);
    });

    // export const Name
    const constExports = content.match(/export\s+const\s+(\w+)/g) || [];
    constExports.forEach(m => {
        const match = m.match(/export\s+const\s+(\w+)/);
        if (match) named.push(match[1]);
    });

    // export { Name1, Name2 }
    const bracketExports = content.match(/export\s*{([^}]+)}/g) || [];
    bracketExports.forEach(m => {
        const inner = m.match(/export\s*{([^}]+)}/);
        if (inner) {
            inner[1].split(',').forEach(n => {
                const name = n.trim().split(/\s+as\s+/)[0].trim();
                if (name && name !== 'default') named.push(name);
                if (name === 'default') hasDefault = true;
            });
        }
    });

    // export type/interface
    const typeExports = content.match(/export\s+(type|interface)\s+(\w+)/g) || [];
    typeExports.forEach(m => {
        const match = m.match(/export\s+(type|interface)\s+(\w+)/);
        if (match) named.push(match[2]);
    });

    return { named, hasDefault };
}

/**
 * Extrai imports de um arquivo
 */
function extractImports(content: string): { from: string; named: string[]; defaultImport: string | null }[] {
    const imports: { from: string; named: string[]; defaultImport: string | null }[] = [];

    // Regex para capturar imports
    const importRegex = /import\s+(?:(\w+)\s*,?\s*)?(?:{([^}]+)})?\s*from\s+['"]([^'"]+)['"]/g;
    let match;

    while ((match = importRegex.exec(content)) !== null) {
        const defaultImport = match[1] || null;
        const namedStr = match[2] || '';
        const from = match[3];

        const named = namedStr.split(',')
            .map(n => n.trim().split(/\s+as\s+/)[0].trim())
            .filter(n => n.length > 0);

        imports.push({ from, named, defaultImport });
    }

    return imports;
}

/**
 * Valida sintaxe de um único arquivo
 */
export function checkSyntax(code: string, filename: string): SyntaxResult {
    const errors: string[] = [];

    // Ignorar arquivos não-JS/TS
    if (!filename.match(/\.(tsx|jsx|ts|js)$/)) {
        return { valid: true, errors: [] };
    }

    // 1. Verificar imports sem aspas
    const importsWithoutQuotes = code.match(/import\s+.*?from\s+(?!['"])([\w@/-]+)(?!['"])/g);
    if (importsWithoutQuotes) {
        importsWithoutQuotes.forEach(imp => {
            if (!imp.includes("'") && !imp.includes('"')) {
                errors.push(`Import sem aspas: "${imp}"`);
            }
        });
    }

    // 2. Verificar balanceamento de chaves
    const openBraces = (code.match(/{/g) || []).length;
    const closeBraces = (code.match(/}/g) || []).length;

    if (openBraces !== closeBraces) {
        errors.push(`Chaves desbalanceadas: ${openBraces} '{' vs ${closeBraces} '}'`);
    }

    // 3. Verificar export em componentes
    if (filename.match(/\.(tsx|jsx)$/) && !code.includes('export default') && !code.includes('export {') && !code.includes('export function') && !code.includes('export const')) {
        if (!filename.includes('/types/') && !filename.includes('.d.ts')) {
            errors.push(`Nenhum export encontrado em ${filename}`);
        }
    }

    // 4. Verificar código incompleto
    if (code.includes('// ... rest of code') || code.includes('// ... existing code')) {
        errors.push(`Código incompleto detectado (placeholder encontrado)`);
    }

    // 5. Verificar parênteses balanceados
    const openParens = (code.match(/\(/g) || []).length;
    const closeParens = (code.match(/\)/g) || []).length;

    if (openParens !== closeParens) {
        errors.push(`Parênteses desbalanceados: ${openParens} '(' vs ${closeParens} ')'`);
    }

    // 6. Verificar colchetes balanceados
    const openBrackets = (code.match(/\[/g) || []).length;
    const closeBrackets = (code.match(/\]/g) || []).length;

    if (openBrackets !== closeBrackets) {
        errors.push(`Colchetes desbalanceados: ${openBrackets} '[' vs ${closeBrackets} ']'`);
    }

    // 7. NOVO: Verificar strings não fechadas (aspas duplas e simples)
    // Remove template literals e comentários para evitar falsos positivos
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
        errors.push(`Aspas duplas desbalanceadas: ${doubleQuotes} encontradas (deve ser par)`);
    }

    const singleQuotes = countUnescapedQuotes(codeWithoutComments, "'");
    if (singleQuotes % 2 !== 0) {
        errors.push(`Aspas simples desbalanceadas: ${singleQuotes} encontradas (deve ser par)`);
    }

    // 8. NOVO: Detectar className ou atributo truncado no final
    const lastLines = code.split('\n').slice(-5).join('\n');
    if (/className=["'][^"']*$/.test(lastLines)) {
        errors.push(`Atributo className truncado no final do arquivo`);
    }
    if (/\w+=["'][^"']*$/.test(lastLines) && !lastLines.trim().endsWith('>') && !lastLines.trim().endsWith('/>')) {
        errors.push(`Atributo JSX com valor não fechado no final do arquivo`);
    }

    // 9. NOVO: Detectar tag JSX aberta sem fechamento
    // Padrão: <ComponentName ou <tag seguido de atributos mas sem > ou />
    const potentialOpenTags = code.match(/<[A-Z][A-Za-z0-9]*[^>]*$/gm);
    if (potentialOpenTags && potentialOpenTags.length > 0) {
        // Verificar se a última linha tem uma tag aberta
        const lastLine = code.split('\n').pop() || '';
        if (/<[A-Za-z][A-Za-z0-9]*[^/>]*$/.test(lastLine.trim())) {
            errors.push(`Tag JSX não fechada na última linha: "${lastLine.trim().substring(0, 50)}..."`);
        }
    }

    // 10. NOVO: Detectar código que termina abruptamente
    const trimmedCode = code.trim();
    const suspiciousEndings = [
        /=\s*$/, // Termina com =
        /,\s*$/, // Termina com vírgula (pode ser válido, mas suspeito)
        /{\s*$/, // Termina com { aberto
        /\(\s*$/, // Termina com ( aberto
        /<[A-Za-z]+[^>]*$/, // Termina com tag aberta
    ];

    for (const pattern of suspiciousEndings) {
        if (pattern.test(trimmedCode)) {
            errors.push(`Código parece truncado (termina com padrão suspeito)`);
            break;
        }
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Valida um conjunto de arquivos, verificando se imports correspondem a exports
 */
export function checkFilesIntegrity(files: FileToCheck[]): { path: string; errors: string[] }[] {
    const results: { path: string; errors: string[] }[] = [];

    // Construir mapa de exports por arquivo
    const exportsMap = new Map<string, { named: string[]; hasDefault: boolean }>();

    files.forEach(f => {
        // Normalizar path (remover src/ se presente para comparação)
        const normalizedPath = f.path.replace(/^src\//, '');
        exportsMap.set(normalizedPath, extractExports(f.content));
        exportsMap.set(f.path, extractExports(f.content)); // Também com path original
    });

    // Verificar cada arquivo
    files.forEach(file => {
        const errors: string[] = [];
        const imports = extractImports(file.content);

        imports.forEach(imp => {
            // Ignorar imports de pacotes externos
            if (!imp.from.startsWith('.') && !imp.from.startsWith('/')) {
                return;
            }

            // Resolver path relativo
            const basePath = file.path.split('/').slice(0, -1).join('/');
            let resolvedPath = imp.from;

            if (imp.from.startsWith('./')) {
                resolvedPath = basePath + '/' + imp.from.slice(2);
            } else if (imp.from.startsWith('../')) {
                const parts = basePath.split('/');
                let fromParts = imp.from.split('/');
                while (fromParts[0] === '..') {
                    parts.pop();
                    fromParts.shift();
                }
                resolvedPath = [...parts, ...fromParts].join('/');
            }

            // Adicionar extensão se não tiver
            if (!resolvedPath.match(/\.(tsx|jsx|ts|js)$/)) {
                resolvedPath += '.tsx';
            }

            // Verificar se o arquivo existe
            const targetExports = exportsMap.get(resolvedPath) ||
                exportsMap.get(resolvedPath.replace('.tsx', '.ts')) ||
                exportsMap.get(resolvedPath.replace('.tsx', '.jsx')) ||
                exportsMap.get(resolvedPath.replace('.tsx', '.js'));

            if (!targetExports) {
                // Arquivo não encontrado no conjunto - ADICIONAR AO ARRAY DE ERROS
                errors.push(`Arquivo '${resolvedPath}' importado mas não encontrado no projeto (importado em '${file.path}')`);
                console.log(`[integrity] ❌ Arquivo não encontrado no conjunto: ${resolvedPath} (importado de ${file.path})`);
                return;
            }

            // Verificar imports nomeados
            imp.named.forEach(namedImport => {
                if (!targetExports.named.includes(namedImport)) {
                    errors.push(`Import '${namedImport}' não existe em '${imp.from}'. Exports disponíveis: [${targetExports.named.join(', ')}]`);
                }
            });

            // Verificar import default
            if (imp.defaultImport && !targetExports.hasDefault) {
                errors.push(`Import default '${imp.defaultImport}' usado, mas '${imp.from}' não tem export default`);
            }
        });

        if (errors.length > 0) {
            results.push({ path: file.path, errors });
        }
    });

    return results;
}

export { ALLOWED_PACKAGES };
