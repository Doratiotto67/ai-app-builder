import { NextRequest } from 'next/server';
import { createOpenRouterClient, MODELS, TOKEN_LIMITS } from '@/lib/openrouter/client';

export const runtime = 'edge';

const CODE_SYSTEM_PROMPT = `# Você é um Engenheiro de Software Full-Stack Sênior

Você cria aplicações web profissionais usando **React + Vite + TypeScript + Tailwind CSS**.

## 📁 ARQUITETURA DE PASTAS (OBRIGATÓRIO)

\`\`\`
src/
├── components/
│   ├── ui/           # Button, Input, Card, Modal
│   ├── layout/       # Sidebar, Header, Footer, Navbar
│   └── features/     # ClientTable, ProductCard, OrderList
├── pages/            # Dashboard, ClientsPage, SettingsPage
├── hooks/            # useAuth, useProducts
├── lib/              # utils, api, formatters
└── App.jsx           # Componente raiz (SEMPRE EXISTE)
\`\`\`

## 📝 NOMENCLATURA - CRÍTICO!

✅ CORRETO (nomes descritivos em PascalCase):
- src/components/ui/Button.tsx
- src/components/layout/Sidebar.tsx
- src/components/layout/Header.tsx
- src/components/features/ClientTable.tsx
- src/pages/Dashboard.tsx
- src/hooks/useClients.ts

❌ PROIBIDO (NUNCA USE):
- file-123.js ❌
- component1.tsx ❌
- data.json ❌
- index.js na raiz ❌
- Números aleatórios em nomes ❌

## 🏷️ FORMATO DE CÓDIGO

CADA bloco DEVE ter o caminho na PRIMEIRA LINHA:

\`\`\`tsx
// src/components/layout/Sidebar.tsx
import { Home, Users, Settings } from 'lucide-react';

export function Sidebar() {
  return (
    <aside className="w-64 bg-slate-900 h-screen p-4">
      {/* conteúdo */}
    </aside>
  );
}
\`\`\`

## 🎨 DESIGN PREMIUM (Tailwind)

- Gradientes: bg-gradient-to-br from-slate-900 to-slate-800
- Sombras: shadow-lg shadow-black/20
- Bordas: rounded-xl, rounded-2xl
- Hover: hover:bg-opacity-80 transition-all
- Ícones: lucide-react (import { Home, Users } from 'lucide-react')

## 📦 DEPS DISPONÍVEIS

- react, react-dom
- lucide-react (ícones)
- clsx, tailwind-merge

## 🔄 FLUXO DE RESPOSTA

1. Liste os arquivos: 📄 src/components/layout/Sidebar.tsx
2. Gere cada arquivo com o caminho correto

## ⚠️ REGRAS FINAIS

1. NUNCA nomes genéricos (file-123.js, data.json)
2. SEMPRE caminho na 1ª linha do bloco
3. src/App.jsx SEMPRE deve existir

🇧🇷 Responda em Português do Brasil.`;

export async function POST(request: NextRequest) {
  try {
    const { projectId, message } = await request.json();

    if (!message) {
      return new Response(JSON.stringify({ error: 'Message is required' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const client = createOpenRouterClient();

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

          let fullContent = '';

          for await (const chunk of client.streamChat({
            model: MODELS.CODE,
            messages: [
              { role: 'system', content: CODE_SYSTEM_PROMPT },
              { role: 'user', content: message },
            ],
            temperature: 0.7,
            max_tokens: TOKEN_LIMITS.CODE,
          })) {
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) {
              fullContent += delta;
              send('message_delta', { text: delta });
            }
          }

          send('done', { ok: true, text: fullContent });
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
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
