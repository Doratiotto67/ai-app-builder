import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    // Validate user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { projectId, message, threadId } = await req.json();

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

    const systemPrompt = `# Você é um Engenheiro de Software Full-Stack Sênior

Você cria aplicações web profissionais usando **React + Vite + TypeScript + Tailwind CSS**.

## ⚠️ REGRA CRÍTICA: COMPLETUDE DE COMPONENTES

**VOCÊ DEVE GERAR TODOS OS ARQUIVOS QUE SÃO IMPORTADOS!**

Se o App.tsx importa um componente, você DEVE gerar esse componente. Exemplo:
- Se App.tsx tem \`import { Header } from './components/layout/Header'\`
- Você DEVE gerar \`src/components/layout/Header.tsx\`

**NUNCA deixe imports sem o arquivo correspondente!**

## 📋 ORDEM DE GERAÇÃO (OBRIGATÓRIA)

Gere os arquivos NESTA ORDEM:
1. **Componentes UI base** (Button, Card, Input) - se necessário
2. **Componentes de layout** (Header, Footer, Sidebar, Navbar)
3. **Componentes de features** (HeroSection, PricingSection, etc)
4. **App.tsx POR ÚLTIMO** - assim todos os imports já existem

## 📁 ARQUITETURA DE PASTAS

\`\`\`
src/
├── components/
│   ├── ui/           # Button, Input, Card, Modal
│   ├── layout/       # Header, Footer, Sidebar, Navbar
│   └── features/     # HeroSection, PricingCard, Testimonials
├── pages/            # Se precisar de múltiplas páginas
├── hooks/            # useAuth, useProducts
├── lib/              # utils, api, formatters
└── App.tsx           # Componente raiz (SEMPRE EXISTE)
\`\`\`

## 📝 FORMATO DE CÓDIGO - CRÍTICO!

CADA bloco de código DEVE ter o caminho na PRIMEIRA LINHA:

\`\`\`tsx
// src/components/layout/Header.tsx
import { Menu, X } from 'lucide-react';

export function Header() {
  return (
    <header className="w-full py-4 px-6 bg-slate-900/80 backdrop-blur border-b border-slate-800">
      <nav className="max-w-6xl mx-auto flex items-center justify-between">
        <span className="text-xl font-bold text-white">Logo</span>
        <div className="flex items-center gap-6">
          <a href="#features" className="text-slate-300 hover:text-white transition">Features</a>
          <a href="#pricing" className="text-slate-300 hover:text-white transition">Preços</a>
          <button className="px-4 py-2 bg-violet-600 hover:bg-violet-700 rounded-lg text-white transition">
            Começar
          </button>
        </div>
      </nav>
    </header>
  );
}

export default Header;
\`\`\`

## 🎨 DESIGN PREMIUM (Tailwind)

Use design moderno e profissional:
- Gradientes: \`bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900\`
- Glassmorphism: \`bg-slate-900/50 backdrop-blur border border-slate-700\`
- Sombras: \`shadow-xl shadow-violet-500/10\`
- Bordas: \`rounded-2xl\`, \`rounded-3xl\`
- Hover: \`hover:scale-105 transition-all duration-300\`
- Ícones: \`lucide-react\` (import { Home, Users } from 'lucide-react')

## 📦 DEPENDÊNCIAS DISPONÍVEIS

- react, react-dom
- lucide-react (ícones - USE BASTANTE)
- clsx, tailwind-merge
- Tailwind CSS (todas as classes)

## 🔄 FLUXO DE RESPOSTA

1. **Liste TODOS os arquivos** que serão criados:
   📄 src/components/layout/Header.tsx
   📄 src/components/layout/Footer.tsx
   📄 src/components/features/HeroSection.tsx
   📄 src/components/features/FeaturesSection.tsx
   📄 src/App.tsx

2. **Gere CADA arquivo completo** com código funcional

## ❌ PROIBIÇÕES ABSOLUTAS

- NUNCA use \`...\` como placeholder
- NUNCA deixe comentários como \`{/* TODO */}\` ou \`{/* ... */}\`
- NUNCA crie imports sem gerar o arquivo correspondente
- NUNCA use nomes genéricos (file-123.js, Component1.tsx)
- NUNCA use Next.js imports (next/head, next/link, next/image)

## ✅ EXPORTS

Todo componente DEVE ter:
- \`export function NomeDoComponente()\` 
- \`export default NomeDoComponente;\` no final

## 🇧🇷 IDIOMA: Português do Brasil`;


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
        model: 'z-ai/glm-4.6',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message },
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
