import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('Missing Authorization header');
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Validate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(JSON.stringify({ error: 'Unauthorized', details: authError?.message }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { projectId, message, threadId, images } = await req.json();

    if (!message) {
      return new Response(JSON.stringify({ error: 'Message is required' }), {
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

    // 1. Buscar arquivos existentes do projeto
    const { data: existingFiles } = await supabase
      .from('project_files')
      .select('path, content')
      .eq('project_id', projectId);

    const filePaths = existingFiles?.map(f => f.path) || [];
    const appTsxContent = existingFiles?.find(f => f.path.includes('src/App.tsx') || f.path.includes('src/App.jsx'))?.content;
    const isNewProject = filePaths.length === 0;

    console.log(`[ChatStream] ProjectID: ${projectId} | Files: ${filePaths.length} | IsNew: ${isNewProject}`);

    // Contexto do projeto para o LLM
    const projectContext = `
## 📂 CONTEXTO DO PROJETO ATUAL

Arquivos existentes (${filePaths.length}):
${filePaths.slice(0, 50).map(p => `- ${p}`).join('\n')}
${filePaths.length > 50 ? `... e mais ${filePaths.length - 50} arquivos` : ''}

${appTsxContent ? `
### Conteúdo atual do src/App.tsx (PARA REFERÊNCIA DE ROTAS):
\`\`\`tsx
${appTsxContent}
\`\`\`
` : ''}
`;

    const systemPrompt = `# Você é um Engenheiro de Software Full-Stack Sênior (Especialista em React + Vite)

Você mantém e evolui aplicações web profissionais.

## 🧠 MODO DE OPERAÇÃO: ${isNewProject ? '🆕 PROJETO NOVO' : '🛠️ ATUALIZAÇÃO INCREMENTAL'}

${isNewProject ? `
### 🟢 MODO CRIATIVO (ZERO-TO-ONE)
- Crie toda a estrutura do zero.
- Gere todos os arquivos base (App, main, index.css).
` : `
### 🟠 MODO DE MANUTENÇÃO (CRÍTICO!)
- **VOCÊ ESTÁ EDITANDO UM PROJETO EXISTENTE COM ${filePaths.length} ARQUIVOS!**
- **REGRA DE OURO:** Use os arquivos existentes! Não crie duplicatas.
  - Se o usuário pedir "melhore o card", EDITE O ARQUIVO DO CARD EXISTENTE.
  - NÃO crie \`NewCard.tsx\` ou \`CardV2.tsx\`.
- **PRESERVE O App.tsx:**
  - Mantenha TOADS as rotas existentes.
  - Apenas ADICIONE novas rotas ou imports.
  - NUNCA remova rotas funcionais.
`}

## 🚦 ANÁLISE ANTES DE CODAR
1. **Identifique o objetivo**: É um fix? Nova feature? Refatoração?
2. **Busque arquivos relacionados**: 
   - Olhe a lista de arquivos.
   - Se o usuário quer mudar o "hero", verifique se já existe \`src/components/features/Hero.tsx\`.
3. **Decida a ação**:
   - [EDITAR] se o arquivo existe.
   - [CRIAR] apenas se for uma entidade totalmente nova.

## ⚠️ PREVENÇÃO DE "TELA BRANCA" (CRASH)
- **Exports:** Garanta que todo componente tenha \`export default\` se for importado assim.
- **Imports:** Verifique se o caminho do import bate com a estrutura de pastas.
- **App.tsx:** Se você regenerar o App.tsx, ele deve conter **TODAS** as rotas anteriores + as novas.

## � PLANO DE EXECUÇÃO
Liste os arquivos que você vai tocar:
- [CRIAR] src/pages/NovaPagina.tsx (Nova funcionalidade)
- [EDITAR] src/App.tsx (Adicionar rota)
- [EDITAR] src/components/ui/Button.tsx (Ajustar cor)

## 📁 ARQUITETURA (Somente se criar novos)
\`\`\`
src/
├── components/
│   ├── ui/           # Primitivos (Button, Input)
│   ├── layout/       # Estrutura (Header, Sidebar)
│   └── features/     # Negócio (ProductCard, DashboardChart)
└── pages/            # Rotas
\`\`\`

## 📝 FORMATO DE CÓDIGO
Use o caminho completo na primeira linha:

\`\`\`tsx
// src/components/ExistingComponent.tsx
import ...
\`\`\`

## 🎨 ESTILO (Tailwind)
- Mantenha a consistência visual.
- Use \`lucide-react\` para ícones.

## ❌ PROIBIDO
- **NÃO crie novos projetos do zero** se já existirem arquivos.
- NÃO use placeholders.
- NÃO quebre a navegação existente.
- NÃO apague imports necessários no App.tsx.

## 🇧🇷 IDIOMA
Português do Brasil`;


    // Build user message content - supports text + images for vision models
    type MessageContent = string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;
    const userContentText = message;
    
    // Inject project context into user message
    const finalUserMessageText = `${userContentText}\n\n${projectContext}`;

    let userMessageContent: MessageContent = finalUserMessageText;

    // If images are provided, format as multimodal content
    if (images && Array.isArray(images) && images.length > 0) {
      const contentParts: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [];

      // Add images first
      for (const img of images) {
        if (typeof img === 'string' && img.startsWith('data:image')) {
          contentParts.push({
            type: 'image_url',
            image_url: { url: img },
          });
        }
      }

      // Add text message with context
      contentParts.push({ type: 'text', text: finalUserMessageText });
      userMessageContent = contentParts;
    }

    // Call OpenRouter API with streaming
    const openrouterResponse = await fetch(`${OPENROUTER_API_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openrouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': Deno.env.get('SITE_URL') || '',
        'X-Title': 'AI App Builder',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessageContent },
        ],
        stream: true,
        temperature: 0.7,
        max_tokens: 10000,
      }),
    });

    if (!openrouterResponse.ok) {
      const error = await openrouterResponse.text();
      return new Response(JSON.stringify({ error: `OpenRouter error: ${error}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Stream the response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: event, data })}\n\n`)
          );
        };

        try {
          send('status_update', { phase: 'thinking' });

          const reader = openrouterResponse.body?.getReader();
          if (!reader) throw new Error('No response body');

          const decoder = new TextDecoder();
          let buffer = '';
          let fullContent = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6).trim();
                if (data === '[DONE]') continue;
                try {
                  const chunk = JSON.parse(data);
                  const delta = chunk.choices?.[0]?.delta?.content;
                  if (delta) {
                    fullContent += delta;
                    send('message_delta', { text: delta });
                  }
                } catch {
                  // Skip invalid JSON
                }
              }
            }
          }

          // Save message to database
          if (projectId && threadId) {
            await supabase.from('chat_messages').insert([
              {
                project_id: projectId,
                thread_id: threadId,
                role: 'user',
                content: message,
                created_by: user.id,
              },
              {
                project_id: projectId,
                thread_id: threadId,
                role: 'assistant',
                content: fullContent,
              },
            ]);
          }

          send('done', { ok: true });
        } catch (error) {
          console.error('Stream error:', error);
          send('error', {
            message: error instanceof Error ? error.message : 'Unknown error',
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Chat stream error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
