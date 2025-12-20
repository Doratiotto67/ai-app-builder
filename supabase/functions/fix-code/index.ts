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

const FIX_PROMPT = `Você é um COMPILADOR e LINTER de elite para React/TypeScript/Vite.

Sua missão: RECEBER Código -> IDENTIFICAR Erros -> RETORNAR Código Perfeito.

## 🔎 O QUE VOCÊ DEVE CORRIGIR (PRIORIDADE MÁXIMA):

1. **Sintaxe Fatal (Syntax Errors):**
   - Fechamento incorreto de tags JSX, chaves {} ou parênteses ().
   - Regex malformada (ex: \`onChange={e => / >\` -> o parser quebra).
   - "Expression expected", "Unexpected token".

2. **Imports e Referências (Reference Errors):**
   - Imports de arquivos que não existem no contexto padrão (ex: imports relativos perdidos).
   - **IMPORTANTE:** Se você ver \`import { X } from './X'\` mas o usuário não enviou o arquivo X, tente deduzir ou comente o import se for quebrar o build.
   - Remova imports não utilizados (Tree Shaking manual).
   - Converta imports de Next.js (\`next/image\`, \`next/link\`) para padrão Vite (\`img\`, \`react-router-dom\`).

3. **Incompletude (Truncated Code):**
   - **CRÍTICO:** Se o código parecer cortado no meio (ex: termina sem fechar a função), VOCÊ DEVE COMPLETÁ-LO da melhor forma possível seguindo a lógica.

4. **WebContainer/Vite Compatibility:**
   - \`use client\` -> REMOVA (não é necessário em Vite CSR puro).
   - \`<img>\` vs \`<Image>\` -> Use \`<img>\` padrão ou crie um wrapper simples se não houver definição.

## 🚫 O QUE NÃO FAZER:
- NÃO mude a lógica de negócio (ex: mudar cores, textos).
- NÃO adicione comentários explicativos no código ("// Corrigi isso"). O código deve ser limpo.
- NÃO invente bibliotecas que não existem.

## ⚠️ FORMATO DE RESPOSTA (JSON PURO):

\`\`\`json
{
  "files": [
    {
      "path": "src/App.tsx",
      "content": "CONTEÚDO DO ARQUIVO COMPLETO (NÃO TRUNQUE NADA!)",
      "wasFixed": true,
      "fixes": ["Fechou tag div na linha 40", "Removeu import 'next/image'"]
    }
  ]
}
\`\`\`
`;

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

    const userMessage = `Analise e corrija estes arquivos. Retorne o JSON com o código COMPLETO corrigido.\n\n${filesContent}`;

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
        model: 'qwen/qwen-2.5-coder-32b-instruct', // Modelo Qwen Coder (SOTA) solicitado
        messages: [
          { role: 'system', content: FIX_PROMPT },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
        max_tokens: 20000, // Garantir resposta longa para arquivos grandes
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[fix-code] OpenRouter error:', errorText);

      let cleanError = errorText;
      try {
        const jsonError = JSON.parse(errorText);
        cleanError = jsonError.error?.message || errorText;

        // Handle specific Privacy Policy error
        if (cleanError.includes('data policy')) {
          cleanError = `OpenRouter Privacy Block: Go to https://openrouter.ai/settings/privacy and enable "Allow models to train on my data" to use this model (Qwen).`;
        }
      } catch (e) {
        // ignore json parse error
      }

      return new Response(JSON.stringify({
        files: files.map(f => ({ ...f, wasFixed: false, fixes: [] })),
        error: `Provider Error: ${cleanError}`
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    let aiResponse = data.choices?.[0]?.message?.content || '{}';
    aiResponse = aiResponse.replace(/```json\n?|```/g, '').trim();

    console.log(`[fix-code] Resposta recebida (${aiResponse.length} chars)`);

    let result;
    try {
      result = JSON.parse(aiResponse) as { files: FixedFile[] };
    } catch (e) {
      console.error('[fix-code] JSON Error:', e);
      return new Response(JSON.stringify({
        files: files.map(f => ({ ...f, wasFixed: false, fixes: [] })),
        error: 'Failed to parse AI response' // Fail gracefully
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Merge e verificação de mudanças reais
    const fixedFiles: FixedFile[] = [];

    for (const f of files) {
      const fixed = result.files?.find(rf => rf.path === f.path);

      if (fixed && fixed.content) {
        // Verifica se houve mudança real removendo espaços em branco para evitar falsos positivos
        const originalClean = f.content.replace(/\s+/g, '');
        const newClean = fixed.content.replace(/\s+/g, '');
        const hasChanges = originalClean !== newClean;

        fixedFiles.push({
          path: f.path,
          content: fixed.content,
          language: f.language,
          wasFixed: hasChanges, // Sobrescreve a "alucinação" da IA se não houver mudança real
          fixes: hasChanges ? (fixed.fixes || ['Correção de sintaxe']) : [],
        });
      } else {
        fixedFiles.push({ ...f, wasFixed: false, fixes: [] });
      }
    }

    // Logging útil
    const changedCount = fixedFiles.filter(f => f.wasFixed).length;
    console.log(`[fix-code] ${changedCount} arquivos realmente alterados.`);

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
