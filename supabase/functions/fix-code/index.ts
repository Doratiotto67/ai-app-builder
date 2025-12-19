import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1';

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

const FIX_PROMPT = `Você é um agente de correção de código especializado em React/TypeScript/JSX.

Sua tarefa é CORRIGIR erros de sintaxe no código fornecido. 

## REGRAS DE CORREÇÃO:

1. **Parênteses, chaves e colchetes**: Garantir que todos estão balanceados e fechados corretamente
2. **JSX**: Garantir que todas as tags estão fechadas corretamente
3. **Imports**: Garantir que a sintaxe de import está correta
4. **Export**: Garantir que há um export default válido
5. **Vírgulas e ponto-e-vírgulas**: Corrigir posicionamento incorreto
6. **Strings template**: Garantir que backticks estão fechados
7. **Objetos e arrays**: Garantir estrutura correta

## FORMATO DE RESPOSTA:

Para CADA arquivo, responda EXATAMENTE neste formato:

---FILE_START---
path: <caminho do arquivo>
---CONTENT_START---
<código completo corrigido>
---CONTENT_END---
fixes: <lista de correções aplicadas, separadas por |>
---FILE_END---

## IMPORTANTE:
- Retorne o código COMPLETO, não apenas as partes modificadas
- Se o código já estiver correto, retorne-o sem alterações
- NÃO adicione comentários explicativos no código
- Mantenha a formatação e indentação originais quando possível
- Se houver código claramente truncado ou incompleto, tente completá-lo de forma lógica`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { files } = await req.json() as { files: FileToFix[] };

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

    // Preparar o prompt com todos os arquivos
    const filesContent = files.map(f => 
      `### Arquivo: ${f.path}\n\`\`\`${f.language}\n${f.content}\n\`\`\``
    ).join('\n\n');

    const userMessage = `Corrija os seguintes arquivos:\n\n${filesContent}`;

    console.log(`[fix-code] Enviando ${files.length} arquivos para correção`);

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
        temperature: 0.2, // Baixa temperatura para correções precisas
        max_tokens: 32000, // Alto limite para arquivos grandes
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[fix-code] OpenRouter error:', error);
      // Se falhar, retornar arquivos originais
      return new Response(JSON.stringify({ 
        files: files.map(f => ({ ...f, wasFixed: false, fixes: [] })),
        error: `OpenRouter error: ${error}`
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content || '';
    
    console.log(`[fix-code] Resposta recebida: ${aiResponse.length} caracteres`);

    // Parsear a resposta
    const fixedFiles: FixedFile[] = [];
    const fileBlocks = aiResponse.split('---FILE_START---').filter((b: string) => b.trim());

    for (const block of fileBlocks) {
      const pathMatch = block.match(/path:\s*(.+?)(?:\n|---)/);
      const contentMatch = block.match(/---CONTENT_START---\n([\s\S]*?)---CONTENT_END---/);
      const fixesMatch = block.match(/fixes:\s*(.+?)(?:\n|---FILE_END---|$)/);

      if (pathMatch && contentMatch) {
        const path = pathMatch[1].trim();
        const content = contentMatch[1].trim();
        const fixes = fixesMatch ? fixesMatch[1].split('|').map((f: string) => f.trim()).filter((f: string) => f) : [];

        // Encontrar o arquivo original para pegar o language
        const originalFile = files.find(f => f.path === path);
        
        fixedFiles.push({
          path,
          content,
          language: originalFile?.language || 'tsx',
          wasFixed: fixes.length > 0,
          fixes,
        });

        console.log(`[fix-code] Arquivo ${path}: ${fixes.length} correções`);
      }
    }

    // Se o parsing falhou, tentar retornar os arquivos originais
    if (fixedFiles.length === 0) {
      console.warn('[fix-code] Parsing falhou, retornando arquivos originais');
      return new Response(JSON.stringify({ 
        files: files.map(f => ({ ...f, wasFixed: false, fixes: [] })),
        warning: 'Parsing failed, returning original files'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Adicionar arquivos que não foram processados
    for (const originalFile of files) {
      if (!fixedFiles.find(f => f.path === originalFile.path)) {
        fixedFiles.push({
          ...originalFile,
          wasFixed: false,
          fixes: [],
        });
      }
    }

    console.log(`[fix-code] Retornando ${fixedFiles.length} arquivos corrigidos`);

    return new Response(JSON.stringify({ files: fixedFiles }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[fix-code] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
