'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useIDEStore } from '@/stores/ide-store';
import { useAuth } from '@/lib/auth/auth-provider';
import { sendChatMessage, getOrCreateChatThread, getChatMessages, saveFile, saveFilesBatch, generatePRD, analyzeImage } from '@/lib/api/project-service';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Send,
  Sparkles,
  User,
  Bot,
  Loader2,
  Image as ImageIcon,
  Paperclip,
  FileCode,
  Check,
  Wand2,
  Plus,
  Code,
  Layout,
  FileText,
  Zap,
  ChevronDown,
  ChevronUp,
  Copy,
  StopCircle,
  MousePointerClick,
  X,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import type { ChatMessage } from '@/types/database';
import { useWebContainer } from '@/lib/webcontainer';
import { useCodeFixer } from '@/hooks/useCodeFixer';
import { chatLog, extractLog } from '@/lib/debug/logger';
import { 
  validateAndCompleteFiles, 
  fixDependencies,
  validateProject,
} from '@/lib/code-validation';
import { fixCode as fixCodeViaAI } from '@/lib/api/project-service';
// New components for Lovable-style UI
import { ThreadMessage } from './thread-message';
import { FileChangePreview, type FileAction } from './file-change-preview';

interface ChatPanelProps {
  projectId: string;
}
// Regex para extrair blocos de código com nome de arquivo
// Detecta: ```tsx, ```jsx, ```typescript, etc.
const CODE_BLOCK_REGEX = /```(\w+)?\s*\n([\s\S]*?)```/g;

// Padrões para detectar nome de arquivo:
// 1. // app/page.tsx ou // filename.tsx
// 2. # filename.py
// 3. /* filename.css */ ou {/* filename.tsx */}
// 4. <!-- filename.html -->
// 5. Título em formato markdown antes do bloco: **arquivo.tsx** ou `arquivo.tsx`
const FILENAME_PATTERNS = [
  /^\/\/\s*([^\s]+\.[a-zA-Z]+)/,           // // filename.tsx
  /^#\s*([^\s]+\.[a-zA-Z]+)/,              // # filename.py
  /^\/\*\s*([^\s*]+\.[a-zA-Z]+)\s*\*\//,   // /* filename.css */
  /^\{\/\*\s*([^\s*]+\.[a-zA-Z]+)\s*\*\/\}/, // {/* filename.tsx */}
  /^<!--\s*([^\s]+\.[a-zA-Z]+)\s*-->/,     // <!-- filename.html -->
  /^\/\*\*?\s*@file\s+([^\s]+\.[a-zA-Z]+)/, // /** @file filename.tsx */
];

interface ExtractedFile {
  path: string;
  content: string;
  language: string;
}

function extractFilesFromContent(content: string): ExtractedFile[] {
  const files: ExtractedFile[] = [];
  const matches = content.matchAll(CODE_BLOCK_REGEX);

  // Pegar contexto antes de cada bloco para detectar nomes de arquivo em markdown
  let lastIndex = 0;

  for (const match of matches) {
    const language = match[1] || 'text';
    let code = match[2]?.trim() || '';
    const matchIndex = match.index || 0;

    // Contexto antes do bloco (para detectar títulos markdown)
    const contextBefore = content.slice(Math.max(0, lastIndex), matchIndex).trim();
    lastIndex = matchIndex + match[0].length;

    let filename: string | null = null;

    // 1. Tentar detectar na primeira linha do código
    const firstLine = code.split('\n')[0];
    console.log(`[extractFilesFromContent] Primeira linha: "${firstLine.substring(0, 80)}..."`);

    for (const pattern of FILENAME_PATTERNS) {
      const filenameMatch = firstLine.match(pattern);
      if (filenameMatch) {
        filename = filenameMatch[1];
        code = code.split('\n').slice(1).join('\n').trim();
        console.log(`[extractFilesFromContent] Arquivo detectado via padrão: ${filename}`);
        break;
      }
    }

    // 2. Se não encontrou, procurar no contexto markdown antes do bloco
    if (!filename) {
      // Procura por: **arquivo.tsx**, `arquivo.tsx`, ou "arquivo.tsx"
      const mdPatterns = [
        /\*\*([^\s*]+\.[a-zA-Z]+)\*\*\s*$/,
        /`([^\s`]+\.[a-zA-Z]+)`\s*$/,
        /"([^\s"]+\.[a-zA-Z]+)"\s*$/,
        /:\s*([^\s:]+\.[a-zA-Z]+)\s*$/,
      ];

      for (const pattern of mdPatterns) {
        const mdMatch = contextBefore.match(pattern);
        if (mdMatch) {
          filename = mdMatch[1];
          break;
        }
      }
    }

    // 3. Inferir do tipo de linguagem se não encontrou (Legacy logic)
    if (!filename && code.length > 0) {
      if (['tsx', 'jsx', 'javascript', 'typescript'].includes(language)) {
        const funcMatch = code.match(/export\s+default\s+function\s+(\w+)/);
        if (funcMatch) {
          const funcName = funcMatch[1];
          if (['Page', 'Home', 'App', 'Index', 'Landing'].includes(funcName)) {
            filename = 'app/page.tsx';
          } else if (funcName.toLowerCase().includes('login')) {
            filename = 'app/login/page.tsx';
          } else {
            filename = `components/${funcName}.tsx`;
          }
        }
      }
    }

    // 4. Fallback final se ainda não encontrou filename mas tem código substancial
    if (!filename && code.length > 5) {
      if (language === 'html' || code.includes('<!DOCTYPE html>') || code.includes('<html')) {
        filename = 'index.html';
      } else if (language === 'css') {
        filename = 'src/index.css';
      } else if (['tsx', 'jsx', 'javascript', 'typescript'].includes(language)) {
        // Tentar extrair nome da função para evitar colisões
        const funcMatch = code.match(/export\s+default\s+function\s+(\w+)/);
        const funcName = funcMatch?.[1];

        if (funcName) {
          // Usar o nome da função para determinar o arquivo
          if (['App', 'Page', 'Home', 'Index', 'Landing'].includes(funcName)) {
            filename = 'src/App.tsx';
          } else {
            // Componentes vão para a pasta components
            filename = `src/components/${funcName}.tsx`;
          }
        } else {
          // Sem nome de função, gerar nome único
          filename = `src/components/Component-${Math.floor(Math.random() * 10000)}.${language === 'tsx' || language === 'typescript' ? 'tsx' : 'jsx'}`;
        }
      } else {
        filename = `file-${Math.floor(Math.random() * 1000)}.${language === 'text' ? 'txt' : language}`;
      }
    }

    if (filename && code) {
      // Remover barra inicial para consistência
      let cleanPath = filename.replace(/^\/+/, '');

      // Versão simplificada: apenas adiciona o arquivo sem validação complexa
      console.log(`[extractFiles] ✅ Arquivo extraído: ${cleanPath}`);

      files.push({
        path: cleanPath,
        content: code,
        language,
      });
    }
  }

  console.log(`[extractFilesFromContent] Total de arquivos extraídos: ${files.length}`);
  return files;
}


export function ChatPanel({ projectId }: ChatPanelProps) {
  const { user } = useAuth();
  const {
    messages,
    setMessages,
    addMessage,
    isStreaming,
    setIsStreaming,
    streamingContent,
    setStreamingContent,
    appendStreamingContent,
    activeAgentRun,
    currentThread,
    setCurrentThread,
    files,
    addFile,
    activeFile,
    editorContent,
    refreshPreview,
    setActiveFile,
    openFile,
    updateFile,
    // Visual Edits
    isVisualEditMode,
    toggleVisualEditMode,
    selectedTargetFile,
    setSelectedTargetFile,
  } = useIDEStore();

  // Hook do WebContainer para escrever arquivos diretamente
  const { updateFile: writeToContainer, status: containerStatus } = useWebContainer({});

  // Hook do agente de correção de código
  const { fixCode: fixActiveFile, isFixing: isEditorFixing, errors, analyzeCode, requestAIFix } = useCodeFixer();
  const [isFixing, setIsFixing] = useState(false);

  const [input, setInput] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [extractedFiles, setExtractedFiles] = useState<ExtractedFile[]>([]);
  const [filesCreated, setFilesCreated] = useState(false);
  const [writingFiles, setWritingFiles] = useState(false);
  const [thinkingSteps, setThinkingSteps] = useState<{ id: string; label: string; status: 'pending' | 'running' | 'done' | 'error' }[]>([]);
  // Image upload state
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null); // For stopping stream

  // Initialize chat thread
  useEffect(() => {
    if (!initialized && user && projectId) {
      initChat();
    }
  }, [user, projectId, initialized]);

  const initChat = async () => {
    try {
      const thread = await getOrCreateChatThread(projectId);
      setCurrentThread(thread);

      const existingMessages = await getChatMessages(thread.id);
      setMessages(existingMessages);

      setInitialized(true);
    } catch (error) {
      console.error('Failed to initialize chat:', error);

      let errorMessage = 'Erro ao conectar ao chat.';
      if (typeof error === 'object' && error !== null && 'message' in error) {
        errorMessage = (error as { message: string }).message;
      }

      if (errorMessage?.includes('relation "public.chat_threads" does not exist')) {
        console.warn('Tabelas do chat não encontradas. Verifique se as migrações foram rodadas.');
      }

      setInitialized(true);
    }
  };

  // Ref to track if we should auto-scroll
  const shouldAutoScrollRef = useRef(true);

  // Update auto-scroll preference when user scrolls
  const handleScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
      // If user is within 100px of the bottom, enable auto-scroll
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      shouldAutoScrollRef.current = isNearBottom;
    }
  };

  // Auto-scroll to bottom when messages change, but only if user hasn't scrolled up
  useEffect(() => {
    if (scrollContainerRef.current && shouldAutoScrollRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [messages, streamingContent, thinkingSteps]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        120
      )}px`;
    }
  }, [input]);

  // Função para converter paths Next.js para Vite
  const convertToVitePath = useCallback((filePath: string, content: string): { path: string; content: string } => {
    let convertedPath = filePath.replace(/^\/+/, ''); // Remover barras iniciais
    let convertedContent = content;

    // app/page.tsx ou page.tsx → src/App.tsx (PREFERIR TSX)
    if (convertedPath === 'app/page.tsx' || convertedPath === 'page.tsx' || convertedPath === 'app/page.jsx') {
      // Detectar se é TS ou JS baseado na extensão original ou conteúdo
      const isTs = filePath.endsWith('.tsx') || filePath.endsWith('.ts') || content.includes('interface ') || content.includes('type ');
      convertedPath = isTs ? 'src/App.tsx' : 'src/App.jsx';

      // CRÍTICO: NÃO modificar exports - isso quebrava o código JSX antes!
      // Apenas remover 'use client'
      convertedContent = convertedContent
        .replace(/'use client';\s*\n?/g, '')
        .replace(/"use client";\s*\n?/g, '');
    }
    // app/login/page.tsx → src/pages/Login.tsx
    else if (convertedPath.match(/^app\/[\w-]+\/page\.(tsx|jsx)$/)) {
      const pageName = convertedPath.match(/^app\/([\w-]+)\/page/)?.[1] || 'Page';
      const capitalizedName = pageName.charAt(0).toUpperCase() + pageName.slice(1);
      const ext = filePath.endsWith('.tsx') ? 'tsx' : 'jsx';
      convertedPath = `src/pages/${capitalizedName}.${ext}`;

      // CRÍTICO: NÃO modificar exports - apenas remover 'use client'
      convertedContent = convertedContent
        .replace(/'use client';\s*\n?/g, '')
        .replace(/"use client";\s*\n?/g, '');
    }
    // components/ → src/components/
    else if (convertedPath.startsWith('components/')) {
      convertedPath = 'src/' + convertedPath;
    }
    // Mover outros arquivos de app/ para src/
    else if (convertedPath.startsWith('app/')) {
      convertedPath = convertedPath.replace(/^app\//, 'src/');
    }
    // index.html na raiz é válido para Vite
    else if (convertedPath === 'index.html') {
      convertedPath = 'index.html';
    }

    // REMOVIDO: convertedPath = convertedPath.replace(/\.tsx$/, '.jsx').replace(/\.ts$/, '.js');
    // Devemos manter .tsx/.ts para suporte a TypeScript!

    // CONVERSÕES DE COMPATIBILIDADE NEXT.JS -> VITE
    // 1. Remover imports de Next.js
    convertedContent = convertedContent
      .replace(/import Head from ['"]next\/head['"];?\n?/g, '')
      .replace(/import Link from ['"]next\/link['"];?\n?/g, '')
      .replace(/import Image from ['"]next\/image['"];?\n?/g, '');

    // 2. Substituir tags <Head> por fragmentos
    convertedContent = convertedContent
      .replace(/<Head>([\s\S]*?)<\/Head>/g, '<>$1</>')
      .replace(/<Head\s*>([\s\S]*?)<\/Head>/g, '<>$1</>');

    // 3. Substituir <Link href="..."> por <a href="..."> APENAS SE NÃO FOR REACT ROUTER
    const hasReactRouter = convertedContent.includes("'react-router-dom'") || convertedContent.includes('"react-router-dom"');

    if (!hasReactRouter) {
      // Substituir <Link> por <a> mantendo os atributos (className, etc)
      // Robustez: detecta <Link seguido de espaço e atributos, ou self-closing
      convertedContent = convertedContent.replace(/<Link(\s+[^>]*)>/g, (match, attrs) => {
        const isSelfClosing = match.includes('/>');
        const hasHref = match.includes('href=');
        
        // Se for self-closing e NÃO tiver href, assumimos que é um ícone (lucide-react) -> Não alterar
        if (isSelfClosing && !hasHref) {
          return match;
        }
        
        // Caso contrário (tem href ou não é self-closing), converte para <a>
        return '<a' + attrs + '>';
      });
      convertedContent = convertedContent.replace(/<\/Link>/g, '</a>');
    }

    // 4. Substituir <Image ... /> por <img ... />
    convertedContent = convertedContent.replace(/<Image\s+/g, '<img ');

    return { path: convertedPath, content: convertedContent };
  }, []);

  // Garantir que arquivos de estrutura base existam
  const ensureBaseStructure = useCallback((
    files: Array<{ path: string; content: string; language: string }>,
    structure: { hasPackageJson: boolean; hasIndexHtml: boolean; hasMainTsx: boolean; hasAppTsx: boolean }
  ): Array<{ path: string; content: string; language: string }> => {
    const structureFiles: Array<{ path: string; content: string; language: string }> = [];

    // 1. package.json
    if (!structure.hasPackageJson) {
      structureFiles.push({
        path: 'package.json',
        content: JSON.stringify({
          name: 'my-app',
          version: '0.1.0',
          private: true,
          type: 'module',
          scripts: {
            dev: 'vite --host',
            build: 'vite build',
            preview: 'vite preview'
          },
          dependencies: {
            react: '^18.2.0',
            'react-dom': '^18.2.0',
            'react-router-dom': '^6.20.0',
            'lucide-react': '^0.294.0',
            clsx: '^2.0.0',
            'tailwind-merge': '^2.1.0',
            'framer-motion': '^10.16.5'
          },
          devDependencies: {
            '@types/react': '^18.2.0',
            '@types/react-dom': '^18.2.0',
            '@vitejs/plugin-react': '^4.2.0',
            autoprefixer: '^10.4.16',
            postcss: '^8.4.32',
            tailwindcss: '^3.3.6',
            typescript: '^5.3.3',
            vite: '^5.0.8'
          }
        }, null, 2),
        language: 'json'
      });
    }

    // 2. index.html
    if (!structure.hasIndexHtml) {
      structureFiles.push({
        path: 'index.html',
        content: `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`,
        language: 'html'
      });
    }

    // 3. src/main.tsx
    if (!structure.hasMainTsx) {
      structureFiles.push({
        path: 'src/main.tsx',
        content: `import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);`,
        language: 'tsx'
      });
    }

    // 4. src/App.tsx (se não tiver)
    if (!structure.hasAppTsx) {
      structureFiles.push({
        path: 'src/App.tsx',
        content: `import React from 'react';

export default function App() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 p-8">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
        Bem-vindo!
      </h1>
      <p className="mt-4 text-gray-600 dark:text-gray-400">
        Sua aplicação está rodando.
      </p>
    </div>
  );
}`,
        language: 'tsx'
      });
    }

    return structureFiles;
  }, []);

  // Criar arquivos extraídos - ESCREVE NO STORE E NO WEBCONTAINER
  // PIPELINE OTIMIZADO: CONVERSÃO VITE → AUTO-FIX → VALIDAÇÃO → IA (CONDICIONAL)
  const handleCreateFiles = useCallback(async (filesToCreate?: ExtractedFile[]) => {
    const targets = filesToCreate && Array.isArray(filesToCreate) ? filesToCreate : extractedFiles;
    if (targets.length === 0) return;

    setWritingFiles(true);

    try {
      console.log(`%c[ChatPanel] 🚀 Processando ${targets.length} arquivos`, 'color: #6366f1; font-weight: bold; font-size: 14px');

      // ==== ETAPA 1: CONVERSÃO VITE ====
      console.log(`%c[ChatPanel] 🔄 Convertendo arquivos Next.js → Vite`, 'color: #8b5cf6; font-weight: bold');
      const convertedTargets = targets.map(f => {
        const { path: vitePath, content: viteContent } = convertToVitePath(f.path, f.content);
        console.log(`[ChatPanel] Conversão: ${f.path} → ${vitePath}`);
        return { 
          path: vitePath, 
          content: viteContent, 
          language: f.language 
        };
      });

      // ==== ETAPA 2: VALIDAR IMPORTS ====
      const { files: validatedFiles, stubsGenerated, validation } = validateAndCompleteFiles(convertedTargets);

      if (stubsGenerated > 0) {
        console.log(`%c[ChatPanel] ⚠️ ${stubsGenerated} componentes stub gerados`, 'color: #fbbf24; font-weight: bold');
        chatLog.warn(`Gerados ${stubsGenerated} componentes placeholder`, {
          missing: validation.missingImports.map(m => m.importedName)
        });
      }

      // ==== ETAPA 3: VERIFICAR ESTRUTURA E CHAMAR FIX-CODE ====
      const projectValidation = validateProject(validatedFiles);
      let finalFiles = validatedFiles;

      // Sempre chamar fix-code para garantir código correto
      console.log(`%c[ChatPanel] 🤖 Chamando fix-code para garantir código válido...`, 'color: #06b6d4; font-weight: bold');
      chatLog.info('Validando e corrigindo código (IA)...');
      
      try {
        const { files: aiFixedFiles, error: aiError } = await fixCodeViaAI(finalFiles.map(f => ({
          path: f.path,
          content: f.content,
          language: f.language
        })));

        if (aiError) {
          console.error('[ChatPanel] Erro no agente fix-code:', aiError);
          chatLog.error('fix-code retornou erro', { error: aiError });
        } else if (aiFixedFiles && aiFixedFiles.length > 0) {
          console.log(`%c[ChatPanel] ✅ fix-code retornou ${aiFixedFiles.length} arquivos`, 'color: #4ade80; font-weight: bold');
          
          finalFiles = aiFixedFiles.map(f => ({
            path: f.path,
            content: f.content,
            language: f.language
          }));

          chatLog.success('Código processado via IA', {
            filesFixed: aiFixedFiles.filter(f => f.wasFixed).length,
            totalFiles: aiFixedFiles.length
          });
        }
      } catch (err) {
        console.error('[ChatPanel] Falha ao chamar fix-code:', err);
        chatLog.error('Falha ao chamar fix-code', { error: String(err) });
        // Continuar com os arquivos originais mesmo se fix-code falhar
      }

      // ==== ETAPA 4: ADICIONAR ARQUIVOS BASE SE FALTAREM ====
      const structureFiles = ensureBaseStructure(finalFiles, projectValidation.structure);
      if (structureFiles.length > 0) {
        console.log(`[ChatPanel] 📦 Adicionados ${structureFiles.length} arquivos de estrutura base`);
      }

      // ==== ETAPA 5: CORRIGIR DEPENDÊNCIAS ====
      const allFiles = fixDependencies([...finalFiles, ...structureFiles]);
      console.log(`[ChatPanel] ⚡ Finalizando ${allFiles.length} arquivos`);

      // ==== ETAPA 6: ADICIONAR AO STORE ====
      for (const file of allFiles) {
        addFile({
          id: crypto.randomUUID(),
          project_id: projectId,
          path: file.path,
          content_text: file.content,
          storage_path: null,
          sha256: null,
          language: file.language,
          is_binary: false,
          size_bytes: new TextEncoder().encode(file.content).length,
          version: 1,
          last_modified_by: user?.id || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }

      // ==== ETAPA 7: SALVAR NO SUPABASE ====
      if (projectId && user) {
        saveFilesBatch(projectId, allFiles)
          .then(result => {
            console.log(`[Supabase] ✓ ${result.saved.length} arquivos salvos`);
            if (result.errors.length > 0) {
              console.error(`[Supabase] ✗ ${result.errors.length} erros:`, result.errors);
            }
          })
          .catch(err => console.error('[Supabase] Batch save failed:', err));
      }

      // ==== ETAPA 8: ESCREVER NO WEBCONTAINER ====
      if (containerStatus === 'ready') {
        console.log(`[ChatPanel] 📝 Escrevendo ${allFiles.length} arquivos no WebContainer...`);
        await Promise.all(
          allFiles.map((file: { path: string; content: string }) =>
            writeToContainer(file.path, file.content)
              .then(() => console.log(`[WebContainer] ✓ ${file.path}`))
              .catch(err => console.error(`[WebContainer] ✗ ${file.path}:`, err))
          )
        );
        console.log(`[ChatPanel] ✅ Todos os arquivos escritos no WebContainer`);
      }

      setFilesCreated(true);
      refreshPreview();

    } catch (error) {
      console.error('Failed to create files:', error);
    } finally {
      setWritingFiles(false);
    }
  }, [extractedFiles, convertToVitePath, addFile, projectId, user, containerStatus, refreshPreview, writeToContainer, ensureBaseStructure, validateProject, validateAndCompleteFiles, fixDependencies, fixCodeViaAI, chatLog]);

  // Image Helper Functions
  const convertImageToWebP = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Resize if too large (max 1200px)
          const MAX_SIZE = 1200;
          if (width > MAX_SIZE || height > MAX_SIZE) {
            if (width > height) {
              height = Math.round((height * MAX_SIZE) / width);
              width = MAX_SIZE;
            } else {
              width = Math.round((width * MAX_SIZE) / height);
              height = MAX_SIZE;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return reject('No context');

          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/webp', 0.8));
        };
        img.onerror = reject;
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }, []);

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Check limit
    if (attachedImages.length + files.length > 5) {
      alert('Máximo de 5 imagens.');
      return;
    }

    const newImages: string[] = [];
    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/')) {
        try {
          const webp = await convertImageToWebP(file);
          newImages.push(webp);
        } catch (err) {
          console.error('Image processing error:', err);
        }

      }
    }

    setAttachedImages(prev => [...prev, ...newImages]);

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [attachedImages.length, convertImageToWebP]);

  const removeAttachedImage = (index: number) => {
    setAttachedImages(prev => prev.filter((_, i) => i !== index));
  };

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;

    // Check if we have any images
    const imageItems = Array.from(items).filter(item => item.type.startsWith('image/'));

    if (imageItems.length > 0) {
      // Don't prevent default immediately if not purely image pasting, 
      // but usually we want to prevent binary data paste

      if (attachedImages.length + imageItems.length > 5) {
        alert('Máximo de 5 imagens.');
        return;
      }

      const newImages: string[] = [];
      for (const item of imageItems) {
        const file = item.getAsFile();
        if (file) {
          try {
            const webp = await convertImageToWebP(file);
            newImages.push(webp);
          } catch (err) {
            console.error('Paste image error:', err);
          }
        }
      }

      if (newImages.length > 0) {
        e.preventDefault(); // Remove o arquivo da colagem para não virar texto
        setAttachedImages(prev => [...prev, ...newImages]);
      }
    }
  }, [attachedImages.length, convertImageToWebP]);

  // Function to stop the streaming response
  const handleStopStream = useCallback(() => {
    if (abortControllerRef.current) {
      console.log('[ChatPanel] Stopping stream...');
      abortControllerRef.current.abort();
      abortControllerRef.current = null;

      // Add partial response as message if there's content
      if (streamingContent.trim()) {
        const partialMessage: ChatMessage = {
          id: crypto.randomUUID(),
          project_id: projectId,
          thread_id: currentThread?.id || '',
          role: 'assistant',
          content: streamingContent + '\n\n*[Resposta interrompida pelo usuário]*',
          content_json: null,
          attachments: null,
          created_by: null,
          created_at: new Date().toISOString(),
        };
        addMessage(partialMessage);
      }

      setIsStreaming(false);
      setStreamingContent('');
      setThinkingSteps([]);
    }
  }, [streamingContent, projectId, currentThread?.id, addMessage, setIsStreaming, setStreamingContent]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!input.trim() || isStreaming) return;

      chatLog.info('📤 Enviando mensagem', { prompt: input.trim().substring(0, 100) + '...' });

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        project_id: projectId,
        thread_id: currentThread?.id || '',
        role: 'user',
        content: input.trim(),
        content_json: null,
        attachments: attachedImages.length > 0 ? { images: attachedImages } : null,
        created_by: user?.id || null,
        created_at: new Date().toISOString(),
      };

      addMessage(userMessage);
      setInput('');
      setAttachedImages([]); // Clear images after sending
      setIsStreaming(true);
      setStreamingContent('');
      setExtractedFiles([]);
      setFilesCreated(false);

      // Create new AbortController for this request
      abortControllerRef.current = new AbortController();

      try {
        // Obter contexto do arquivo ativo para ajudar na correção
        const activeFileContext = activeFile
          ? `\n\nESTADO ATUAL DO ARQUIVO ${activeFile.path}:\n\`\`\`tsx\n${editorContent[activeFile.id] || activeFile.content_text || ''}\n\`\`\``
          : '';

        // Contexto do Visual Edits - arquivo selecionado para edição cirúrgica
        let surgicalContext = '';
        if (selectedTargetFile) {
          const targetFile = files.find(f => f.path === selectedTargetFile);
          if (targetFile) {
            const targetContent = editorContent[targetFile.id] || targetFile.content_text || '';
            surgicalContext = `\n\n## 🎯 MODO EDIÇÃO VISUAL - ARQUIVO ALVO
Você DEVE editar APENAS este arquivo: **${selectedTargetFile}**

### Conteúdo atual do arquivo:
\`\`\`tsx
// ${selectedTargetFile}
${targetContent}
\`\`\`

**INSTRUÇÕES:**
- Edite APENAS o arquivo acima
- NÃO crie novos arquivos
- NÃO modifique outros arquivos
- Retorne o arquivo completo com as melhorias solicitadas`;
          }
        }

        const finalPrompt = input.trim() + activeFileContext + surgicalContext;

        if (user && currentThread) {
          chatLog.info('🔐 Modo autenticado - usando fluxo completo');
          chatLog.time('full-response');

          let finalPromptForCode = finalPrompt;

          // STEP 1: Analyze images if present (GLM Vision)
          if (attachedImages.length > 0) {
            setThinkingSteps([{ id: 'analyze', label: '🔍 Analisando imagens...', status: 'running' }]);

            try {
              // Analyze images in PARALLEL for speed
              const imageDescriptions: string[] = [];
              const currentInput = input.trim();
              const currentImages = [...attachedImages];
              let shouldSkipPrd = false;
              let codeErrorAnalysis = '';

              const results = await Promise.all(
                currentImages.map(img =>
                  analyzeImage(img, currentInput).catch(err => {
                    console.warn('[ChatPanel] Erro ao analisar imagem:', err);
                    return null;
                  })
                )
              );

              for (const result of results) {
                if (result?.analysis) {
                  imageDescriptions.push(result.analysis);
                  
                  // Verificar se é imagem com erro de código
                  if (result.type === 'code_error' && result.skipPrd) {
                    shouldSkipPrd = true;
                    codeErrorAnalysis = result.analysis;
                    console.log('[ChatPanel] ⚠️ Imagem com erro de código detectada - pulando PRD');
                  }
                }
              }

              if (imageDescriptions.length > 0) {
                finalPromptForCode = `${currentInput}\n\n## Análise das Imagens:\n${imageDescriptions.join('\n\n---\n\n')}`;
              }

              setThinkingSteps(prev => prev.map(s =>
                s.id === 'analyze' ? { ...s, status: 'done' } : s
              ));

              // SE for imagem com erro de código, PULAR generate-prd e ir direto ao chat-stream
              if (shouldSkipPrd) {
                console.log('[ChatPanel] 🚀 Pulando PRD - enviando diretamente para chat-stream');
                
                // Atualizar mensagem do usuário para incluir a análise do erro
                setThinkingSteps(prev => [...prev, { id: 'code', label: '🔧 Analisando erro e gerando correção...', status: 'running' }]);

                // Preparar prompt específico para correção de erro
                const errorFixPrompt = `O usuário enviou uma imagem com um erro de código. Analise e sugira como corrigir.

${codeErrorAnalysis}

${currentInput ? `\n\nMensagem do usuário: ${currentInput}` : ''}

Por favor, identifique o arquivo com erro e forneça o código corrigido.`;

                let errorFixContent = '';
                
                try {
                  await sendChatMessage(
                    projectId,
                    currentThread.id,
                    errorFixPrompt,
                    (delta: string) => {
                      errorFixContent += delta;
                      appendStreamingContent(delta);
                    },
                    (phase?: string) => {
                      if (phase === 'thinking') {
                        setThinkingSteps(prev => prev.map(s =>
                          s.id === 'code' ? { ...s, label: '💭 Pensando...', status: 'running' } : s
                        ));
                      }
                    },
                    () => {
                      // Done - add message and extract files
                      const assistantMessage: ChatMessage = {
                        id: crypto.randomUUID(),
                        project_id: projectId,
                        thread_id: currentThread.id,
                        role: 'assistant',
                        content: errorFixContent,
                        content_json: null,
                        attachments: null,
                        created_by: null,
                        created_at: new Date().toISOString(),
                      };
                      addMessage(assistantMessage);
                      setStreamingContent('');
                      
                      // Extract files from response
                      const extracted = extractFilesFromContent(errorFixContent);
                      if (extracted.length > 0) {
                        setExtractedFiles(extracted);
                        console.log(`[ChatPanel] 📁 ${extracted.length} arquivos extraídos da correção`);
                      }
                      
                      setThinkingSteps(prev => prev.map(s =>
                        s.id === 'code' ? { ...s, status: 'done' } : s
                      ));
                      setIsStreaming(false);
                    },
                    (error: Error) => {
                      console.error('[ChatPanel] Erro no stream para correção:', error);
                      setThinkingSteps(prev => prev.map(s =>
                        s.id === 'code' ? { ...s, status: 'error' } : s
                      ));
                      setIsStreaming(false);
                    },
                    undefined, // images
                    abortControllerRef.current?.signal
                  );
                } catch (streamError) {
                  console.error('[ChatPanel] Erro no stream para correção:', streamError);
                  setIsStreaming(false);
                }
                return; // Sair do fluxo - já processou
              }
            } catch (err) {
              console.warn('[ChatPanel] Erro na análise de imagens:', err);
              setThinkingSteps(prev => prev.map(s =>
                s.id === 'analyze' ? { ...s, status: 'error' } : s
              ));
            }
          }

          // STEP 2: Generate PRD (streaming) - só executa se não pulou acima
          setThinkingSteps(prev => [...prev, { id: 'prd', label: '📝 Gerando PRD...', status: 'running' }]);

          let prdContent = '';
          let prdMetadata: any = null; // Capturar metadados do PRD
          try {
            const prdResult = await generatePRD(
              projectId,
              finalPromptForCode,
              undefined, // context
              (delta) => {
                prdContent += delta;
                // Show PRD generation progress
              },
              () => {
                // Status callback
              },
              (prd, metadata) => {
                prdContent = prd;
                prdMetadata = metadata; // Salvar metadados
                console.log('[ChatPanel] PRD Metadata:', metadata);
                setThinkingSteps(prev => prev.map(s =>
                  s.id === 'prd' ? { ...s, status: 'done' } : s
                ));
              },
              (error) => {
                console.error('[ChatPanel] PRD error:', error);
                setThinkingSteps(prev => prev.map(s =>
                  s.id === 'prd' ? { ...s, status: 'error' } : s
                ));
              }
            );
            // Também capturar do retorno direto (fallback)
            if (prdResult?.metadata && !prdMetadata) {
              prdMetadata = prdResult.metadata;
            }
          } catch (err) {
            console.warn('[ChatPanel] PRD generation failed, using original prompt:', err);
            prdContent = finalPromptForCode; // Fallback to original prompt
          }

          // STEP 3: Generate Code (Gemini, streaming)
          setThinkingSteps(prev => [...prev, { id: 'code', label: '💻 Gerando código...', status: 'running' }]);

          let fullContent = '';
          const codePrompt = prdContent
            ? `## PRD (Documento de Requisitos):\n${prdContent}\n\n## INSTRUÇÃO:\nImplemente o PRD acima gerando o código completo.`
            : finalPromptForCode;

          await sendChatMessage(
            projectId,
            currentThread.id,
            codePrompt,
            (delta: string) => {
              fullContent += delta;
              appendStreamingContent(delta);
              setThinkingSteps(prev => prev.map(s =>
                s.id === 'code' ? { ...s, status: 'done' } : s
              ));
            },
            (phase?: string) => {
              if (phase === 'thinking') {
                setThinkingSteps(prev => prev.map(s =>
                  s.id === 'code' ? { ...s, label: '💻 Pensando...', status: 'running' } : s
                ));
              }
            },
            () => {
              // STEP 4: Add message and auto-save files
              setThinkingSteps(prev => [...prev, { id: 'saving', label: '✅ Salvando arquivos...', status: 'running' }]);

              const assistantMessage: ChatMessage = {
                id: crypto.randomUUID(),
                project_id: projectId,
                thread_id: currentThread.id,
                role: 'assistant',
                content: fullContent,
                content_json: null,
                attachments: null,
                created_by: null,
                created_at: new Date().toISOString(),
              };
              addMessage(assistantMessage);
              setStreamingContent('');

              // Extract files WITHOUT auto-save (user must approve)
              let extracted = extractFilesFromContent(fullContent);

              // 🛡️ GATE DE ENFORCEMENT: Filtrar arquivos fora do escopo
              if (selectedTargetFile && extracted.length > 0) {
                const allowedPaths = new Set([selectedTargetFile]);
                const beforeCount = extracted.length;

                const filtered = extracted.filter(f => {
                  const isAllowed = allowedPaths.has(f.path);
                  if (!isAllowed) {
                    console.warn(`[SCOPE_VIOLATION] ⛔ Arquivo REJEITADO: ${f.path} (não está em allowed_paths)`);
                  }
                  return isAllowed;
                });

                const rejected = beforeCount - filtered.length;
                if (rejected > 0) {
                  console.warn(`[ENFORCEMENT] 🛡️ Gate ativado: ${rejected} arquivo(s) BLOQUEADO(S) por violação de escopo`);
                  // Adicionar mensagem de aviso ao chat
                  const warningMessage: ChatMessage = {
                    id: crypto.randomUUID(),
                    project_id: projectId,
                    thread_id: currentThread.id,
                    role: 'assistant',
                    content: `⚠️ **Aviso de Escopo:** A IA tentou modificar ${rejected} arquivo(s) fora do escopo permitido. Apenas o arquivo \`${selectedTargetFile}\` foi aceito.`,
                    content_json: null,
                    attachments: null,
                    created_by: null,
                    created_at: new Date().toISOString(),
                  };
                  addMessage(warningMessage);
                }

                extracted = filtered;
              }

              if (extracted.length > 0) {
                console.log(`[ChatPanel] ${extracted.length} arquivos detectados (aguardando aprovação)`);
                setExtractedFiles(extracted);
                setFilesCreated(false);
                // NÃO chamar handleCreateFiles - usuário deve aprovar
              }

              setThinkingSteps(prev => prev.map(s =>
                s.id === 'saving' ? { ...s, status: 'done' } : s
              ));

              // CRÍTICO: Limpar estado de streaming para UI não ficar travada
              setIsStreaming(false);
              abortControllerRef.current = null; // Clear abort controller

              // Limpar target após uso
              if (selectedTargetFile) {
                setSelectedTargetFile(null);
              }

              // Limpar steps após um pequeno delay para o usuário ver a conclusão
              setTimeout(() => {
                setThinkingSteps([]);
              }, 1500);

              chatLog.timeEnd('full-response');
            },
            (error: Error) => {
              console.error('Chat error:', error);
              setIsStreaming(false);
              setStreamingContent('');
              abortControllerRef.current = null; // Clear abort controller
            },
            attachedImages.length > 0 ? attachedImages : undefined,
            abortControllerRef.current?.signal, // Pass abort signal
            // Surgical mode targets
            selectedTargetFile ? { paths: [selectedTargetFile] } : undefined,
            selectedTargetFile ? 'surgical' : undefined,
            // PRD Metadata para arquitetura dinâmica
            prdMetadata || undefined
          );
          // Clear attached images after sending
          setAttachedImages([]);
        } else {
          // Demo mode - use local API route
          const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId, message: userMessage.content }),
          });

          if (!response.ok) {
            const errBody = await response.json();
            throw new Error(errBody.error || 'Failed to send message');
          }

          const reader = response.body?.getReader();
          if (!reader) throw new Error('No response body');

          const decoder = new TextDecoder();
          let fullContent = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') continue;
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.type === 'message_delta' && parsed.data?.text) {
                    fullContent += parsed.data.text;
                    appendStreamingContent(parsed.data.text);
                    // Se recebemos texto, o pensamento acabou
                    setThinkingSteps(prev =>
                      prev.map(s => s.id === 'thinking' ? { ...s, status: 'done' } : s)
                    );
                  } else if (parsed.type === 'status_update') {
                    if (parsed.data?.phase === 'thinking') {
                      setThinkingSteps([{ id: 'thinking', label: 'Pensando...', status: 'running' }]);
                    }
                  } else if (parsed.type === 'error') {
                    throw new Error(parsed.data?.message || 'Stream error');
                  }
                } catch {
                  // Skip invalid JSON
                }
              }
            }
          }

          const assistantMessage: ChatMessage = {
            id: crypto.randomUUID(),
            project_id: projectId,
            thread_id: '',
            role: 'assistant',
            content: fullContent,
            content_json: null,
            attachments: null,
            created_by: null,
            created_at: new Date().toISOString(),
          };
          addMessage(assistantMessage);
          setIsStreaming(false);
          setStreamingContent('');

            // IMPERATIVE AUTO-SAVE: Extract and create files immediately (Demo mode)
          const extracted = extractFilesFromContent(fullContent);
          if (extracted.length > 0) {
            console.log(`[ChatPanel] Auto-salvando ${extracted.length} arquivos (Demo)`);
            setExtractedFiles(extracted);
            setFilesCreated(false);
            // Await para garantir que o processo termine antes de liberar o estado
            handleCreateFiles(extracted).catch(err => {
              console.error('[ChatPanel] Auto-save error:', err);
              chatLog.error('Erro no auto-save', { error: String(err) });
            });
          }
        }
      } catch (error) {
        console.error('Chat error:', error);
        const errorMessage: ChatMessage = {
          id: crypto.randomUUID(),
          project_id: projectId,
          thread_id: currentThread?.id || '',
          role: 'assistant',
          content: `Erro: ${error instanceof Error ? error.message : 'Erro desconhecido'}. Verifique suas chaves de API.`,
          content_json: null,
          attachments: null,
          created_by: null,
          created_at: new Date().toISOString(),
        };
        addMessage(errorMessage);
        setIsStreaming(false);
        setStreamingContent('');
      }
    },
    [
      input,
      isStreaming,
      projectId,
      user,
      currentThread,
      addMessage,
      setIsStreaming,
      setStreamingContent,
      appendStreamingContent,
    ]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };



  const quickActions = [
    { label: 'Criar landing page', prompt: 'Crie uma landing page moderna para um SaaS' },
    { label: 'Dashboard admin', prompt: 'Crie um dashboard administrativo com gráficos' },
    { label: 'Formulário de contato', prompt: 'Crie um formulário de contato com validação' },
    { label: 'Página de login', prompt: 'Crie uma página de login com autenticação' },
  ];

  return (
    <div className="h-full flex flex-col bg-zinc-900 border-l border-zinc-800">
      {/* Header */}
      <div className="h-14 border-b border-white/5 flex items-center justify-between px-6 shrink-0 bg-zinc-900/60 backdrop-blur-xl z-10">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 bg-violet-500/20 blur-md rounded-full animate-pulse" />
            <Sparkles className="h-5 w-5 text-violet-400 relative z-10" />
          </div>
          <span className="font-semibold text-zinc-100 tracking-tight">AI Assistant</span>
        </div>
        {activeAgentRun && (
          <Badge variant="secondary" className="animate-pulse bg-violet-500/10 text-violet-400 border border-violet-500/20 px-2 py-0.5">
            <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
            Processando
          </Badge>
        )}
        {!user && (
          <Badge variant="outline" className="text-xs border-amber-500/50 text-amber-400">
            Demo
          </Badge>
        )}
      </div>

      {/* Messages - SCROLL CORRIGIDO */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-4"
        style={{ overflowY: 'auto', maxHeight: 'calc(100% - 12rem)' }}
      >
        {messages.length === 0 && !isStreaming ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6">
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="relative mb-8"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-violet-500/30 to-fuchsia-500/30 blur-2xl rounded-full scale-150 animate-pulse" />
              <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-pink-500 flex items-center justify-center shadow-2xl shadow-violet-500/40 transform -rotate-3 hover:rotate-0 transition-transform duration-500">
                <Bot className="h-10 w-10 text-white drop-shadow-md" />
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.4 }}
            >
              <h3 className="text-2xl font-bold mb-3 bg-clip-text text-transparent bg-gradient-to-b from-white to-white/60">
                Como posso ajudar?
              </h3>
              <p className="text-[15px] text-zinc-400 mb-10 max-w-[280px] leading-relaxed">
                Descreva o app que você quer criar e eu vou gerar o código para você.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="grid grid-cols-1 gap-2.5 w-full max-w-[340px]"
            >
              {quickActions.map((action, idx) => (
                <button
                  key={action.label}
                  className="group relative flex items-center justify-between p-3.5 rounded-2xl bg-zinc-800/20 backdrop-blur-md border border-white/5 hover:border-violet-500/30 hover:bg-zinc-800/40 transition-all duration-300 text-left"
                  onClick={() => setInput(action.prompt)}
                >
                  <span className="text-sm text-zinc-300 group-hover:text-white transition-colors">{action.label}</span>
                  <Plus className="h-4 w-4 text-zinc-500 group-hover:text-violet-400 group-hover:rotate-90 transition-all duration-300" />
                </button>
              ))}
            </motion.div>
          </div>
        ) : (
          <div className="space-y-6">
            {messages.map((message) => {
              // Extract files for this message if any
              const msgFiles = extractFilesFromContent(message.content || '').map(f => ({
                path: f.path,
                action: 'created' as const,
                language: f.language
              }));

              return (
                <ThreadMessage
                  key={message.id}
                  role={message.role as 'user' | 'assistant'}
                  content={message.content || ''}
                  images={message.role === 'user' ? (message.attachments as any) || undefined : undefined} // Adjust based on your types
                  files={msgFiles}
                  onFileClick={(path) => {
                    const file = files.find(f => f.path === path || f.path.endsWith(path));
                    if (file) {
                      setActiveFile(file);
                      openFile(file);
                    }
                  }}
                />
              );
            })}

            {isStreaming && (
              <ThreadMessage
                role="assistant"
                content={streamingContent}
                isStreaming={true}
                steps={thinkingSteps}
                files={extractedFiles.map(f => ({
                  path: f.path,
                  action: 'created',
                  language: f.language
                }))}
              />
            )}
          </div>
        )}
      </div>

      {/* Arquivos extraídos */}
      {extractedFiles.length > 0 && !filesCreated && (
        <div className="px-4 py-2 border-t border-zinc-800 bg-zinc-800/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-zinc-300">
              <FileCode className="h-4 w-4 text-violet-400" />
              <span>{extractedFiles.length} arquivo(s) detectado(s)</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-violet-400 border-violet-500/30 hover:bg-violet-500/10"
              onClick={() => handleCreateFiles()}
              disabled={writingFiles}
            >
              {writingFiles ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Check className="h-4 w-4 mr-1" />
              )}
              {writingFiles ? 'Criando...' : 'Criar Arquivos'}
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {extractedFiles.map((file, i) => (
              <Badge key={i} variant="secondary" className="bg-zinc-700 text-zinc-300 text-xs">
                {file.path}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {filesCreated && (
        <div className="px-4 py-2 border-t border-zinc-800 bg-green-500/10">
          <div className="flex items-center gap-2 text-sm text-green-400">
            <Check className="h-4 w-4" />
            <span>{extractedFiles.length} arquivo(s) criado(s) com sucesso!</span>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="px-2 pb-4 shrink-0 relative bg-zinc-900">
        {/* Glow behind input area */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[90%] h-px bg-gradient-to-r from-transparent via-violet-500/20 to-transparent" />

        {/* Attached images preview */}
        {attachedImages.length > 0 && (
          <div className="flex flex-wrap gap-2.5 mb-2 px-2">
            {attachedImages.map((img, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="relative group"
              >
                <img
                  src={img}
                  alt={`Anexo ${idx + 1}`}
                  className="w-14 h-14 rounded-xl object-cover border border-zinc-700 shadow-md"
                />
                <button
                  type="button"
                  onClick={() => removeAttachedImage(idx)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-zinc-900 border border-zinc-700 text-zinc-400 hover:text-white hover:bg-red-500 flex items-center justify-center text-[10px] shadow-sm transition-all"
                >
                  ×
                </button>
              </motion.div>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="w-full">
          <div className="relative group/input">
            {/* Input Glass Effect Container */}
            <div className="absolute -inset-0.5 bg-gradient-to-r from-violet-500/20 to-fuchsia-500/20 rounded-2xl blur opacity-0 group-focus-within/input:opacity-100 transition duration-500" />

            <div className="relative bg-zinc-900/60 backdrop-blur-xl border border-white/5 rounded-2xl overflow-hidden shadow-2xl transition-all focus-within:border-white/10 focus-within:bg-zinc-900/80">
              {/* Hidden file input for image upload */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleImageUpload}
              />

              {/* Selected Target Badge */}
              {selectedTargetFile && (
                <div className="flex items-center gap-2 px-3 py-2 bg-cyan-900/30 border-b border-cyan-700/30">
                  <MousePointerClick className="h-3.5 w-3.5 text-cyan-400" />
                  <span className="text-xs text-cyan-400">Editando:</span>
                  <span className="text-xs text-white font-mono bg-cyan-800/50 px-2 py-0.5 rounded">
                    {selectedTargetFile.split('/').pop()}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedTargetFile(null)}
                    className="text-cyan-400 hover:text-white p-0.5 ml-auto"
                    title="Limpar seleção"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}

              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder="Descreva o que você quer criar..."
                className="w-full min-h-[50px] max-h-[200px] bg-transparent border-none focus-visible:ring-0 px-4 py-3 resize-none text-[15px] text-zinc-100 placeholder:text-zinc-500"
                disabled={isStreaming}
              />

              <div className="px-2 pb-2 flex items-center gap-1">
                {/* Left Actions Group */}
                <div className="flex items-center mr-auto">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-zinc-400 hover:text-zinc-100 hover:bg-white/5 rounded-lg"
                        disabled={isStreaming}
                      >
                        <Plus className="h-4.5 w-4.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56 bg-zinc-900 border-white/10 rounded-xl shadow-2xl">
                      <DropdownMenuItem
                        onClick={() => setInput(input + '\n\nCrie um novo componente React com TypeScript e Tailwind CSS para: ')}
                        className="p-2.5 text-zinc-200 focus:bg-white/5 focus:text-white cursor-pointer"
                      >
                        <Code className="h-4 w-4 mr-3 text-violet-400" />
                        <span className="text-sm font-medium">Criar Componente</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setInput(input + '\n\nCrie uma nova página Next.js com: ')}
                        className="p-2.5 text-zinc-200 focus:bg-white/5 focus:text-white cursor-pointer"
                      >
                        <Layout className="h-4 w-4 mr-3 text-blue-400" />
                        <span className="text-sm font-medium">Criar Página</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-zinc-400 hover:text-zinc-100 hover:bg-white/5 rounded-lg"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isStreaming}
                    title="Anexar imagem"
                  >
                    <ImageIcon className="h-4.5 w-4.5" />
                  </Button>

                  {/* Visual Edits Toggle Button */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={toggleVisualEditMode}
                    className={cn(
                      'h-8 px-2 gap-1.5 rounded-lg text-xs font-medium transition-colors',
                      isVisualEditMode
                        ? 'bg-cyan-600 text-white hover:bg-cyan-500'
                        : 'text-zinc-400 hover:text-white hover:bg-zinc-700/50'
                    )}
                    disabled={isStreaming}
                    title={isVisualEditMode ? "Desativar modo visual" : "Ativar modo visual - Clique no preview para selecionar"}
                  >
                    <MousePointerClick className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Visual</span>
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "h-8 w-8 rounded-lg transition-colors ml-1",
                      isFixing ? "text-violet-300 bg-violet-500/10" : "text-zinc-400 hover:text-violet-400 hover:bg-violet-500/10"
                    )}
                    disabled={isStreaming || isFixing || files.length === 0}
                    title="Corrigir erros (Agente)"
                    onClick={async () => {
                      if (!files.length) return;
                      setIsFixing(true);
                      try {
                        const filesToFix = files.map(f => ({
                          path: f.path,
                          content: f.content_text || '',
                          language: f.language || 'text'
                        }));

                        console.log(`[FixCode] Enviando ${filesToFix.length} arquivos para correção...`);
                        const result = await fixCodeViaAI(filesToFix);

                        if (result.error) {
                          throw new Error(result.error);
                        }

                        const fixedFiles = result.files.filter((f: any) => f.wasFixed);
                        const fixedCount = fixedFiles.length;

                        if (fixedCount > 0) {
                          console.log(`[FixCode] ${fixedCount} arquivos corrigidos, aplicando...`);

                          // 1. Primeiro, atualizar TODOS os arquivos no store (síncrono)
                          for (const fixedFile of fixedFiles) {
                            const existingFile = files.find(f => f.path === fixedFile.path);
                            if (existingFile) {
                              updateFile(existingFile.id, { content_text: fixedFile.content });
                              console.log(`[FixCode] ✓ ${fixedFile.path} atualizado no store`);
                            }
                          }

                          // 2. Depois, escrever TODOS no WebContainer em paralelo e AGUARDAR
                          if (containerStatus === 'ready') {
                            console.log(`[FixCode] Escrevendo ${fixedCount} arquivos no WebContainer...`);
                            
                            const writeResults = await Promise.allSettled(
                              fixedFiles.map(async (fixedFile: any) => {
                                try {
                                  await writeToContainer(fixedFile.path, fixedFile.content);
                                  console.log(`[FixCode] ✓ ${fixedFile.path} escrito no WebContainer`);
                                  return fixedFile.path;
                                } catch (err) {
                                  console.warn(`[FixCode] ✗ Falha ao escrever ${fixedFile.path}:`, err);
                                  throw err;
                                }
                              })
                            );

                            const successCount = writeResults.filter(r => r.status === 'fulfilled').length;
                            const failCount = writeResults.filter(r => r.status === 'rejected').length;
                            console.log(`[FixCode] WebContainer: ${successCount} sucesso, ${failCount} falhas`);
                          }

                          // 3. Mostrar mensagem de sucesso com detalhes
                          const fixDetails = fixedFiles.map((f: any) =>
                            `• **${f.path}**: ${f.fixes.join(', ')}`
                          ).join('\n');

                          addMessage({
                            id: crypto.randomUUID(),
                            project_id: projectId,
                            thread_id: currentThread?.id || '',
                            role: 'assistant',
                            content: `✅ **${fixedCount} arquivo(s) corrigido(s)**\n\n${fixDetails}\n\n*Arquivos atualizados no editor e preview.*`,
                            created_at: new Date().toISOString(),
                            content_json: null,
                            attachments: null,
                            created_by: null
                          } as ChatMessage);

                          // 4. Agora sim, atualizar preview DEPOIS que tudo foi escrito
                          console.log(`[FixCode] ✅ Todas as escritas completadas, atualizando preview...`);
                          refreshPreview();

                        } else {
                          // Caso onde NENHUM arquivo foi retornado como "fixed"
                          // Mas precisamos saber se foi porque estava tudo certo ou porque a IA falhou.
                          
                          if ((result.syntaxErrorsFound || 0) > 0) {
                             addMessage({
                              id: crypto.randomUUID(),
                              project_id: projectId,
                              thread_id: currentThread?.id || '',
                              role: 'assistant',
                              content: `⚠️ **Atenção:** Foram detectados ${(result.syntaxErrorsFound || 0)} erro(s) de sintaxe, mas a IA não retornou correções. Isso pode indicar uma falha na geração. Tente novamente.`,
                              created_at: new Date().toISOString(),
                              content_json: null,
                              attachments: null,
                              created_by: null
                            } as ChatMessage);
                          } else {
                            addMessage({
                              id: crypto.randomUUID(),
                              project_id: projectId,
                              thread_id: currentThread?.id || '',
                              role: 'assistant',
                              content: `✅ Nenhum erro de sintaxe encontrado nos arquivos.`,
                              created_at: new Date().toISOString(),
                              content_json: null,
                              attachments: null,
                              created_by: null
                            } as ChatMessage);
                          }
                        }
                        
                        // Pequeno delay para garantir que o usuário veja o estado final antes de liberar o botão
                        await new Promise(resolve => setTimeout(resolve, 1500));

                      } catch (error) {
                        console.error('[FixCode] Erro:', error);
                        addMessage({
                          id: crypto.randomUUID(),
                          project_id: projectId,
                          thread_id: currentThread?.id || '',
                          role: 'assistant',
                          content: `❌ Erro ao corrigir código: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
                          created_at: new Date().toISOString(),
                          content_json: null,
                          attachments: null,
                          created_by: null
                        } as ChatMessage);
                      } finally {
                        setIsFixing(false);
                      }
                    }}
                  >
                    {isFixing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4.5 w-4.5" />}
                  </Button>
                </div>

                {/* Right Action: Send or Stop */}
                {isStreaming ? (
                  <Button
                    type="button"
                    size="icon"
                    className="rounded-xl h-8 w-8 bg-red-500 hover:bg-red-600 text-white shadow-md transition-all active:scale-95"
                    onClick={handleStopStream}
                    title="Parar geração"
                  >
                    <StopCircle className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    size="icon"
                    className="rounded-xl h-8 w-8 bg-zinc-100 hover:bg-white text-zinc-900 shadow-md transition-all active:scale-95 disabled:opacity-50"
                    disabled={!input.trim()}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}



