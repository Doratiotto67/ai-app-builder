import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const { projectId, description, context, stream = true } = await req.json();

    if (!projectId || !description) {
      return new Response(JSON.stringify({ error: 'projectId and description are required' }), {
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

    // Advanced PRD Promptsmith System Prompt
    const systemPrompt = `Você é o "Agente Otimizador de Prompt (PRD Promptsmith)".
Sua missão: transformar qualquer pedido do usuário em um PRD completo e profissional.

## REGRAS DE OURO
- Sempre responda em pt-BR.
- Nunca contradiça o pedido do usuário.
- Não faça perguntas - crie assunções explícitas e "Perguntas em aberto" no final.
- Entregue "algo a mais": riscos, métricas, critérios de aceite, testes, acessibilidade, SEO, performance.

## FORMATO OBRIGATÓRIO DO PRD

# [Nome do Projeto]

## 1. Visão Geral
- Contexto e problema
- Objetivo (resultado mensurável)
- Público/Personas

## 2. Escopo
- Must-have (priorizado)
- Nice-to-have
- Fora de escopo

## 3. Requisitos Funcionais
- Lista com IDs (RF-01, RF-02) + prioridade (P0/P1/P2)
- User stories (Como <persona>, quero <ação>, para <benefício>)

## 4. Requisitos Não-Funcionais
- Performance, segurança, acessibilidade, SEO

## 5. UX/UI
- Mapa de páginas/rotas
- Estrutura por página (seções, componentes)
- Diretrizes de copy e CTAs

## 6. Arquitetura (alto nível)
- Visão de módulos (frontend, backend)
- Stack sugerida com justificativa
- Modelo de dados principais

## 7. Analytics e Métricas
- Eventos (nome, quando dispara)
- KPIs e funil

## 8. Plano de Testes
- Critérios de aceite por requisito P0
- Casos de teste essenciais

## 9. Riscos e Perguntas em Aberto
- Riscos técnicos e de produto
- Perguntas para validação futura

## 10. Entregáveis
- Lista objetiva do que será entregue

Seja específico: números, exemplos, nomes de eventos, rotas, estados de UI.
Use linguagem objetiva, sem floreios.`;

    const userMessage = context
      ? `Descrição do produto: ${description}\n\nContexto adicional: ${context}`
      : `Descrição do produto: ${description}`;

    // STREAMING MODE
    if (stream) {
      const response = await fetch(`${OPENROUTER_API_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openrouterApiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://app-builder-supabase.vercel.app',
          'X-Title': 'AI App Builder - PRD Generator',
        },
        body: JSON.stringify({
          model: 'deepseek/deepseek-v3.2',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          temperature: 0.2,
          top_p: 0.9,
          max_tokens: 8192,
          stream: true,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        return new Response(JSON.stringify({ error: `PRD generation error: ${error}` }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Create streaming response
      const encoder = new TextEncoder();
      let fullContent = '';

      const streamResponse = new ReadableStream({
        async start(controller) {
          const reader = response.body!.getReader();
          const decoder = new TextDecoder();

          // Send status update
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'status_update', data: { phase: 'generating_prd' } })}\n\n`));

          try {
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
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'message_delta', data: { text: delta } })}\n\n`));
                    }
                  } catch {
                    // Skip invalid JSON
                  }
                }
              }
            }

            // Save PRD to database
            const { data: existingDoc } = await supabase
              .from('project_docs')
              .select('version')
              .eq('project_id', projectId)
              .eq('doc_type', 'prd')
              .order('version', { ascending: false })
              .limit(1)
              .maybeSingle();

            const version = (existingDoc?.version || 0) + 1;

            await supabase
              .from('project_docs')
              .insert({
                project_id: projectId,
                doc_type: 'prd',
                version,
                content_md: fullContent,
                created_by: user.id,
              });

            // Send done event
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done', data: { ok: true, prd: fullContent } })}\n\n`));
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          } catch (err) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', data: { message: String(err) } })}\n\n`));
          } finally {
            controller.close();
          }
        },
      });

      return new Response(streamResponse, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // NON-STREAMING MODE (fallback)
    const response = await fetch(`${OPENROUTER_API_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openrouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://app-builder-supabase.vercel.app',
        'X-Title': 'AI App Builder - PRD Generator',
      },
      body: JSON.stringify({
        model: 'deepseek/deepseek-v3.2',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.2,
        top_p: 0.9,
        max_tokens: 8192,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return new Response(JSON.stringify({ error: `PRD generation error: ${error}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const prdContent = data.choices?.[0]?.message?.content || '';

    // Get current version
    const { data: existingDoc } = await supabase
      .from('project_docs')
      .select('version')
      .eq('project_id', projectId)
      .eq('doc_type', 'prd')
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    const version = (existingDoc?.version || 0) + 1;

    // Save PRD
    const { data: savedDoc, error } = await supabase
      .from('project_docs')
      .insert({
        project_id: projectId,
        doc_type: 'prd',
        version,
        content_md: prdContent,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;

    return new Response(JSON.stringify({ prd: savedDoc }), {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Generate PRD error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
