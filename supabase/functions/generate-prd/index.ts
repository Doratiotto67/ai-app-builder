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

    // 🧠 PRD Architect - Agente Avançado de Análise e Planejamento
    const systemPrompt = `Você é o "PRD Architect" - um agente avançado de análise e planejamento de projetos.

## 🎯 SUA MISSÃO
1. ANALISAR o contexto do pedido do usuário
2. CLASSIFICAR a complexidade do projeto (SIMPLE/BASIC/INTERMEDIATE/ADVANCED)
3. GERAR um PRD completo e profissional
4. RETORNAR metadados estruturados no final (OBRIGATÓRIO)

---

## 📊 PASSO 1: ANÁLISE DE CONTEXTO

Antes de qualquer coisa, analise o pedido e classifique:

### Tabela de Classificação:

| Nível | Palavras-chave | Arquivos | Estrutura |
|-------|----------------|----------|-----------|
| SIMPLE | "landing simples", "página única", "one-page", "cartão de visita" | 1-3 | App.tsx apenas |
| BASIC | "site", "portfólio", "algumas páginas", "blog simples" | 4-10 | components/ + pages/ |
| INTERMEDIATE | "dashboard", "sistema", "admin", "painel", "formulários" | 10-25 | + hooks/ + contexts/ + lib/ |
| ADVANCED | "e-commerce", "marketplace", "SaaS", "autenticação", "pagamento" | 25+ | Estrutura completa |

### Indicadores de Complexidade:
- **Autenticação/Login** → +1 nível
- **Pagamento/Checkout** → +1 nível
- **Múltiplos estados globais** → +1 nível
- **API externa** → +1 nível
- **"simples"/"básico"** → -1 nível

---

## 📝 PASSO 2: GERAR PRD COMPLETO

Use EXATAMENTE este formato (10 seções + metadados):

# [Nome do Projeto]

## 1. Visão Geral
- **Contexto:** [Breve descrição do problema ou oportunidade]
- **Objetivo:** [Resultado mensurável esperado]
- **Público-alvo:** [Personas principais]

## 2. Escopo
### Must-have (MVP)
- [Feature 1]
- [Feature 2]

### Nice-to-have
- [Feature extra]

### Fora de Escopo
- [O que NÃO será feito]

## 3. Requisitos Funcionais
| ID | Requisito | Prioridade | User Story |
|----|-----------|------------|------------|
| RF-01 | [Descrição] | P0 | Como [persona], quero [ação], para [benefício] |
| RF-02 | [Descrição] | P1 | Como [persona], quero [ação], para [benefício] |

## 4. Requisitos Não-Funcionais
- **Performance:** [Tempo de carregamento, etc.]
- **Acessibilidade:** [WCAG 2.1 AA, etc.]
- **SEO:** [Meta tags, sitemap, etc.]
- **Responsividade:** [Mobile-first, breakpoints]

## 5. UX/UI
### Mapa de Páginas
\`\`\`
/               → Home
/sobre          → Sobre
/contato        → Contato
\`\`\`

### Estrutura por Página
#### Home
- Header com navegação
- Hero section com CTA
- Seções de conteúdo
- Footer

### Componentes Principais
- Header, Footer, Hero, Cards, Forms, etc.

## 6. Arquitetura
### Estrutura de Pastas (baseada na complexidade)
\`\`\`
[Estrutura apropriada ao nível detectado]
\`\`\`

### Stack
- React + Vite + TypeScript
- Tailwind CSS
- Lucide React (ícones)
- Framer Motion (animações)

## 7. Analytics e Métricas
| Evento | Quando dispara |
|--------|----------------|
| page_view | Ao carregar página |
| cta_click | Ao clicar em CTA |
| form_submit | Ao enviar formulário |

## 8. Plano de Testes
| Requisito | Critério de Aceite | Teste |
|-----------|-------------------|-------|
| RF-01 | [O que deve acontecer] | [Como testar] |

## 9. Riscos e Perguntas
### Riscos
- [Risco 1 + mitigação]

### Perguntas em Aberto
- [Pergunta para validação futura]

## 10. Entregáveis
- [ ] [Entregável 1]
- [ ] [Entregável 2]

---

## 11. METADADOS DO PROJETO (OBRIGATÓRIO!)

⚠️ VOCÊ DEVE incluir este bloco JSON no final, é CRÍTICO para o sistema:

\`\`\`json
{
  "project_name": "[Nome do Projeto]",
  "complexity": "[SIMPLE|BASIC|INTERMEDIATE|ADVANCED]",
  "estimated_files": [número],
  "architecture_template": "[SIMPLE|BASIC|INTERMEDIATE|ADVANCED]",
  "expected_structure": {
    "required_files": ["src/App.tsx", "src/index.css", "package.json", "index.html"],
    "component_count": [número],
    "page_count": [número]
  },
  "features": {
    "needs_auth": [true|false],
    "needs_state_management": [true|false],
    "needs_api": [true|false],
    "needs_forms": [true|false],
    "needs_dark_mode": [true|false]
  },
  "pages": ["Home", "About", ...],
  "components": ["Header", "Footer", "Hero", ...],
  "recommended_structure": [
    "src/components/ui/",
    "src/components/layout/",
    ...
  ]
}
\`\`\`

---

## ⚠️ REGRAS CRÍTICAS

1. **O JSON de metadados é OBRIGATÓRIO** - deve estar no final dentro de \`\`\`json
2. **A complexidade deve ser COERENTE**:
   - "landing simples" → SIMPLE (não ADVANCED!)
   - "e-commerce" → ADVANCED (não SIMPLE!)
3. **Estrutura de pastas deve corresponder ao nível**
4. **Seja específico**: use nomes reais, rotas, eventos
5. **Responda sempre em pt-BR**
6. **Não faça perguntas** - crie assunções e as liste em "Perguntas em Aberto"
`;

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
          model: 'google/gemini-3-flash-preview',
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

            // 🧠 Extrair metadados JSON do PRD
            let metadata = null;
            try {
              const jsonMatch = fullContent.match(/```json\s*([\s\S]*?)\s*```/);
              if (jsonMatch && jsonMatch[1]) {
                const jsonStr = jsonMatch[1].trim();
                metadata = JSON.parse(jsonStr);
                console.log('[GeneratePRD] Metadados extraídos:', JSON.stringify(metadata));
              } else {
                console.warn('[GeneratePRD] Metadados JSON não encontrados no PRD');
              }
            } catch (parseErr) {
              console.error('[GeneratePRD] Erro ao parsear metadados:', parseErr);
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

            // Log do agente com classificação
            console.log(`[GeneratePRD] ✅ PRD gerado | Projeto: ${projectId} | Complexidade: ${metadata?.complexity || 'N/A'} | Arquivos estimados: ${metadata?.estimated_files || 'N/A'}`);

            // Send done event com metadados
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'done',
              data: {
                ok: true,
                prd: fullContent,
                metadata: metadata
              }
            })}\n\n`));
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
        model: 'google/gemini-3-flash-preview',
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

    // 🧠 Extrair metadados JSON do PRD
    let metadata = null;
    try {
      const jsonMatch = prdContent.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch && jsonMatch[1]) {
        const jsonStr = jsonMatch[1].trim();
        metadata = JSON.parse(jsonStr);
        console.log('[GeneratePRD] Metadados extraídos:', JSON.stringify(metadata));
      } else {
        console.warn('[GeneratePRD] Metadados JSON não encontrados no PRD');
      }
    } catch (parseErr) {
      console.error('[GeneratePRD] Erro ao parsear metadados:', parseErr);
    }

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

    // Log do agente com classificação
    console.log(`[GeneratePRD] ✅ PRD gerado | Projeto: ${projectId} | Complexidade: ${metadata?.complexity || 'N/A'} | Arquivos estimados: ${metadata?.estimated_files || 'N/A'}`);

    return new Response(JSON.stringify({ prd: savedDoc, metadata }), {
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
