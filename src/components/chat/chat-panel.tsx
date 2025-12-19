'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useIDEStore } from '@/stores/ide-store';
import { useAuth } from '@/lib/auth/auth-provider';
import { sendChatMessage, getOrCreateChatThread, getChatMessages, saveFile } from '@/lib/api/project-service';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import type { ChatMessage } from '@/types/database';
import { useWebContainer } from '@/lib/webcontainer';
import { useCodeFixer } from '@/hooks/useCodeFixer';
import { chatLog, extractLog } from '@/lib/debug/logger';
import { validateAndCompleteFiles, fixAllFiles, fixJSXSyntax as fixSyntax } from '@/lib/code-validation';

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
      
      // Validar e corrigir código básico
      const validatedCode = validateAndFixCode(code, language);
      
      files.push({
        path: cleanPath,
        content: validatedCode,
        language,
      });
      
      console.log(`[extractFilesFromContent] Arquivo detectado: ${cleanPath}`);
    }
  }
  
  console.log(`[extractFilesFromContent] Total de arquivos extraídos: ${files.length}`);
  return files;
}

// Validação e correção robusta de código usando o módulo syntax-fixer

function validateAndFixCode(code: string, language: string): string {
  // Usar o módulo syntax-fixer para correções de JSX/TSX
  if (['tsx', 'jsx', 'ts', 'js', 'typescript', 'javascript'].includes(language)) {
    const result = fixSyntax(code, `file.${language}`);
    if (result.fixed && result.fixes.length > 0) {
      console.log(`[validateAndFixCode] Correções aplicadas:`, result.fixes);
    }
    return result.code;
  }
  
  let fixed = code;
  
  // Para HTML, garantir espaços entre atributos
  if (language === 'html' || fixed.includes('<!DOCTYPE') || fixed.includes('<html')) {
    // Corrigir atributos concatenados sem espaço
    fixed = fixed.replace(/(\w+="[^"]*")(\w+=")/g, '$1 $2');
    fixed = fixed.replace(/(\w+='[^']*')(\w+=')/g, '$1 $2');
    
    // Corrigir /> colado ao atributo
    fixed = fixed.replace(/(\w+="[^"]*")(\/\>)/g, '$1 $2');
    fixed = fixed.replace(/(\w+='[^']*')(\/\>)/g, '$1 $2');
    
    // Garantir espaço antes de />
    fixed = fixed.replace(/([^\s])\/\>/g, '$1 />');
    
    // Adicionar crossorigin a scripts externos CDN
    fixed = fixed.replace(/<script src="(https?:\/\/[^"]+)"\>/g, '<script src="$1" crossorigin>');
    fixed = fixed.replace(/<link([^>]*) href="(https?:\/\/[^"]+)"([^>]*)\>/g, (match, before, url, after) => {
      if (match.includes('crossorigin')) return match;
      return `<link${before} href="${url}"${after} crossorigin>`;
    });
  }
  
  return fixed;
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
  } = useIDEStore();

  // Hook do WebContainer para escrever arquivos diretamente
  const { updateFile: writeToContainer, status: containerStatus } = useWebContainer({});
  
  // Hook do agente de correção de código
  const { fixCode, isFixing, errors, analyzeCode, requestAIFix } = useCodeFixer();

  const [input, setInput] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [extractedFiles, setExtractedFiles] = useState<ExtractedFile[]>([]);
  const [filesCreated, setFilesCreated] = useState(false);
  const [writingFiles, setWritingFiles] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

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
      convertedContent = convertedContent.replace(/<Link\s+href={?(['"])([^'"]+)\1}?>/g, '<a href="$2">');
      convertedContent = convertedContent.replace(/<\/Link>/g, '</a>');
    }

    // 4. Substituir <Image ... /> por <img ... />
    convertedContent = convertedContent.replace(/<Image\s+/g, '<img ');

    return { path: convertedPath, content: convertedContent };
  }, []);

  // Criar arquivos extraídos - ESCREVE NO STORE E NO WEBCONTAINER
  // AGORA COM VALIDAÇÃO DE IMPORTS E GERAÇÃO DE STUBS
  const handleCreateFiles = useCallback(async (filesToCreate?: ExtractedFile[]) => {
    const targets = filesToCreate && Array.isArray(filesToCreate) ? filesToCreate : extractedFiles;
    if (targets.length === 0) return;
    
    setWritingFiles(true);
    
    try {
      // ETAPA 1: Corrigir sintaxe de todos os arquivos PRIMEIRO
      const { files: syntaxFixedFiles, totalFixes, fixesByFile } = fixAllFiles(
        targets.map(f => ({ path: f.path, content: f.content, language: f.language }))
      );
      
      if (totalFixes > 0) {
        console.log(`[ChatPanel] 🔧 ${totalFixes} correções de sintaxe aplicadas`);
        chatLog.info(`Correções de sintaxe aplicadas`, { fixesByFile });
      }

      // ETAPA 2: Validar imports e gerar stubs para componentes faltantes
      const { files: validatedFiles, stubsGenerated, validation } = validateAndCompleteFiles(syntaxFixedFiles);
      
      if (stubsGenerated > 0) {
        console.log(`[ChatPanel] ⚠️ ${stubsGenerated} componentes stub gerados para imports faltantes`);
        chatLog.warn(`Gerados ${stubsGenerated} componentes placeholder`, {
          missing: validation.missingImports.map(m => m.importedName)
        });
      }
      
      const createdFiles: string[] = [];
      
      for (const file of validatedFiles) {
        // Converter path Next.js → Vite
        const { path: convertedPath, content: convertedContent } = convertToVitePath(file.path, file.content);
        
        console.log(`[ChatPanel] Convertendo: ${file.path} → ${convertedPath}`);
        
        // 1. Adicionar ao store do IDE (Estado local)
        addFile({
          id: crypto.randomUUID(),
          project_id: projectId,
          path: convertedPath,
          content_text: convertedContent,
          storage_path: null,
          sha256: null,
          language: file.language,
          is_binary: false,
          size_bytes: new TextEncoder().encode(convertedContent).length,
          version: 1,
          last_modified_by: user?.id || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        // 2. Salvar no Supabase (Persistência)
        if (projectId && user) {
          try {
            await saveFile(projectId, convertedPath, convertedContent);
            console.log(`[Supabase] Arquivo salvo: ${convertedPath}`);
          } catch (err) {
            console.error(`[Supabase] Erro ao salvar ${convertedPath}:`, err);
            // Não falhar o fluxo inteiro se o save falhar, mas logar
          }
        }

        // 3. Escrever no WebContainer (se estiver pronto)
        if (containerStatus === 'ready') {
          try {
            await writeToContainer(convertedPath, convertedContent);
            console.log(`[WebContainer] Arquivo escrito: ${convertedPath}`);
            createdFiles.push(convertedPath);
          } catch (err) {
            console.error(`[WebContainer] Erro ao escrever ${convertedPath}:`, err);
          }
        }
      }
      
      setFilesCreated(true);
      
      // 4. Atualizar preview se arquivos foram escritos
      if (createdFiles.length > 0 && containerStatus === 'ready') {
        // Pequeno delay para garantir que arquivos foram salvos
        setTimeout(() => {
          refreshPreview();
          console.log('[ChatPanel] Preview atualizado após criação de arquivos');
        }, 500);
      }
    } catch (error) {
      console.error('Erro ao criar arquivos:', error);
    } finally {
      setWritingFiles(false);
    }
  }, [extractedFiles, addFile, projectId, user, containerStatus, writeToContainer, convertToVitePath, refreshPreview]);

  const [lastProcessedId, setLastProcessedId] = useState<string | null>(null);

  // Extrair arquivos quando streaming terminar - AGORA SALVA AUTOMATICAMENTE
  useEffect(() => {
    if (!isStreaming && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === 'assistant' && lastMessage.content && lastMessage.id !== lastProcessedId) {
        const extracted = extractFilesFromContent(lastMessage.content);
        if (extracted.length > 0) {
          console.log(`[ChatPanel] Auto-salvando ${extracted.length} arquivos da mensagem ${lastMessage.id}`);
          setLastProcessedId(lastMessage.id);
          setExtractedFiles(extracted);
          setFilesCreated(false);
          // Chamada automática para criar arquivos
          handleCreateFiles(extracted);
        }
      }
    }
  }, [isStreaming, messages, handleCreateFiles, lastProcessedId]);

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
        attachments: null,
        created_by: user?.id || null,
        created_at: new Date().toISOString(),
      };

      addMessage(userMessage);
      setInput('');
      setIsStreaming(true);
      setStreamingContent('');
      setExtractedFiles([]);
      setFilesCreated(false);

      try {
        // Obter contexto do arquivo ativo para ajudar na correção
        const activeFileContext = activeFile 
          ? `\n\nESTADO ATUAL DO ARQUIVO ${activeFile.path}:\n\`\`\`tsx\n${editorContent[activeFile.id] || activeFile.content_text || ''}\n\`\`\``
          : '';

        const finalPrompt = input.trim() + activeFileContext;

        if (user && currentThread) {
          chatLog.info('🔐 Modo autenticado - usando Supabase Edge Function');
          chatLog.time('chat-response');
          let fullContent = '';
          await sendChatMessage(
            projectId,
            currentThread.id,
            finalPrompt,
            (delta: string) => {
              fullContent += delta;
              appendStreamingContent(delta);
            },
            () => {
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
              setIsStreaming(false);
              setStreamingContent('');
            },
            (error: Error) => {
              console.error('Chat error:', error);
              setIsStreaming(false);
              setStreamingContent('');
            }
          );
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
      <div className="h-12 border-b border-zinc-800 flex items-center justify-between px-4 shrink-0 bg-zinc-900/80 backdrop-blur">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-violet-400" />
          <span className="font-medium text-zinc-100">AI Assistant</span>
        </div>
        {activeAgentRun && (
          <Badge variant="secondary" className="animate-pulse bg-violet-500/20 text-violet-300">
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            {activeAgentRun.agent_type}
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
        className="flex-1 overflow-y-auto p-4 space-y-4"
        style={{ overflowY: 'auto', maxHeight: 'calc(100% - 12rem)' }}
      >
        {messages.length === 0 && !isStreaming ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-8">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center mb-4 shadow-lg shadow-violet-500/25">
              <Bot className="h-8 w-8 text-white" />
            </div>
            <h3 className="text-lg font-semibold mb-2 text-zinc-100">Como posso ajudar?</h3>
            <p className="text-sm text-zinc-400 mb-6 max-w-xs">
              Descreva o app que você quer criar e eu vou gerar o código para você.
            </p>
            <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
              {quickActions.map((action) => (
                <Button
                  key={action.label}
                  variant="outline"
                  size="sm"
                  className="h-auto py-2 px-3 text-xs text-left justify-start border-zinc-700 bg-zinc-800/50 hover:bg-zinc-700 hover:border-violet-500/50 text-zinc-300"
                  onClick={() => setInput(action.prompt)}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            {isStreaming && streamingContent && (
              <div className="flex gap-3">
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className="bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white">
                    <Bot className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 bg-zinc-800 rounded-lg p-3 border border-zinc-700">
                  <div className="prose prose-sm prose-invert max-w-none prose-pre:bg-zinc-900 prose-pre:border prose-pre:border-zinc-700">
                    <ReactMarkdown>{streamingContent}</ReactMarkdown>
                  </div>
                  <span className="inline-block w-2 h-4 bg-violet-500 animate-pulse ml-1" />
                </div>
              </div>
            )}
          </>
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
      <div className="border-t border-zinc-800 p-4 shrink-0 bg-zinc-900">
        <form onSubmit={handleSubmit} className="relative">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Descreva o que você quer criar..."
            className="min-h-[60px] max-h-[120px] pr-24 resize-none bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus:border-violet-500 focus:ring-violet-500/20"
            disabled={isStreaming}
          />
          <div className="absolute bottom-2 right-2 flex items-center gap-1">
            {/* Menu [+] com ações */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/50"
                  disabled={isStreaming}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 bg-zinc-800 border-zinc-700">
                <DropdownMenuItem
                  onClick={() => setInput(input + '\n\nCrie um novo componente React com TypeScript e Tailwind CSS para: ')}
                  className="text-zinc-200 focus:bg-zinc-700 focus:text-white cursor-pointer"
                >
                  <Code className="h-4 w-4 mr-2 text-violet-400" />
                  Criar Componente
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setInput(input + '\n\nCrie uma nova página Next.js com: ')}
                  className="text-zinc-200 focus:bg-zinc-700 focus:text-white cursor-pointer"
                >
                  <Layout className="h-4 w-4 mr-2 text-blue-400" />
                  Criar Página
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setInput(input + '\n\nAdicione uma nova feature: ')}
                  className="text-zinc-200 focus:bg-zinc-700 focus:text-white cursor-pointer"
                >
                  <Zap className="h-4 w-4 mr-2 text-yellow-400" />
                  Adicionar Feature
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setInput(input + '\n\nCrie um arquivo de configuração: ')}
                  className="text-zinc-200 focus:bg-zinc-700 focus:text-white cursor-pointer"
                >
                  <FileText className="h-4 w-4 mr-2 text-green-400" />
                  Criar Config
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "h-8 w-8 hover:bg-violet-500/10",
                isFixing ? "text-violet-300" : "text-violet-400 hover:text-violet-300"
              )}
              disabled={isStreaming || isFixing || files.length === 0}
              title={files.length > 0 ? "Corrigir código dos arquivos" : "Nenhum arquivo no projeto"}
              onClick={async () => {
                // Se não há arquivo ativo, selecionar o primeiro arquivo do projeto
                let targetFile = activeFile;
                if (!targetFile && files.length > 0) {
                  targetFile = files[0];
                  setActiveFile(targetFile);
                  openFile(targetFile);
                }
                
                if (!targetFile) {
                  addMessage({
                    id: crypto.randomUUID(),
                    thread_id: currentThread?.id || '',
                    role: 'assistant',
                    content: '⚠️ Não há arquivos no projeto para corrigir.',
                    created_at: new Date().toISOString(),
                  } as ChatMessage);
                  return;
                }
                
                // Primeiro tenta correção básica
                let fixedCode = await fixCode();
                
                // Se não houver correção básica mas há erros, solicita via IA
                if (!fixedCode && targetFile) {
                  const currentContent = editorContent[targetFile.id] || targetFile.content_text || '';
                  const foundErrors = analyzeCode(currentContent);
                  
                  if (foundErrors.length > 0) {
                    addMessage({
                      id: crypto.randomUUID(),
                      thread_id: currentThread?.id || '',
                      role: 'assistant',
                      content: `🔍 Analisando erros em \`${targetFile.path}\`...\n\n${foundErrors.map(e => `- Linha ${e.line}: ${e.message}`).join('\n')}\n\n⏳ Solicitando correção via IA...`,
                      created_at: new Date().toISOString(),
                    } as ChatMessage);
                    
                    fixedCode = await requestAIFix();
                  }
                }
                
                if (fixedCode && targetFile && containerStatus === 'ready') {
                  await writeToContainer(targetFile.path, fixedCode);
                  addMessage({
                    id: crypto.randomUUID(),
                    thread_id: currentThread?.id || '',
                    role: 'assistant',
                    content: `✅ Código corrigido em \`${targetFile.path}\`\n\n**Correções aplicadas:**\n- Tags self-closing corrigidas\n- Placeholders removidos\n- Sintaxe validada\n- Código atualizado no WebContainer`,
                    created_at: new Date().toISOString(),
                  } as ChatMessage);
                } else if (!fixedCode && targetFile) {
                  addMessage({
                    id: crypto.randomUUID(),
                    thread_id: currentThread?.id || '',
                    role: 'assistant',
                    content: `ℹ️ Nenhum erro detectado em \`${targetFile.path}\``,
                    created_at: new Date().toISOString(),
                  } as ChatMessage);
                }
              }}
            >
              {isFixing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4" />
              )}
            </Button>
            <Button
              type="submit"
              size="icon"
              className="h-8 w-8 bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600"
              disabled={!input.trim() || isStreaming}
            >
              {isStreaming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </form>
        <p className="text-xs text-zinc-500 mt-2 text-center">
          Enter para enviar • Shift+Enter para nova linha
        </p>
      </div>
    </div>
  );
}

// Componente de mensagem compacta
function MessageBubble({ message }: { message: ChatMessage }) {
  const [showCode, setShowCode] = useState(false);
  const isUser = message.role === 'user';
  const content = message.content || '';
  
  // Extrair resumo (texto antes do primeiro bloco de código)
  const codeBlockRegex = /```[\s\S]*?```/g;
  const hasCode = codeBlockRegex.test(content);
  codeBlockRegex.lastIndex = 0;
  
  // Separar texto e código
  const textBeforeCode = content.split('```')[0].trim();
  const codeBlocks = content.match(/```(\w+)?\n([\s\S]*?)```/g) || [];
  
  // Extrair arquivos usando a mesma lógica robusta do painel
  const extractedFilesData = extractFilesFromContent(content);
  const extractedFiles = extractedFilesData.map(f => f.path);

  if (isUser) {
    return (
      <div className="flex gap-3 flex-row-reverse">
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback className="bg-blue-500 text-white">
            <User className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
        <div className="bg-blue-600 text-white rounded-lg p-3 max-w-[85%]">
          <p className="text-sm whitespace-pre-wrap">{content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback className="bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white">
          <Bot className="h-4 w-4" />
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 max-w-[90%]">
        {/* Card principal */}
        <div className="bg-zinc-800 border border-zinc-700 rounded-lg overflow-hidden">
          {/* Resumo */}
          <div className="p-3">
            <p className="text-sm text-zinc-200 whitespace-pre-wrap leading-relaxed">
              {textBeforeCode || content}
            </p>
          </div>

          {/* Lista de arquivos */}
          {extractedFiles.length > 0 && (
            <div className="px-3 pb-3">
              <div className="flex flex-wrap gap-1.5">
                {extractedFiles.map((file, i) => (
                  <Badge
                    key={i}
                    variant="secondary"
                    className="bg-zinc-700/50 text-zinc-300 text-xs px-2 py-0.5"
                  >
                    📄 {file}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Toggle de código */}
          {hasCode && (
            <>
              <div className="border-t border-zinc-700">
                <button
                  onClick={() => setShowCode(!showCode)}
                  className="w-full px-3 py-2 flex items-center justify-between text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50 transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <Code className="h-3.5 w-3.5" />
                    {showCode ? 'Ocultar código' : `Ver código (${codeBlocks.length} arquivo${codeBlocks.length > 1 ? 's' : ''})`}
                  </span>
                  {showCode ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
              </div>

              {/* Código expandido */}
              {showCode && (
                <div className="border-t border-zinc-700 bg-zinc-900/50 max-h-[400px] overflow-auto">
                  <div className="p-3">
                    <div className="prose prose-sm prose-invert max-w-none prose-pre:bg-zinc-950 prose-pre:border prose-pre:border-zinc-700 prose-code:text-violet-300">
                      <ReactMarkdown>
                        {codeBlocks.join('\n\n')}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

