import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { logAgentEvent, errorToLogEntry } from '../_shared/agent-logger.ts';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 📁 Templates de Arquitetura por Nível de Complexidade
const ARCHITECTURE_TEMPLATES = {
  SIMPLE: `
src/
├── App.tsx         # Componente raiz com todo o conteúdo
├── main.tsx        # Entry point (NÃO EDITAR!)
└── index.css       # Tailwind imports`,

  BASIC: `
src/
├── components/
│   ├── Header.tsx
│   ├── Footer.tsx
│   └── [outros componentes]
├── pages/
│   └── [páginas]
├── App.tsx         # Rotas
├── main.tsx        # Entry point (NÃO EDITAR!)
└── index.css`,

  INTERMEDIATE: `
src/
├── components/
│   ├── ui/         # Button, Input, Card
│   ├── layout/     # Header, Footer, Sidebar
│   └── features/   # Componentes de domínio
├── pages/          # Páginas/Rotas
├── hooks/          # useTheme, useForm, etc.
├── contexts/       # ThemeContext, etc.
├── lib/            # utils.ts, cn()
├── App.tsx         # Rotas
├── main.tsx        # Entry point (NÃO EDITAR!)
└── index.css`,

  ADVANCED: `
src/
├── components/
│   ├── ui/         # Primitivos: Button, Input, Modal
│   ├── layout/     # Estrutura: Header, Footer, Sidebar
│   ├── features/   # Domínio: ProductCard, CartItem
│   └── common/     # Shared: Loading, ErrorBoundary
├── pages/          # Todas as páginas
├── hooks/          # Hooks customizados
├── contexts/       # Providers de estado global
├── lib/            # Utilitários e helpers
├── types/          # TypeScript interfaces
├── data/           # Dados mock/constantes
├── constants/      # Configurações
├── App.tsx         # Rotas
├── main.tsx        # Entry point (NÃO EDITAR!)
└── index.css`
} as const;

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  const startTime = Date.now();
  let projectId: string | null = null;
  let userId: string | null = null;

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

    // Parse body e extrair dados (evitar shadowing de projectId)
    const body = await req.json();
    const reqProjectId = body.projectId;
    const { message, threadId, images, targets, mode, prdMetadata } = body as {
      projectId: string;
      message: string;
      threadId?: string;
      images?: string[];
      targets?: { paths?: string[]; symbols?: string[] };
      mode?: 'surgical' | 'creative';
      prdMetadata?: {
        complexity?: 'SIMPLE' | 'BASIC' | 'INTERMEDIATE' | 'ADVANCED';
        architecture_template?: string;
        features?: Record<string, boolean>;
        recommended_structure?: string[];
      };
    };

    // Atribuir às variáveis de escopo externo para logging
    projectId = reqProjectId;
    userId = user.id;

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

    // 1. Buscar arquivos existentes do projeto (COLUNA CORRETA: content_text)
    const { data: existingFiles, error: filesError } = await supabase
      .from('project_files')
      .select('path, content_text')
      .eq('project_id', reqProjectId);

    if (filesError) {
      console.error('[ChatStream] Erro ao buscar arquivos:', filesError.message);
    }

    const filePaths = existingFiles?.map(f => f.path) || [];
    const appTsxContent = existingFiles?.find(f => f.path.includes('src/App.tsx') || f.path.includes('src/App.jsx'))?.content_text;
    const isNewProject = filePaths.length === 0;

    // 2. Processar targets para Surgical Mode
    const allowedPaths = Array.isArray(targets?.paths) ? targets.paths : [];
    const strictScope = mode === 'surgical' && allowedPaths.length > 0;

    // 3. Determinar nível de complexidade e arquitetura
    const complexity = prdMetadata?.complexity || 'INTERMEDIATE'; // Fallback
    const architectureTemplate = ARCHITECTURE_TEMPLATES[complexity] || ARCHITECTURE_TEMPLATES.INTERMEDIATE;

    console.log(`[ChatStream] ProjectID: ${reqProjectId} | Files: ${filePaths.length} | IsNew: ${isNewProject} | StrictScope: ${strictScope} | Complexity: ${complexity} | AllowedPaths: ${allowedPaths.join(', ') || 'none'}`);

    // 3. Construir contexto dos arquivos-alvo (Surgical Mode)
    let targetedFilesContext = '';
    if (strictScope) {
      const byPath = new Map((existingFiles || []).map(f => [f.path, f.content_text]));
      const blocks = allowedPaths
        .map(p => {
          const content = byPath.get(p);
          if (!content) return `### ⚠️ (ARQUIVO NÃO ENCONTRADO NO PROJETO) ${p}`;
          return `### ${p}\n\`\`\`tsx\n${content}\n\`\`\``;
        })
        .join('\n\n');
      targetedFilesContext = `
## 🎯 ARQUIVOS ALVO (VOCÊ DEVE EDITAR APENAS ESTES)
${blocks}
`;
    }

    // 4. Contexto geral do projeto para o LLM
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

## 📦 BIBLIOTECAS DISPONÍVEIS (USE APENAS ESTAS!)
\`\`\`
react, react-dom, react-router-dom
lucide-react (ícones - PREFERIDO)
clsx, tailwind-merge (utilitários CSS)
framer-motion (animações)
react-hot-toast (notificações/toasts)
date-fns (manipulação de datas)
@headlessui/react (modais, dropdowns, etc)
zustand (estado global)
axios (requisições HTTP)
react-icons (ícones alternativos)
\`\`\`

⚠️ **NÃO IMPORTE** bibliotecas fora desta lista! Se precisar de algo não listado, implemente com CSS/JS puro ou use uma das alternativas acima.

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
  - Mantenha TODAS as rotas existentes.
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
- **Código completo:** Sempre gere o arquivo COMPLETO, não parcial. Inclua TODOS os imports e o fechamento de todas as tags/funções.

## 🚨 LINHAS VERMELHAS (ERROS FATAIS)
Erros que você deve evitar a TODO O CUSTO. O sistema vai rejeitar seu código se contiver:

**1. IMPORTS INVÁLIDOS:**
❌ \`import clsx from clsx\` (sem aspas!)
✅ \`import clsx from 'clsx'\`
❌ \`import ... from 'lucide-react/dist/esm/icons/home'\` (caminho errado!)
✅ \`import { Home } from 'lucide-react'\`

**2. JSX QUEBRADO:**
❌ \`<div>Texto\` (sem fechar tag)
✅ \`<div>Texto</div>\`
❌ \`<input type="text">\` (sem self-close)
✅ \`<input type="text" />\`

**3. FUNÇÕES INCOMPLETAS:**
❌ \`function App() {\` (sem fechar chaves)
✅ \`function App() { return <div>...</div> }\`

**4. TIPOS ERRADOS:**
❌ \`useState('')\` inicializado com string para usar como number
✅ \`useState<number>(0)\`

## ✅ CHECKLIST OBRIGATÓRIO (MENTAL)
Antes de escrever o primeiro caractere de cada arquivo:
1. [ ] Todos os imports têm aspas (' ou ")?
2. [ ] Todas as tags JSX abertas têm fechamento?
3. [ ] Todos os arrays/objetos têm vírgula entre itens?
4. [ ] O arquivo tem export default?
5. [ ] O código está 100% completo (sem \`// ... rest of code\`)?

## 📋 PLANO DE EXECUÇÃO
Liste os arquivos que você vai tocar:
- [CRIAR] src/pages/NovaPagina.tsx (Nova funcionalidade)
- [EDITAR] src/App.tsx (Adicionar rota)
- [EDITAR] src/components/ui/Button.tsx (Ajustar cor)

## 📁 ARQUITETURA DO PROJETO (Nível: ${complexity})
\`\`\`
${architectureTemplate}
\`\`\`

### 📌 REGRAS DE ORGANIZAÇÃO:
- NÃO crie pastas além das listadas acima
- Siga EXATAMENTE a estrutura indicada para este nível
- Se o PRD indicar SIMPLE, NÃO crie pastas extras!

## 📝 FORMATO DE CÓDIGO
Use o caminho completo na primeira linha:

\`\`\`tsx
// src/components/ExistingComponent.tsx
import React from 'react';
// ... código completo
export default ComponentName;
\`\`\`

## 🏷️ ATRIBUTO DE RASTREAMENTO (OBRIGATÓRIO!)

Para CADA componente que você criar ou editar, adicione o atributo \`data-source-file\` 
no elemento raiz do JSX retornado. O valor DEVE ser o caminho exato do arquivo.

### Exemplo:
\`\`\`tsx
// src/components/Header.tsx
export default function Header() {
  return (
    <header data-source-file="src/components/Header.tsx" className="...">
      {/* conteúdo */}
    </header>
  );
}
\`\`\`

### Regras:
- Adicione APENAS no elemento raiz do return do componente
- O valor deve ser EXATAMENTE o caminho do arquivo (igual ao comentário)
- NÃO adicione em elementos internos (evita poluição)
- Para App.tsx, adicione no elemento \`<main>\` ou \`<div>\` raiz

## 🎨 ESTILO (Tailwind)
- Mantenha a consistência visual.
- Use \`lucide-react\` para ícones (PREFERIDO sobre react-icons).
- Use \`react-hot-toast\` para notificações.
- Use \`framer-motion\` para animações.

## 🔍 ATENÇÃO AOS DETALHES (CRÍTICO!)

### 🎚️ ELEMENTOS INTERATIVOS DEVEM FUNCIONAR DE VERDADE:

**1. BOTÃO DE TEMA/DARK MODE:**
- DEVE usar useState ou Context para controlar o estado
- DEVE aplicar classes no \`<html>\` ou \`<body>\` (\`classList.toggle('dark')\`)
- DEVE persistir preferência (localStorage)
- Exemplo CORRETO:
\`\`\`tsx
const [isDark, setIsDark] = useState(() => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('theme') === 'dark' ||
      (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }
  return false;
});

useEffect(() => {
  document.documentElement.classList.toggle('dark', isDark);
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
}, [isDark]);

// No botão:
<button onClick={() => setIsDark(!isDark)}>
  {isDark ? <Sun /> : <Moon />}
</button>
\`\`\`

**2. TOGGLES E SWITCHES:**
- DEVEM ter estado controlado (\`useState\`)
- DEVEM alterar visualmente ao clicar
- DEVEM disparar callbacks se necessário
\`\`\`tsx
const [isEnabled, setIsEnabled] = useState(false);
<button 
  onClick={() => setIsEnabled(!isEnabled)}
  className={\`\${isEnabled ? 'bg-green-500' : 'bg-gray-500'}\`}
>
\`\`\`

**3. INPUTS E FORMS:**
- DEVEM ter value + onChange (componentes controlados)
- Formulários DEVEM ter onSubmit com preventDefault

**4. MODAIS E DROPDOWNS:**
- DEVEM ter estado de aberto/fechado
- DEVEM fechar ao clicar fora ou no X
- Use Headless UI ou implemente manualmente

**5. NAVEGAÇÃO:**
- Links internos DEVEM usar \`<Link to="...">\` do react-router-dom
- NUNCA use \`<a href="/..."\` para rotas internas

**6. CORES E CONSISTÊNCIA:**
- Se o app tem uma cor primária (ex: cyan, purple), TODOS os elementos de destaque devem usá-la
- Botões de ação devem combinar com o tema
- Estados hover/active devem ser consistentes

### 📋 CHECKLIST DE FUNCIONALIDADE:
Antes de entregar código, verifique:
- [ ] Botões têm onClick e fazem algo útil?
- [ ] Toggles mudam de estado visualmente?
- [ ] Tema dark/light realmente muda as cores da página?
- [ ] Inputs são controlados (value + onChange)?
- [ ] Modais abrem e fecham corretamente?
- [ ] Cores são consistentes em todo o componente?
- [ ] Animações estão suaves (use framer-motion)?
- [ ] Ícones combinam com a ação do botão?

### ⚠️ ERROS COMUNS DE DETALHES:
❌ Botão de tema que não aplica classes no documento
❌ Toggle que muda estado mas não muda visual
❌ Modal sem botão de fechar
❌ Input sem onChange (read-only acidental)
❌ Cores primárias diferentes em cada componente
❌ Ícone de sol para tema escuro (deveria ser lua)

## ❌ PROIBIDO
- **NÃO gere src/main.tsx!** O main.tsx já existe com o BrowserRouter configurado. NUNCA o sobrescreva.
- **NÃO use BrowserRouter no App.tsx!** O Router já está configurado no main.tsx. Use apenas Routes e Route.
- **Hooks de Router (useLocation, useNavigate, useParams)** só funcionam DENTRO de componentes que são filhos do BrowserRouter. Como o BrowserRouter está no main.tsx, todos os componentes do App.tsx já estão dentro dele. **NÃO crie um ScrollToTop ou componente similar FORA do return do App.tsx**.
- **NÃO importe bibliotecas que não estão na lista acima.**
- **NÃO crie novos projetos do zero** se já existirem arquivos.
- NÃO use placeholders.
- NÃO quebre a navegação existente.
- NÃO apague imports necessários no App.tsx.
- NÃO gere código parcial ou incompleto.

${strictScope ? `
## ⛔ MODO CIRÚRGICO ATIVO - ESCOPO RESTRITO ⛔

**🚨 ATENÇÃO MÁXIMA! VOCÊ ESTÁ EM MODO CIRÚRGICO!**

### ARQUIVO(S) PERMITIDO(S) - VOCÊ SÓ PODE TOCAR NESTE(S):
${allowedPaths.map(p => `✅ ${p}`).join('\n')}

### ❌ ABSOLUTAMENTE PROIBIDO:
1. **NÃO CRIE NENHUM ARQUIVO NOVO** - Isto é uma violação grave
2. **NÃO MODIFIQUE App.tsx** (a menos que esteja na lista acima)
3. **NÃO MODIFIQUE main.tsx** - NUNCA
4. **NÃO TOQUE EM NENHUM OUTRO ARQUIVO** - Ignorar resulta em falha

### ✅ O QUE VOCÊ DEVE FAZER:
1. EDITAR **APENAS** o(s) arquivo(s) listado(s) acima
2. Retornar o arquivo **COMPLETO** com as melhorias
3. Manter todos os imports e exports existentes
4. Focar EXCLUSIVAMENTE na melhoria solicitada

### 📝 FORMATO DA RESPOSTA:
Você DEVE responder com APENAS UM bloco de código:

\`\`\`tsx
// ${allowedPaths[0] || 'caminho/do/arquivo.tsx'}
// ... código completo do arquivo editado
\`\`\`

**SE VOCÊ GERAR QUALQUER ARQUIVO QUE NÃO ESTEJA NA LISTA ACIMA, VOCÊ FALHOU!**
` : ''}

## 🇧🇷 IDIOMA
Português do Brasil`;


    // Build user message content - supports text + images for vision models
    type MessageContent = string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;
    const userContentText = message;

    // Inject project context + targeted files context into user message
    const finalUserMessageText = `${userContentText}\n\n${projectContext}\n\n${targetedFilesContext}`;

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

    // Usar taxonomia de erros para logging padronizado
    const logEntry = errorToLogEntry('chat-stream', error, 'UNKNOWN_ERROR', {
      project_id: projectId,
      user_id: userId,
      execution_time_ms: Date.now() - startTime,
    });

    await logAgentEvent(logEntry);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
        errorCode: logEntry.error_code
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
