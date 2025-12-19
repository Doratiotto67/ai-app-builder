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

    const { projectId, description, context } = await req.json();

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

    const systemPrompt = `Você é um arquiteto de software e gerente de produto experiente.
Sua tarefa é gerar um PRD (Product Requirements Document) detalhado em Markdown com base na descrição e contexto fornecidos.
O PRD deve incluir:
1. Visão Geral (Objetivo, Problema que resolve)
2. Personas (Quem é o usuário?)
3. Requisitos Funcionais (Lista detalhada de funcionalidades)
4. Requisitos Não Funcionais (Performance, Segurança, etc.)
5. Fluxo do Usuário
6. Roadmap sugerido (Fase 1, 2, 3)

Responda apenas com o conteúdo Markdown.`;

    const response = await fetch(`${OPENROUTER_API_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openrouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://app-builder-supabase.vercel.app',
        'X-Title': 'AI App Builder',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-exp', // Consistent model usage
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: context
              ? `Descrição do produto: ${description}\n\nContexto adicional: ${context}`
              : `Descrição do produto: ${description}`,
          },
        ],
        temperature: 0.8,
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

