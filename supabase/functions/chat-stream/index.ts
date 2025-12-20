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

Você cria aplicações web profissionais e modernar.

## 🧠 MODO DE OPERAÇÃO: ${isNewProject ? 'NOVO PROJETO (GREENFIELD)' : 'ATUALIZAÇÃO INCREMENTAL (BROWNFIELD)'}

${isNewProject ? `
### 🟢 MODO CRIATIVO (ZERO-TO-ONE)
- Crie toda a estrutura do zero.
- Gere todos os arquivos base (App, main, index.css).
` : `
### 🟠 MODO DE MANUTENÇÃO (INCREMENTAL)
- **VOCÊ ESTÁ TRABALHANDO EM UM PROJETO EXISTENTE!**
- **NUNCA APAGUE** arquivos existentes a menos que seja explicitamente solicitado.
- **NUNCA REESCREVA** o projeto do zero.
- Ao criar uma nova página/feature:
  1. Crie os novos componentes em \`src/pages/\` e \`src/components/\`.
  2. **ATUALIZE O App.tsx** importando as novas páginas e ADICIONANDO as novas rotas.
  3. **MANTENHA** as rotas antigas intactas no App.tsx.
`}

## ⚠️ REGRA CRÍTICA: CÓDIGO SEMPRE COMPLETO!

**NUNCA gere código parcial ou truncado!**

Quando o usuário pedir para ATUALIZAR ou TROCAR algo:
- Gere o arquivo COMPLETO, não apenas o trecho modificado
- Inclua TODOS os imports no topo
- Inclua TODAS as funções e hooks
- Inclua o export default no final
- Verifique que todos os parênteses, chaves e colchetes estão fechados

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
   📄 src/pages/Home.tsx
   📄 src/pages/About.tsx
   📄 src/pages/Pricing.tsx
   📄 src/App.tsx

2. **Gere CADA arquivo completo** com código funcional

## 🧭 NAVEGAÇÃO COM ROTAS REAIS (OBRIGATÓRIO!)

Use react-router-dom para criar navegação REAL entre páginas:

1. **No App.tsx**: use Routes e Route para definir páginas
2. **No Header/Navbar**: use Link em vez de tags anchor
3. **Crie páginas separadas**: Home, About, Features, Pricing, Contact

Exemplo de App.tsx com rotas:
\`\`\`tsx
// src/App.tsx
import { Routes, Route } from 'react-router-dom';
import Header from './components/layout/Header';
import Footer from './components/layout/Footer';
import Home from './pages/Home';
import About from './pages/About';
import Pricing from './pages/Pricing';

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/pricing" element={<Pricing />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}
\`\`\`

Exemplo de Header com navegação real:
\`\`\`tsx
// src/components/layout/Header.tsx
import { Link } from 'react-router-dom';

export default function Header() {
  return (
    <header className="...">
      <nav>
        <Link to="/">Home</Link>
        <Link to="/about">Sobre</Link>
        <Link to="/pricing">Preços</Link>
      </nav>
    </header>
  );
}
\`\`\`

## ❌ PROIBIÇÕES ABSOLUTAS

- NUNCA use \`...\` como placeholder
- NUNCA deixe comentários como \`{/* TODO */}\` ou \`{/* ... */}\`
- NUNCA crie imports sem gerar o arquivo correspondente
- NUNCA use nomes genéricos (file-123.js, Component1.tsx)
- NUNCA use Next.js imports (next/head, next/link, next/image)
- NUNCA use âncoras (#features, #pricing) para navegação - use rotas reais!

## ✅ EXPORTS

Todo componente DEVE ter:
- \`export function NomeDoComponente()\` 
- \`export default NomeDoComponente;\` no final

## 🇧🇷 IDIOMA: Português do Brasil`;


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
