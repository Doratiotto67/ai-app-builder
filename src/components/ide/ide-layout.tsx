'use client';

import { useEffect, useState } from 'react';
import { useIDEStore } from '@/stores/ide-store';
import { FileExplorer, EditorTabs, CodeEditor, Terminal } from './';
import { ChatPanel } from '../chat/chat-panel';
import { PreviewPanel } from '../preview/preview-panel';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Files,
  Search,
  GitBranch,
  Blocks,
  MessageSquare,
  Settings,
  Terminal as TerminalIcon,
  Moon,
  Sun,
  PanelLeft,
  PanelRight,
  Download,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

import { getProjectFiles, getProject } from '@/lib/api/project-service';
import { filesLog, storeLog } from '@/lib/debug/logger';
import { downloadProjectAsZip } from '@/lib/utils/download-project';

interface IDELayoutProps {
  projectId: string;
}

export function IDELayout({ projectId }: IDELayoutProps) {
  const {
    sidebarOpen,
    setSidebarOpen,
    chatPanelOpen,
    setChatPanelOpen,
    terminalOpen,
    setTerminalOpen,
    activePanel,
    setActivePanel,
    theme,
    setTheme,
    currentProject,
    setCurrentProject,
    isEditorCollapsed,
    toggleEditorCollapsed,
    files,
  } = useIDEStore();

  const [mounted, setMounted] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownloadProject = async () => {
    if (!currentProject || !files.length) return;

    try {
      setIsDownloading(true);
      await downloadProjectAsZip(files, currentProject.name);
    } catch (error) {
      console.error('Erro ao baixar projeto:', error);
      // Aqui idealmente teríamos um toast de erro
    } finally {
      setIsDownloading(false);
    }
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  // Gerenciar dados do projeto (limpeza e carregamento)
  useEffect(() => {
    async function handleProjectChange() {
      if (!mounted || !projectId) return;

      const currentStore = useIDEStore.getState();
      
      // 1. Verificar se é uma troca de projeto
      // Se currentProject é nulo ou tem ID diferente, precisamos limpar/preparar
      // 1. Verificar se precisamos carregar os DADOS do projeto
      // Se currentProject é nulo ou tem ID diferente, precisamos buscar os dados
      if (!currentStore.currentProject || currentStore.currentProject.id !== projectId) {
        filesLog.info('🧹 Preparando ambiente e buscando projeto', { newId: projectId });
        
        try {
          const projectData = await getProject(projectId);
          if (projectData) {
            useIDEStore.getState().setCurrentProject(projectData);
            storeLog.success('✅ Dados do projeto carregados', { name: projectData.name });
          } else {
             storeLog.error('❌ Projeto não encontrado no banco', { projectId });
          }
        } catch (err) {
           storeLog.error('❌ Erro ao buscar detalhes do projeto', err);
        }
      }

      // 2. Carregar arquivos do Supabase
      // Sempre buscar os arquivos frescos do banho ao carregar a página/componente
      try {
        filesLog.info('📥 Buscando arquivos do projeto...', { projectId });
        const files = await getProjectFiles(projectId);
        
        if (files) {
          // CORREÇÃO AUTOMÁTICA DE EXTENSÕES (Auto-fix para arquivos corrompidos)
          // Se o arquivo tem extensão .js/.jsx mas conteúdo TypeScript (interface/type/ClassValue), mudar para .ts/.tsx
          const sanitizedFiles = files.map(f => {
            let sanitizedFile = { ...f }; // Variável local para mutação segura
            const content = f.content_text || '';
            
            // Heurística melhorada para detectar sintaxe TypeScript
            const hasTsSyntax = 
              content.includes('interface ') || 
              (content.includes('type ') && content.includes('=')) ||
              content.includes(': ClassValue') ||  // Comum em lib/utils.ts
              content.includes(' as ') ||           // Type assertion
              /\w+\s*:\s*(string|number|boolean|any|void|unknown|never)/.test(content); // Type annotations
            
            if (hasTsSyntax) {
              if (f.path.endsWith('.jsx')) {
                filesLog.warn(`🔧 Corrigindo extensão .jsx -> .tsx: ${f.path}`);
                sanitizedFile = { ...sanitizedFile, path: f.path.replace(/\.jsx$/, '.tsx') };
              }
              if (f.path.endsWith('.js')) {
                filesLog.warn(`🔧 Corrigindo extensão .js -> .ts: ${f.path}`);
                sanitizedFile = { ...sanitizedFile, path: f.path.replace(/\.js$/, '.ts') };
              }
            }

            // CORREÇÃO DE LINKS QUEBRADOS (Auto-fix para erro de regex anterior)
            // Se tem react-router-dom e tem </a> fechando <Link> (sintoma: tem Link e tem </a>)
            if ((content.includes("'react-router-dom'") || content.includes('"react-router-dom"')) && 
                content.includes('<Link') && content.includes('</a>')) {
               filesLog.warn(`🔧 Corrigindo Links quebrados (</a> -> </Link>) em: ${f.path}`);
               // Substituir todos os </a> por </Link>. Pode ser agressivo, mas salva o app quebrado.
               const fixedContent = content.replace(/<\/a>/g, '</Link>');
               sanitizedFile = { ...sanitizedFile, content_text: fixedContent };
            }

            return sanitizedFile;
          });

          useIDEStore.getState().setFiles(sanitizedFiles); // Usar arquivos corrigidos
          filesLog.success('✅ Arquivos carregados e sanitizados', { count: sanitizedFiles.length });
        } else {
          useIDEStore.getState().setFiles([]); // Nenhum arquivo
          filesLog.info('ℹ️ Projeto sem arquivos no banco');
        }
      } catch (error) {
        filesLog.error('❌ Erro ao carregar arquivos', error);
      }
    }

    handleProjectChange();
  }, [projectId, mounted]);

  if (!mounted) {
    return (
      <div className="h-screen w-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground">Carregando IDE...</p>
        </div>
      </div>
    );
  }

  const sidebarItems = [
    { id: 'files' as const, icon: Files, label: 'Arquivos' },
    { id: 'search' as const, icon: Search, label: 'Buscar' },
    { id: 'git' as const, icon: GitBranch, label: 'Git' },
    { id: 'extensions' as const, icon: Blocks, label: 'Extensões' },
  ];

  return (
    <div className="h-screen w-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* Top Bar */}
      <header className="h-12 border-b bg-card flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded bg-gradient-to-br from-violet-500 to-fuchsia-500" />
            <span className="font-semibold text-sm">AI App Builder</span>
          </div>
          <Separator orientation="vertical" className="h-6" />
          <span className="text-sm text-muted-foreground">
            {currentProject?.name || 'Projeto'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDownloadProject}
            disabled={isDownloading || !currentProject}
            title="Baixar projeto (.zip)"
          >
            {isDownloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>
          <Button variant="ghost" size="icon">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Activity Bar */}
        <aside className="w-12 border-r bg-card flex flex-col items-center py-2 shrink-0">
          {sidebarItems.map((item) => (
            <Button
              key={item.id}
              variant="ghost"
              size="icon"
              className={cn(
                'w-10 h-10 mb-1',
                activePanel === item.id && 'bg-accent'
              )}
              onClick={() => {
                if (activePanel === item.id) {
                  setSidebarOpen(!sidebarOpen);
                } else {
                  setActivePanel(item.id);
                  setSidebarOpen(true);
                }
              }}
            >
              <item.icon className="h-5 w-5" />
            </Button>
          ))}

          <div className="flex-1" />

          <Button
            variant="ghost"
            size="icon"
            className={cn('w-10 h-10 mb-1', chatPanelOpen && 'bg-accent')}
            onClick={() => setChatPanelOpen(!chatPanelOpen)}
          >
            <MessageSquare className="h-5 w-5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className={cn('w-10 h-10 mb-1', terminalOpen && 'bg-accent')}
            onClick={() => setTerminalOpen(!terminalOpen)}
          >
            <TerminalIcon className="h-5 w-5" />
          </Button>
        </aside>

        {/* Sidebar Panel */}
        {sidebarOpen && (
          <aside className="w-64 border-r bg-card shrink-0">
            <div className="h-10 flex items-center justify-between px-4 border-b">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {activePanel === 'files' && 'Explorador'}
                {activePanel === 'search' && 'Buscar'}
                {activePanel === 'git' && 'Controle de Versão'}
                {activePanel === 'extensions' && 'Extensões'}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setSidebarOpen(false)}
              >
                <PanelLeft className="h-4 w-4" />
              </Button>
            </div>
            <div className="h-[calc(100%-2.5rem)] overflow-auto">
              {activePanel === 'files' && <FileExplorer />}
              {activePanel === 'search' && (
                <div className="p-4 text-sm text-muted-foreground">
                  Busca em breve...
                </div>
              )}
              {activePanel === 'git' && (
                <div className="p-4 text-sm text-muted-foreground">
                  Git em breve...
                </div>
              )}
              {activePanel === 'extensions' && (
                <div className="p-4 text-sm text-muted-foreground">
                  Extensões em breve...
                </div>
              )}
            </div>
          </aside>
        )}

        {/* Main Area: Editor + Preview */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 flex overflow-hidden">
            {/* Editor - Colapsável */}
            {!isEditorCollapsed && (
              <div className="flex-1 flex flex-col min-w-0 transition-all duration-300">
                <div className="flex items-center justify-between bg-zinc-900 border-b border-zinc-800">
                  <EditorTabs key={`tabs-${projectId}`} />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={toggleEditorCollapsed}
                    className="h-8 px-2 mr-2 text-xs text-zinc-400 hover:text-white"
                    title="Colapsar editor"
                  >
                    <PanelLeft className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex-1 overflow-hidden">
                  <CodeEditor key={`editor-${projectId}`} />
                </div>
              </div>
            )}

            {/* Botão para expandir editor quando colapsado */}
            {isEditorCollapsed && (
              <div className="w-10 bg-zinc-900 border-r border-zinc-800 flex flex-col items-center pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleEditorCollapsed}
                  className="h-8 w-8 p-0 text-zinc-400 hover:text-white"
                  title="Expandir editor"
                >
                  <PanelRight className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* Preview - Expande quando editor está colapsado */}
            <div className={cn(
              "border-l border-zinc-800 shrink-0 transition-all duration-300",
              isEditorCollapsed ? "flex-1" : "w-[55%]"
            )}>
              {/* key={projectId} força reset completo do WebContainer ao trocar de projeto */}
              <PreviewPanel key={`preview-${projectId}`} />
            </div>
          </div>

          {/* Terminal */}
          {terminalOpen && (
            <div className="h-48 border-t shrink-0">
              <Terminal key={`terminal-${projectId}`} />
            </div>
          )}
        </div>

        {/* Chat Panel - EXPANDIDO */}
        {chatPanelOpen && (
          <aside className="w-[450px] shrink-0">
            <ChatPanel key={`chat-${projectId}`} projectId={projectId} />
          </aside>
        )}
      </div>

      {/* Status Bar */}
      <footer className="h-6 border-t bg-card flex items-center justify-between px-4 text-xs text-muted-foreground shrink-0">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-green-500" />
            Conectado
          </span>
          <span>TypeScript</span>
        </div>
        <div className="flex items-center gap-4">
          <span>UTF-8</span>
          <span>Ln 1, Col 1</span>
        </div>
      </footer>
    </div>
  );
}
