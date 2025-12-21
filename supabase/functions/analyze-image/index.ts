import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Tipos de análise possíveis
type AnalysisType = 'ui_design' | 'code_error' | 'code_screenshot' | 'general';

// Classificação de gravidade de erros
type ErrorCategory = 'syntax' | 'import' | 'runtime' | 'type' | 'compilation' | 'unknown';

interface AnalysisResult {
  type: AnalysisType;
  analysis: string;
  skipPrd?: boolean;  // Se true, vai direto para chat-stream ao invés de generate-prd
  requiresImmediateFix?: boolean;  // Se true, erro é crítico e precisa de correção imediata
  errorCategory?: ErrorCategory;   // Classificação do tipo de erro
  errorDetails?: {
    errorType: string;
    errorMessage: string;
    filePath?: string;
    lineNumber?: number;
    probableCause?: string;
    suggestedFix?: string;
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(
      supabaseUrl,
      supabaseAnonKey,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { imageUrl, prompt } = await req.json();

    if (!imageUrl) {
      return new Response(JSON.stringify({ error: 'imageUrl is required' }), {
        status: 400,
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

    // ============================
    // FASE 1: CLASSIFICAÇÃO DA IMAGEM
    // ============================
    const classificationPrompt = `Analise esta imagem e classifique em UMA das seguintes categorias:

1. **code_error**: A imagem mostra um ERRO de código, console de erro, stack trace, mensagem de erro do Vite/Webpack/TypeScript/JavaScript, ou terminal com erro. Exemplos:
   - Tela vermelha com erro de compilação
   - Console do navegador com erros
   - Stack trace
   - Mensagens como "Expected '>' but found...", "Module not found", "SyntaxError", etc.
   - Terminal com erros npm/node

2. **code_screenshot**: A imagem mostra código-fonte (editor de código, IDE, VS Code, etc.) MAS sem erros visíveis - apenas código normal.

3. **ui_design**: A imagem mostra um design de interface/UI (mockup, wireframe, screenshot de aplicativo, site, etc.)

4. **general**: Qualquer outra coisa que não se encaixe nas categorias acima.

Responda APENAS com um JSON no formato:
{
  "type": "code_error" | "code_screenshot" | "ui_design" | "general",
  "confidence": 0.0-1.0,
  "reason": "breve explicação"
}`;

    const classificationResponse = await fetch(`${OPENROUTER_API_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openrouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': Deno.env.get('SITE_URL') || 'https://app-builder-supabase.vercel.app',
        'X-Title': 'AI App Builder - Image Classifier',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-001',
        messages: [
          { role: 'system', content: 'Você é um classificador de imagens. Responda apenas com JSON válido.' },
          {
            role: 'user',
            content: [
              { type: 'text', text: classificationPrompt },
              { type: 'image_url', image_url: { url: imageUrl } },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 256,
      }),
    });

    if (!classificationResponse.ok) {
      console.error('[analyze-image] Erro na classificação:', await classificationResponse.text());
      // Fallback: assume ui_design se falhar
    }

    let imageType: AnalysisType = 'ui_design';
    try {
      const classificationData = await classificationResponse.json();
      const classificationText = classificationData.choices?.[0]?.message?.content || '';
      const classificationJson = JSON.parse(classificationText.replace(/```json\n?|```/g, '').trim());
      imageType = classificationJson.type || 'ui_design';
      console.log(`[analyze-image] Classificação: ${imageType} (confiança: ${classificationJson.confidence})`);
    } catch (_e) {
      console.warn('[analyze-image] Falha ao parsear classificação, usando ui_design');
    }

    // ============================
    // FASE 2: ANÁLISE ESPECÍFICA
    // ============================
    let analysisPrompt: string;
    let skipPrd = false;

    if (imageType === 'code_error') {
      // Para erros de código, extrair detalhes do erro para enviar ao chat-stream
      skipPrd = true;
      analysisPrompt = `Você é um especialista em debugging. Esta imagem mostra um ERRO de código.

Analise a imagem e extraia:
1. **Tipo do erro**: (SyntaxError, TypeError, ModuleNotFoundError, CompilationError, etc.)
2. **Mensagem de erro**: O texto exato do erro mostrado
3. **Arquivo afetado**: Se visível, qual arquivo tem o erro (ex: App.tsx, index.js)
4. **Linha do erro**: Se visível, qual linha
5. **Causa provável**: O que provavelmente causou o erro
6. **Sugestão de correção**: Como corrigir o erro

Responda em formato JSON:
{
  "errorType": "string",
  "errorMessage": "string (texto exato do erro)",
  "filePath": "string ou null",
  "lineNumber": number ou null,
  "probableCause": "string",
  "suggestedFix": "string",
  "fullContext": "descrição completa do que está acontecendo na imagem"
}`;

    } else if (imageType === 'code_screenshot') {
      // Para código sem erro, pode ser uma referência ou pedido de modificação
      analysisPrompt = `Você é um especialista em código. Esta imagem mostra código-fonte.

Analise a imagem e extraia:
1. Linguagem de programação
2. Frameworks/bibliotecas visíveis
3. Estrutura do código
4. O que o código faz
5. Padrões de código utilizados

Responda de forma estruturada descrevendo o código para que outro desenvolvedor possa entender o contexto.`;

    } else {
      // UI Design - prompt original com melhorias
      analysisPrompt = `Você é um especialista em UI/UX e extração de design.
Analise a imagem fornecida e extraia:
1. Layout geral e estrutura de componentes
2. Paleta de cores (em formato hexadecimal)
3. Tipografia e tamanhos de fonte
4. Espaçamentos e margens
5. Componentes identificados (botões, cards, forms, etc.)
6. Sugestões de implementação em React/Tailwind

Responda em formato JSON estruturado.`;
    }

    const response = await fetch(`${OPENROUTER_API_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openrouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': Deno.env.get('SITE_URL') || 'https://app-builder-supabase.vercel.app',
        'X-Title': 'AI App Builder',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-001',
        messages: [
          { role: 'system', content: analysisPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt || 'Analise esta imagem.' },
              { type: 'image_url', image_url: { url: imageUrl } },
            ],
          },
        ],
        temperature: 0.5,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return new Response(JSON.stringify({ error: `Vision API error: ${error}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const analysisText = data.choices?.[0]?.message?.content || '';

    // Construir resposta com metadados
    const result: AnalysisResult = {
      type: imageType,
      analysis: analysisText,
      skipPrd: skipPrd,
    };

    // Se for erro de código, tentar extrair detalhes estruturados
    if (imageType === 'code_error') {
      try {
        const errorDetails = JSON.parse(analysisText.replace(/```json\n?|```/g, '').trim());
        
        // Classificar categoria do erro
        const errorType = (errorDetails.errorType || '').toLowerCase();
        let errorCategory: ErrorCategory = 'unknown';
        if (errorType.includes('syntax') || errorType.includes('parse')) {
          errorCategory = 'syntax';
        } else if (errorType.includes('import') || errorType.includes('module') || errorType.includes('not found')) {
          errorCategory = 'import';
        } else if (errorType.includes('type') || errorType.includes('ts')) {
          errorCategory = 'type';
        } else if (errorType.includes('compile') || errorType.includes('build')) {
          errorCategory = 'compilation';
        } else if (errorType.includes('runtime') || errorType.includes('uncaught')) {
          errorCategory = 'runtime';
        }
        
        result.errorDetails = {
          errorType: errorDetails.errorType || 'Unknown',
          errorMessage: errorDetails.errorMessage || analysisText,
          filePath: errorDetails.filePath,
          lineNumber: errorDetails.lineNumber,
          probableCause: errorDetails.probableCause,
          suggestedFix: errorDetails.suggestedFix,
        };
        
        // Determinar se precisa de correção imediata (erros críticos)
        result.requiresImmediateFix = ['syntax', 'import', 'compilation'].includes(errorCategory);
        result.errorCategory = errorCategory;
        
        // Formatar mensagem amigável para o chat
        result.analysis = `🚨 **Erro detectado na imagem**

**Tipo:** ${errorDetails.errorType}
**Categoria:** ${errorCategory.toUpperCase()}
**Arquivo:** ${errorDetails.filePath || 'Não identificado'}
**Linha:** ${errorDetails.lineNumber || 'N/A'}

**Mensagem:**
\`\`\`
${errorDetails.errorMessage}
\`\`\`

**Causa provável:** ${errorDetails.probableCause}

**Sugestão de correção:** ${errorDetails.suggestedFix}

---
⚡ **Ação recomendada:** Este erro será enviado automaticamente para o agente de correção (fix-code).`;

      } catch (_e) {
        // Se falhar o parse, usar a análise como está
        result.requiresImmediateFix = true;
        result.errorCategory = 'unknown';
        result.analysis = `🚨 **Erro detectado na imagem**

${analysisText}

---
*Use o botão de varinha (Fix Code) para corrigir automaticamente.*`;
      }
    }

    console.log(`[analyze-image] Tipo: ${result.type}, SkipPrd: ${result.skipPrd}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Analyze image error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

/**
 * Classifica categoria de erro baseado no tipo
 */
function classifyErrorCategory(errorType: string): ErrorCategory {
  if (!errorType) return 'unknown';
  
  const type = errorType.toLowerCase();
  
  if (type.includes('syntax') || type.includes('parse') || type.includes('expected')) {
    return 'syntax';
  }
  if (type.includes('import') || type.includes('module') || type.includes('not found') || type.includes('cannot find')) {
    return 'import';
  }
  if (type.includes('type') || type.includes('ts') || type.includes('property')) {
    return 'type';
  }
  if (type.includes('compile') || type.includes('build') || type.includes('transpile')) {
    return 'compilation';
  }
  if (type.includes('runtime') || type.includes('uncaught') || type.includes('reference')) {
    return 'runtime';
  }
  
  return 'unknown';
}
