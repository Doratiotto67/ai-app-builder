import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { logAgentEvent, errorToLogEntry } from '../_shared/agent-logger.ts';
import { checkSyntax, checkFilesIntegrity } from '../_shared/syntax-checker.ts';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1';
// v2.1.0 - Removido fast-path para garantir qualidade do JSX


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FileToFix {
  path: string;
  content: string;
  language: string;
}

interface FixedFile {
  path: string;
  content: string;
  language: string;
  wasFixed: boolean;
  fixes: string[];
}

/**
 * Gera um stub funcional para um arquivo faltante baseado no seu caminho e nome
 */
function generateMissingFileStub(filePath: string): string {
  const fileName = filePath.split('/').pop() || '';
  const baseName = fileName.replace(/\.(tsx|ts|jsx|js)$/, '');

  // Stubs especiais para arquivos comuns
  if (filePath.includes('utils/cn') || baseName === 'cn') {
    return `// ${filePath}
import clsx, { ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
`;
  }

  if (filePath.includes('lib/utils')) {
    return `// ${filePath}
import clsx, { ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString();
}
`;
  }

  // Para páginas, criar componente de página
  if (filePath.includes('/pages/') || filePath.includes('/views/')) {
    const pageTitle = baseName.charAt(0).toUpperCase() + baseName.slice(1);
    return `// ${filePath}
import React from 'react';

export default function ${baseName}Page() {
  return (
    <div data-source-file="${filePath}" className="min-h-screen bg-white dark:bg-gray-900 p-8">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">${pageTitle}</h1>
      <p className="mt-4 text-gray-600 dark:text-gray-400">Esta página está em desenvolvimento.</p>
    </div>
  );
}
`;
  }

  // Para componentes UI
  if (filePath.includes('/ui/') || filePath.includes('/components/ui/')) {
    return `// ${filePath}
import React from 'react';

interface ${baseName}Props {
  children?: React.ReactNode;
  className?: string;
}

export function ${baseName}({ children, className = '' }: ${baseName}Props) {
  return (
    <div data-source-file="${filePath}" className={className}>
      {children}
    </div>
  );
}

export default ${baseName};
`;
  }

  // Para componentes genéricos
  if (filePath.endsWith('.tsx') || filePath.endsWith('.jsx')) {
    return `// ${filePath}
import React from 'react';

interface ${baseName}Props {
  className?: string;
}

export default function ${baseName}({ className = '' }: ${baseName}Props) {
  return (
    <div data-source-file="${filePath}" className={className}>
      <p className="text-gray-500">${baseName} Component</p>
    </div>
  );
}
`;
  }

  // Para arquivos TypeScript (não JSX)
  return `// ${filePath}
// Arquivo gerado automaticamente

export {};
`;
}

const FIX_PROMPT = `Você é o agente FIX CODE (Validator). Sua missão é eliminar 100% dos erros que causam "linhas vermelhas" E garantir que elementos interativos FUNCIONEM DE VERDADE.

## REGRAS ABSOLUTAS
1) Nunca devolva código com erro de TypeScript, JSX ou import inexistente.
2) Se um import apontar para arquivo que não existe, corrija o caminho OU crie stub mínimo funcional.
3) Se houver erro de JSX (tags desbalanceadas, return quebrado, aspas abertas), corrija PRIMEIRO.
4) Remova imports/variáveis não usadas apenas se estiverem gerando erro/lint.
5) Não apague funcionalidades; preserve comportamento. Só mude o mínimo para compilar e rodar.
6) Proibido placeholders como "// resto do código", "TODO", "...". Tudo deve compilar.

## BIBLIOTECAS DISPONÍVEIS
\`\`\`
react, react-dom, react-router-dom
lucide-react (ícones - PREFERIDO)
clsx, tailwind-merge (utilitários CSS)
framer-motion (animações)
react-hot-toast (notificações/toasts)
date-fns (manipulação de datas)
@headlessui/react (modais, dropdowns, etc)
zustand (estado global)
axios (requisições HTTP)
react-icons (ícones alternativos)
\`\`\`

## SUBSTITUIÇÕES OBRIGATÓRIAS
- \`@radix-ui/*\` -> Use \`@headlessui/react\` ou CSS puro
- \`sonner\` -> Use \`react-hot-toast\`
- \`next/*\` (next/image, next/link, next/head) -> Converta para HTML/react-router-dom
- \`use client\` -> REMOVA (não necessário em Vite)
- \`BrowserRouter\` no App.tsx -> REMOVA (já existe no main.tsx)

## 🔍 VERIFICAÇÃO DE FUNCIONALIDADE (NOVO!)

Além de erros de sintaxe, verifique se elementos interativos FUNCIONAM:

### ❌ ERROS FUNCIONAIS COMUNS:
1. **Botão de tema sem lógica:**
   - Tem onClick mas não usa useState
   - Não aplica classList.toggle('dark')
   - FIX: Adicionar estado e efeito para aplicar no document

2. **Toggle visual sem estado:**
   - Mostra UI de toggle mas não muda ao clicar
   - FIX: Adicionar useState e onClick

3. **Input sem onChange:**
   - Input com value mas sem onChange (fica read-only)
   - FIX: Adicionar onChange handler

4. **Formulário sem preventDefault:**
   - Form causa refresh da página
   - FIX: Adicionar e.preventDefault() no onSubmit

5. **Modal que não fecha:**
   - Abre mas não tem lógica para fechar
   - FIX: Adicionar estado isOpen e botão de fechar

### ✅ PADRÃO CORRETO PARA TOGGLE DE TEMA:
\`\`\`tsx
const [isDark, setIsDark] = useState(() => 
  localStorage.getItem('theme') === 'dark' || 
  window.matchMedia('(prefers-color-scheme: dark)').matches
);

useEffect(() => {
  document.documentElement.classList.toggle('dark', isDark);
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
}, [isDark]);
\`\`\`

## ALVO DE QUALIDADE (CHECKLIST)
- Nenhum erro em: tsc --noEmit
- Nenhum erro de sintaxe JSX/TSX
- Nenhum import quebrado (arquivo inexistente)
- Nenhuma exportação faltando (default vs named)
- Componentes sempre retornam JSX válido
- **NOVO:** Botões/toggles têm estado e funcionam
- **NOVO:** Inputs têm onChange
- **NOVO:** Cores são consistentes com o tema

## PROCESSO (ORDEM DE PRIORIDADE)
A) JSX quebrado (tags/aspas/return)
B) Imports quebrados (arquivo não existe)
C) Exports inconsistentes (default vs named)
D) Tipagem TS (props, retorno, tipos)
E) Lint (unused vars/imports)
F) **NOVO:** Funcionalidade de elementos interativos

## SE DEPENDER DE ARQUIVO AUSENTE
- Crie o arquivo mínimo necessário com export correto
- Stub deve retornar <div /> simples para não quebrar layout

## FORMATO DE RESPOSTA (JSON PURO)
\`\`\`json
{
  "files": [
    {
      "path": "src/App.tsx",
      "content": "CONTEÚDO DO ARQUIVO COMPLETO (NÃO TRUNQUE NADA!)",
      "wasFixed": true,
      "fixes": ["Fechou tag div na linha 40", "Adicionou estado para toggle de tema", "Corrigiu cores inconsistentes"]
    }
  ]
}
\`\`\`

OBJETIVO FINAL: ZERO LINHAS VERMELHAS + FUNCIONALIDADE COMPLETA.
`;

/**
 * Sanitiza resposta JSON removendo caracteres de controle e escapando newlines dentro de strings
 */
function sanitizeJsonResponse(str: string): string {
  // Remove caracteres de controle (exceto newline, tab, carriage return normais)
  str = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  let inString = false;
  let escaped = false;
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (escaped) { result += char; escaped = false; continue; }
    if (char === '\\') { escaped = true; result += char; continue; }
    if (char === '"') { inString = !inString; result += char; continue; }
    if (inString && (char === '\n' || char === '\r')) { result += char === '\n' ? '\\n' : '\\r'; continue; }
    if (inString && char === '\t') { result += '\\t'; continue; }
    result += char;
  }
  return result;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  let filesCount = 0;

  try {
    const requestBody = await req.json() as {
      files: FileToFix[];
      strict_scope?: boolean;
      allowed_paths?: string[];
      intent?: string;
    };

    const { files, strict_scope = false, allowed_paths = [], intent = 'remove_red_errors_only' } = requestBody;
    filesCount = files?.length || 0;

    if (!files || files.length === 0) {
      return new Response(JSON.stringify({ files: [], error: 'No files to fix' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const openrouterApiKey = Deno.env.get('OPENROUTER_API_KEY');
    if (!openrouterApiKey) {
      return new Response(JSON.stringify({ error: 'OpenRouter API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const filesToProcessRaw = strict_scope && allowed_paths.length > 0
      ? files.filter(f => allowed_paths.includes(f.path))
      : files;

    const filesToProcessFiltered = filesToProcessRaw.slice(0, 15);

    // Processar arquivos diretamente (sem auto-fix local - a IA faz a correção)
    const processedFiles = [...filesToProcessFiltered];

    let syntaxErrorsFound = 0;
    const validationResults: { path: string; errors: string[] }[] = [];

    processedFiles.forEach(f => {
      const { valid, errors } = checkSyntax(f.content, f.path);
      if (!valid) {
        syntaxErrorsFound++;
        validationResults.push({ path: f.path, errors });
        console.log(`[fix-code] ⚠️ Sintaxe inválida em ${f.path}: ${errors.join(', ')}`);
      }
    });

    // Verificar integridade e GERAR arquivos faltantes automaticamente
    const integrityErrors = checkFilesIntegrity(processedFiles.map(f => ({ path: f.path, content: f.content })));

    // Extrair os arquivos faltantes
    const missingFiles: string[] = [];
    integrityErrors.forEach(ie => {
      ie.errors.forEach(err => {
        const match = err.match(/Arquivo '([^']+)' importado mas não encontrado/);
        if (match) {
          const missingPath = match[1];
          if (!missingFiles.includes(missingPath) && !processedFiles.find(f => f.path === missingPath)) {
            missingFiles.push(missingPath);
          }
        }
      });
    });

    // Gerar stubs para arquivos faltantes
    if (missingFiles.length > 0) {
      console.log(`[fix-code] 🔧 Gerando ${missingFiles.length} arquivos faltantes automaticamente...`);

      for (const missingPath of missingFiles) {
        const stub = generateMissingFileStub(missingPath);
        processedFiles.push({
          path: missingPath,
          content: stub,
          language: missingPath.endsWith('.tsx') || missingPath.endsWith('.jsx') ? 'tsx' : 'typescript'
        });
        console.log(`[fix-code] ✅ Gerado stub para: ${missingPath}`);
      }
    }

    // Erros de integridade restantes (arquivos que ainda faltam após gerar stubs)
    // Não conta como erro se já geramos os stubs - só conta se houver outros erros de integridade
    const remainingIntegrityErrors = integrityErrors.filter(ie =>
      !ie.errors.every(err => {
        const match = err.match(/Arquivo '([^']+)' importado mas não encontrado/);
        return match && missingFiles.includes(match[1]);
      })
    );

    if (remainingIntegrityErrors.length > 0) {
      remainingIntegrityErrors.forEach(ie => {
        syntaxErrorsFound++;
        validationResults.push(ie);
        console.log(`[fix-code] ❌ Erro de integridade pendente em ${ie.path}: ${ie.errors.join(', ')}`);
      });
    }

    console.log(`[fix-code] StrictScope: ${strict_scope} | AllowedPaths: ${allowed_paths.join(', ') || 'all'} | Intent: ${intent}`);
    console.log(`[fix-code] Auto-fix aplicado. Erros de sintaxe detectados: ${syntaxErrorsFound}, Arquivos gerados: ${missingFiles.length}`);

    // IMPORTANTE: SEMPRE chamar a IA para garantir código correto
    // Erros sutis de JSX (como o reportado pelo usuário) podem passar pelo checkSyntax simples.
    console.log(`[fix-code] 🤖 Chamando IA para validação profunda em ${processedFiles.length} arquivos...`);
    
    const postAutoFixValidation: { path: string; errors: string[] }[] = [];
    processedFiles.forEach(f => {
      const { valid, errors } = checkSyntax(f.content, f.path);
      if (!valid) {
        postAutoFixValidation.push({ path: f.path, errors });
        console.log(`[fix-code] ⚠️ Erro de sintaxe detectado: ${f.path}: ${errors.join(', ')}`);
      }
    });

    // Se houver erros de integridade ou sintaxe, ou se for solicitado, chamamos a IA.
    // Na verdade, agora SEMPRE chamamos a IA para garantir a qualidade.


    // Se chegou aqui, AINDA há erros - DEVE chamar a IA
    console.log(`[fix-code] ⚠️ Ainda há ${postAutoFixValidation.length} arquivo(s) com erro. Chamando IA para correção...`);

    const filesToProcess = processedFiles;
    const filesContent = filesToProcess.map(f =>
      `--- ARQUIVO: ${f.path} ---\n\`\`\`${f.language}\n${f.content}\n\`\`\``
    ).join('\n\n');

    let userMessage = `Analise e corrija estes arquivos. Retorne o JSON com o código COMPLETO corrigido.\n\n${filesContent}`;

    // Adicionar erros de sintaxe detectados para a IA saber exatamente o que corrigir
    if (postAutoFixValidation.length > 0) {
      userMessage += `\n\n🚨 ERROS DE SINTAXE DETECTADOS (PRIORIDADE MÁXIMA):\n${postAutoFixValidation.map(e => `- ${e.path}: ${e.errors.join(', ')}`).join('\n')}\nIMPORTANTE: Esses erros DEVEM ser corrigidos. Verifique declarações de função truncadas, aspas não fechadas, e className mal formados.`;
    }

    if (integrityErrors.length > 0) {
      userMessage += `\n\nERROS DE INTEGRIDADE DETECTADOS (Imports faltando):\n${integrityErrors.map(e => `- ${e.path}: ${e.errors.join(', ')}`).join('\n')}\nIMPORTANTE: Tente corrigir os imports ou criar os arquivos se o conteúdo for óbvio.`;
    }

    console.log(`[fix-code] Enviando ${filesToProcess.length} arquivos para correção via IA (streaming)`);

    const response = await fetch(`${OPENROUTER_API_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openrouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': Deno.env.get('SITE_URL') || '',
        'X-Title': 'AI App Builder - Code Fixer',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: FIX_PROMPT },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
        max_tokens: 16000,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let cleanError = errorText;
      try {
        const errorJson = JSON.parse(errorText);
        cleanError = errorJson.error?.message || errorJson.message || errorText;
      } catch (_e) {
        // keep as text
      }

      return new Response(JSON.stringify({
        files: files.map(f => ({ ...f, wasFixed: false, fixes: [] })),
        error: `Provider Error: ${cleanError}`,
        integrityErrors: integrityErrors.map(e => `${e.path}: ${e.errors.join(', ')}`)
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response stream');
    }

    const decoder = new TextDecoder();
    let fullContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              fullContent += delta;
            }
          } catch (_e) {
            // Skip invalid JSON chunks
          }
        }
      }
    }

    const aiResponse = fullContent.replace(/```json\n?|```/g, '').trim();

    const sanitizedResponse = sanitizeJsonResponse(aiResponse);

      console.log(`[fix-code] 📝 Resposta RAW da IA (${aiResponse.length} chars):`, aiResponse.substring(0, 500) + '...');

      let parsedResult: { files: FixedFile[] };
      try {
        parsedResult = JSON.parse(sanitizedResponse) as { files: FixedFile[] };
      } catch (e) {
        console.warn('[fix-code] ⚠️ Falha ao fazer parse do JSON principal. Tentando extrair regex...', e);
        try {
          const filesMatch = sanitizedResponse.match(/"files"\s*:\s*\[[\s\S]*\]/);
          if (filesMatch) {
            const fixedJson = `{${filesMatch[0]}}`;
            parsedResult = JSON.parse(fixedJson) as { files: FixedFile[] };
          } else {
            throw new Error('Could not extract files array');
          }
        } catch (e2) {
          console.error('[fix-code] ❌ FALHA CRÍTICA no parse do JSON da IA:', e2);
          parsedResult = { files: [] };
        }
      }
  
      let aiFiles = parsedResult.files || [];
      if (strict_scope && allowed_paths.length > 0) {
        aiFiles = aiFiles.filter(f => allowed_paths.includes(f.path));
      }
  
      const fixedFiles: FixedFile[] = [];
      for (const f of files) {
        const fixed = aiFiles.find(rf => rf.path === f.path);
        if (fixed && fixed.content && fixed.content.trim() !== f.content.trim()) {
          fixedFiles.push({
            path: f.path,
            content: fixed.content,
            language: f.language,
            wasFixed: true,
            fixes: fixed.fixes || ['Correção aplicada']
          });
        } else {
          fixedFiles.push({
            path: f.path,
            content: f.content,
            language: f.language,
            wasFixed: false,
            fixes: []
          });
        }
      }
  
      const executionTime = Date.now() - startTime;
      console.log(`[fix-code] ✅ Processamento concluído em ${executionTime}ms`);

      // Log de métrica para sucesso
      try {
        await logAgentEvent({
          agent_type: 'fix-code',
          status_code: 200,
          execution_time_ms: executionTime,
          files_count: filesCount,
          request_summary: `IA processou ${filesToProcess.length} arquivos. ${fixedFiles.filter(f => f.wasFixed).length} corrigidos.`
        });
      } catch (logErr) {
        console.warn('[fix-code] Erro ao logar métricas de sucesso:', logErr);
      }

      return new Response(JSON.stringify({
        files: fixedFiles,
        integrityErrors: integrityErrors.map(e => `${e.path}: ${e.errors.join(', ')}`),
        syntaxErrorsFound: syntaxErrorsFound + postAutoFixValidation.length,
        executionTimeMs: executionTime
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

  } catch (error) {
    console.error('[fix-code] Error:', error);

    // Usar taxonomia de erros para logging padronizado
    const logEntry = errorToLogEntry('fix-code', error, 'UNKNOWN_ERROR', {
      execution_time_ms: Date.now() - startTime,
      files_count: filesCount,
    });

    await logAgentEvent(logEntry);

    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error',
      errorCode: logEntry.error_code
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
