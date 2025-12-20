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

const FIX_PROMPT = `Você é um especialista em corrigir erros de sintaxe em código React/TypeScript/Vite.

Sua ÚNICA tarefa é analisar os arquivos fornecidos e CORRIGIR erros de sintaxe FATAIS que impedem a compilação.

## 🚨 ERROS CRÍTICOS PARA CORRIGIR:

1. **REGEX NÃO TERMINADA / JSX QUEBRADO**:
   - Erro comum: \`onChange={e => / >\` (o parser acha que é regex)
   - Correção: \`onChange={e => ...}\` (fechar corretamente a expressão)
   - Verifique se tags JSX, chaves {} e parênteses () estão balanceados.

2. **IMPORTS**:
   - Remova imports vazios ou quebrados.
   - Remova linhas órfãs que não são código válido.
   - Consolide imports do mesmo pacote.

3. **CLEANUP GERAL**:
   - Remova \`use client\`.
   - Converta \`<Link>\` para \`<a>\` (Vite).
   - Remova referências a Next.js (\`next/image\`, \`next/link\`).

## ⚠️ FORMATO DE RESPOSTA OBRIGATÓRIO (JSON):

Você DEVE retornar APENAS um JSON válido seguindo estritamente este schema:

\`\`\`json
{
  "files": [
    {
      "path": "caminho/do/arquivo.tsx",
      "content": "CONTEÚDO COMPLETO E CORRIGIDO AQUI",
      "wasFixed": true,
      "fixes": ["Descrição da correção 1", "Descrição da correção 2"]
    }
  ]
}
\`\`\`

REGRAS:
- Retorne o código **COMPLETO** no campo "content". NÃO trunque.
- Se o arquivo não tiver erros, retorne "wasFixed": false e o conteúdo original.
- O campo "fixes" deve listar o que foi alterado.
- NÃO ADICIONE TEXTO ANTES OU DEPOIS DO JSON. Apenas o JSON puro.`;

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

    const filesContent = files.map(f => 
      `--- ARQUIVO: ${f.path} ---\n\`\`\`${f.language}\n${f.content}\n\`\`\``
    ).join('\n\n');

    const userMessage = `Por favor, analise e corrija os seguintes arquivos se houver erros de sintaxe:\n\n${filesContent}`;

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
        model: 'google/gemini-3-flash-preview', // Modelo solicitado pelo usuário
        messages: [
          { role: 'system', content: FIX_PROMPT },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' }, // Forçar JSON se suportado
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[fix-code] OpenRouter error:', error);
      return new Response(JSON.stringify({ 
        files: files.map(f => ({ ...f, wasFixed: false, fixes: [] })),
        error: `OpenRouter error: ${error}`
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    let aiResponse = data.choices?.[0]?.message?.content || '{}';
    
    // Limpeza caso venha com markdown ```json ... ```
    aiResponse = aiResponse.replace(/```json\n?|```/g, '').trim();

    console.log(`[fix-code] Resposta processada (${aiResponse.length} chars)`);

    const result = JSON.parse(aiResponse) as { files: FixedFile[] };
    try {
      // Validar se result.files existe
      if (!result || !Array.isArray(result.files)) {
        throw new Error('Invalid response structure');
      }
    } catch (e) {
      console.error('[fix-code] JSON Parse Error:', e);
      console.log('Raw response:', aiResponse.substring(0, 500));
      return new Response(JSON.stringify({ 
        files: files.map(f => ({ ...f, wasFixed: false, fixes: [] })),
        error: 'Failed to parse AI response'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Merge com arquivos originais para garantir language e path
    const fixedFiles: FixedFile[] = [];
    
    for (const f of files) {
      const fixed = result.files.find(rf => rf.path === f.path);
        if (fixed) {
          fixedFiles.push({
            path: f.path,
            content: fixed.content || f.content,
            language: f.language,
            wasFixed: fixed.wasFixed || false,
            fixes: fixed.fixes || [],
          });
        } else {
          fixedFiles.push({ ...f, wasFixed: false, fixes: [] });
        }
      }

    console.log(`[fix-code] Retornando ${fixedFiles.filter(f => f.wasFixed).length} arquivos corrigidos`);

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
