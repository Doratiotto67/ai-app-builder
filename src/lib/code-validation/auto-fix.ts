/**
 * Utilitário para corrigir automaticamente erros comuns de sintaxe gerados pela IA.
 * Versão 5.0 - Sincronizado com supabase/functions/_shared/auto-fix.ts
 * Inclui suporte para padrões MULTILINHA (ternários em className)
 */
export function autoFix(code: string, filename: string): string {
    let fixed = code;

    // ==== FASE PRÉ: CORREÇÃO DE className MULTILINHA (antes de processar linhas) ====
    // Padrão que quebra em várias linhas:
    // className="text ${"
    //   isScrolled
    //     ? 'bg-white/80...'
    //     : 'bg-transparent...'
    // `}
    // 
    // Deve virar:
    // className={`text ${
    //   isScrolled
    //     ? 'bg-white/80...'
    //     : 'bg-transparent...'
    // }`}

    // Regex para detectar className=" seguido de ${ que não fecha na mesma linha
    // e depois várias linhas até }`}
    const multilinePattern = /className="([^"]*)\$\{"([\s\S]*?)}`\}/g;
    fixed = fixed.replace(multilinePattern, (match, beforeExpr, afterExpr) => {
        // Reconstruir como template literal correto
        const result = `className={\`${beforeExpr}\${${afterExpr}}\`}`;
        console.log(`[auto-fix v5] MULTILINHA: Corrigido className com ternário quebrado`);
        return result;
    });

    // Variação: className="...${ seguido de expressão e terminando com }" em linhas diferentes
    // className="relative p-8 ${
    //   plan.highlighted ? '...' : '...'
    // }"
    const multilinePattern2 = /className="([^"]*)\$\{([\s\S]*?)\}"/g;
    fixed = fixed.replace(multilinePattern2, (match, beforeExpr, expr) => {
        // Verificar se é realmente multilinha (tem quebra de linha)
        if (expr.includes('\n')) {
            const result = `className={\`${beforeExpr}\${${expr}}\`}`;
            console.log(`[auto-fix v5] MULTILINHA: Corrigido className com expressão multilinha`);
            return result;
        }
        return match;
    });

    // ==== FASE 0: CORREÇÃO CRÍTICA - className com vazamento (PROCESSAMENTO LINHA A LINHA) ====
    const lines = fixed.split('\n');
    const fixedLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        // NOVO: Padrão 0a: Backticks soltos dentro de className com aspas duplas
        // Ex: className="absolute inset-0 `text-white`" -> className="absolute inset-0 text-white"
        // Isso acontece quando a IA mistura sintaxes
        if (/className="[^"]*`[^"]*"/.test(line)) {
            line = line.replace(/className="([^"]*)"/g, (match, content) => {
                // Remover backticks soltos e seu conteúdo errôneo
                const cleaned = content.replace(/`([^`]*)`/g, '$1').replace(/`/g, '');
                console.log(`[auto-fix v5] LINHA ${i + 1}: Removidos backticks de className`);
                return `className="${cleaned}"`;
            });
        }

        // NOVO: Padrão 0b: className=" que termina com backtick antes do />
        // Ex: className="absolute inset-0 ` -> remover o backtick
        if (/className="[^"]*`\s*$/.test(line)) {
            line = line.replace(/className="([^"]*)`\s*$/, 'className="$1"');
            console.log(`[auto-fix v5] LINHA ${i + 1}: Removido backtick no final de className`);
        }

        // NOVO: Padrão 0c: Linha que começa com /> mas a anterior tinha className incompleto
        // Isso será tratado na FASE 4

        // Padrão 1: className="...${...}..." seguido de classes vazando e terminando com `}>
        const brokenPattern = /className="([^"]*\$\{[^\}]+\}[^"]*)"[\s]+([^`]+)`\}/;
        const match1 = line.match(brokenPattern);
        if (match1) {
            const insideQuotes = match1[1];
            const outsideClasses = match1[2].trim();
            const combined = `${insideQuotes} ${outsideClasses}`;
            line = line.replace(brokenPattern, `className={\`${combined}\`}`);
            console.log(`[auto-fix v5] LINHA ${i + 1}: Corrigido className vazado com \${}`);
        }

        // Padrão 2: className="..." seguido de classes vazando e terminando com `}>  (sem ${})
        const brokenPattern2 = /className="([^"]+)"[\s]+([a-zA-Z][^`]*)`\}/;
        const match2 = line.match(brokenPattern2);
        if (match2 && !line.includes('={`')) {
            const insideQuotes = match2[1];
            const outsideClasses = match2[2].trim();
            const combined = `${insideQuotes} ${outsideClasses}`;
            if (combined.includes('${')) {
                line = line.replace(brokenPattern2, `className={\`${combined}\`}`);
            } else {
                line = line.replace(brokenPattern2, `className="${combined}"`);
            }
            console.log(`[auto-fix v5] LINHA ${i + 1}: Corrigido className vazado sem \${}`);
        }

        // Padrão 3: className="...${...}..." inline - deve virar template literal
        if (/className="[^"]*\$\{[^\}]+\}[^"]*"/.test(line)) {
            line = line.replace(/className="([^"]*\$\{[^\}]+\}[^"]*)"/g, 'className={`$1`}');
            console.log(`[auto-fix v5] LINHA ${i + 1}: Convertido className inline para template`);
        }

        // Padrão 4: Qualquer atributo="...${...}..." deve virar atributo={`...`}
        if (/(\w+)="[^"]*\$\{[^\}]+\}[^"]*"/.test(line)) {
            line = line.replace(/(\w+)="([^"]*\$\{[^\}]+\}[^"]*)"/g, '$1={`$2`}');
        }

        // NOVO: Padrão 5: className que começa mas não fecha na mesma linha e tem />
        // Ex: className="absolute inset-0
        //        />
        // Deve virar: className="absolute inset-0" />
        if (/className="[^"]*$/.test(line) && !line.includes('/>') && !line.endsWith('>')) {
            // Verificar se próxima linha tem /> ou similar
            const nextLine = lines[i + 1]?.trim() || '';
            if (nextLine.startsWith('/>') || nextLine === '/>') {
                line = line + '"';
                console.log(`[auto-fix v5] LINHA ${i + 1}: Fechadas aspas de className truncado`);
            }
        }

        fixedLines.push(line);
    }

    fixed = fixedLines.join('\n');

    // ==== FASE 1: CORREÇÕES DE IMPORTAÇÃO ====
    fixed = fixed.replace(/import\s+(.*?)\s+from\s+(?!['"])([A-Za-z@][A-Za-z0-9@/_-]*)\s*;?$/gm, "import $1 from '$2';");
    fixed = fixed.replace(/(import\s+.*?from\s+['"].*?['"])(?!;)(\n)/g, "$1;$2");
    fixed = fixed.replace(/['"]use client['"];?\s*\n?/g, '');

    // ==== FASE 2: CORREÇÕES DE TAGS HTML/JSX ====
    fixed = fixed.replace(/\sclass="/g, ' className="');
    fixed = fixed.replace(/\sclass='/g, " className='");

    const voidTags = ['img', 'input', 'br', 'hr', 'link', 'meta', 'source', 'track', 'area', 'base', 'col', 'embed', 'wbr'];
    voidTags.forEach(tag => {
        const regex = new RegExp(`<(${tag})\\b([^>]*?)(?<!/)>`, 'gi');
        fixed = fixed.replace(regex, '<$1$2 />');
    });

    // ==== FASE 3: CORREÇÕES DE ESTRUTURA ====
    if (filename.match(/\.(tsx|jsx)$/) && !fixed.includes('export default') && !fixed.includes('export {')) {
        const baseName = filename.split('/').pop()?.split('.')[0];
        if (baseName && (fixed.match(new RegExp(`function\\s+${baseName}`)) || fixed.match(new RegExp(`const\\s+${baseName}\\s*=`)))) {
            fixed += `\n\nexport default ${baseName};`;
        }
    }

    fixed = fixed.replace(/```\s*$/, '');
    fixed = fixed.replace(/^```\w*\s*\n?/, '');

    // ==== FASE 4: CORREÇÕES DE TRUNCAMENTO (TODAS AS LINHAS) ====
    // Processar cada linha para encontrar tags JSX truncadas
    const linesPhase4 = fixed.split('\n');
    const fixedLinesPhase4: string[] = [];

    for (let i = 0; i < linesPhase4.length; i++) {
        let line = linesPhase4[i];

        // Padrão: linha termina com tag JSX aberta mas sem > ou />
        // Ex: <div className="foo" (falta >)
        // Ex: <div className="foo (truncado no meio)

        // Caso 1: Atributo não fechado no final da linha (truncado)
        const unclosedAttr = line.match(/<(\w+)\s+[^>]*(\w+)="([^"]*?)$/);
        if (unclosedAttr) {
            // Verificar se a próxima linha continua o atributo ou é uma nova tag
            const nextLine = linesPhase4[i + 1]?.trim() || '';
            const isVoidTag = ['img', 'input', 'br', 'hr', 'link', 'meta'].includes(unclosedAttr[1].toLowerCase());

            if (nextLine.startsWith('<') || nextLine.startsWith('{') || !nextLine) {
                // Próxima linha é uma nova tag - essa linha estava truncada, fechar
                line = line + '"' + (isVoidTag ? ' />' : '>');
                console.log(`[auto-fix v5] LINHA ${i + 1}: Tag truncada fechada`);
            }
        }

        // Caso 2: Atributo className fechado mas tag não fechada
        // Ex: <div className="foo bar"  (tem aspas fechadas mas falta >)
        const unclosedTag = line.match(/<(\w+)\s+(?:[^>]*?[^/])$/);
        if (unclosedTag && !line.endsWith('>')) {
            const nextLine = linesPhase4[i + 1]?.trim() || '';
            // Se próxima linha começa com < ou é vazia, essa linha precisa de >
            if ((nextLine.startsWith('<') || !nextLine) && !line.endsWith('"') && !line.endsWith("'")) {
                line = line + '>';
                console.log(`[auto-fix v5] LINHA ${i + 1}: Tag sem fechamento, adicionado >`);
            }
        }

        // Caso 3: Linha termina com className="xxx" sem > depois
        if (/className="[^"]*"$/.test(line) && !line.endsWith('>')) {
            const nextLine = linesPhase4[i + 1]?.trim() || '';
            if (nextLine.startsWith('<') || nextLine.startsWith('{')) {
                line = line + '>';
                console.log(`[auto-fix v5] LINHA ${i + 1}: className fechado mas falta > na tag`);
            }
        }

        fixedLinesPhase4.push(line);
    }

    fixed = fixedLinesPhase4.join('\n');

    // Correções de truncamento na última linha (caso original)
    const lastLineIndex = fixed.lastIndexOf('\n');
    const lastLine = fixed.substring(lastLineIndex + 1);

    const unclosedDouble = lastLine.match(/(\w+)="([^"]*?)$/);
    if (unclosedDouble) {
        const hasSlash = lastLine.includes('<input') || lastLine.includes('<img');
        fixed = fixed + (hasSlash ? '" />' : '">');
        console.log(`[auto-fix v5] Fechando atributo truncado: ${unclosedDouble[1]}`);
    }

    const unclosedSingle = lastLine.match(/(\w+)='([^']*?)$/);
    if (unclosedSingle) {
        const hasSlash = lastLine.includes('<input') || lastLine.includes('<img');
        fixed = fixed + (hasSlash ? "' />" : "'>");
    }

    if (/className=["'][^"']*$/.test(fixed)) {
        fixed = fixed.replace(/(className=["'])([^"']*)$/, '$1$2">');
    }

    // ==== FASE 5: LIMPEZA FINAL ====
    // REMOVIDO: A conversão de <tag></tag> para <tag /> estava causando erros JSX
    // pois convertia divs vazias incorretamente. Apenas void elements devem ser self-closing.
    // A conversão de void elements já é feita na FASE 2 acima.

    // Corrigir divs e spans que foram erroneamente convertidas para self-closing
    // Padrão: <div ... /> quando deveria ser <div ...></div>
    // Mas só se NÃO for imediatamente seguido de conteúdo
    const nonVoidTags = ['div', 'span', 'p', 'a', 'button', 'section', 'article', 'header', 'footer', 'main', 'nav', 'aside', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'form', 'label', 'table', 'thead', 'tbody', 'tr', 'td', 'th'];

    // NÃO converter essas tags para self-closing se estiverem vazias
    // Na verdade, precisamos REVERTER se já foram convertidas incorretamente
    nonVoidTags.forEach(tag => {
        // Padrão problemático: <div className="..." /> que deveria ser <div className="..."></div>
        // Mas cuidado para não quebrar componentes React que SÃO self-closing
        // Só corrija se for o tag HTML exato (lowercase)
        const selfClosingPattern = new RegExp(`<${tag}\\b([^>]*?)\\s*/>`, 'g');
        fixed = fixed.replace(selfClosingPattern, (match, attrs) => {
            // Se tem atributos típicos de uma div vazia que deveria ter conteúdo
            // NÃO converter automaticamente - pode ser intencional
            // Apenas log para debug
            return match;
        });
    });

    return fixed;
}
