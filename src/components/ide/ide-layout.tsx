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
  ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';
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
    // Visual Edits
    isVisualEditMode,
    setSelectedTargetFile,
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

            // CORREÇÃO COMPLETA DE LINKS para Vite
            // Vite não suporta <Link> de Next.js, convertemos para <a>
            if (!content.includes("'react-router-dom'") && !content.includes('"react-router-dom"')) {
              let fixedContent = content;

              // 1. Convert ALL <Link ...> opening tags to <a ...>
              if (content.includes('<Link')) {
                filesLog.warn(`🔧 Corrigindo <Link> para <a> em: ${f.path}`);
                // Handle <Link href="..."> patterns
                fixedContent = fixedContent.replace(
                  /<Link\s+([^>]*?)href\s*=\s*({?"?'?[^"'>}]+['"}]?)([^>]*)>/g,
                  '<a $1href=$2$3>'
                );
                // Handle <Link to="..."> patterns
                fixedContent = fixedContent.replace(
                  /<Link\s+([^>]*?)to\s*=\s*({?"?'?[^"'>}]+['"}]?)([^>]*)>/g,
                  '<a $1href=$2$3>'
                );
                // Fallback: any remaining <Link ...>
                fixedContent = fixedContent.replace(/<Link\s+/g, '<a ');
              }

              // 2. Convert ALL </Link> closing tags to </a>
              if (content.includes('</Link>')) {
                fixedContent = fixedContent.replace(/<\/Link>/g, '</a>');
              }

              if (fixedContent !== content) {
                sanitizedFile = { ...sanitizedFile, content_text: fixedContent };
              }
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
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100 overflow-hidden font-sans selection:bg-violet-500/30">
      {/* Header */}
      <header className="h-12 border-b border-zinc-800 flex items-center justify-between px-4 shrink-0 bg-zinc-950/50 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          {/* Botão Voltar para Projetos */}
          <Link href="/projects">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50 rounded-lg"
              title="Voltar para projetos"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>

          <div className="h-5 w-px bg-zinc-700/50" />

          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <Blocks className="h-5 w-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold tracking-tight">AI App Builder</span>
            {currentProject && (
              <span className="text-[10px] text-zinc-400 font-medium">
                {currentProject.name}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Download Project */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDownloadProject}
            disabled={!files.length || isDownloading}
            className="h-8 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50 gap-2"
            title="Baixar projeto (.zip)"
          >
            {isDownloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            <span className="text-xs">Exportar</span>
          </Button>

          <div className="h-4 w-px bg-zinc-800 mx-1" />

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="h-8 w-8 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50"
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Activity Bar */}
        <aside className="w-14 border-r border-zinc-800 bg-zinc-900/50 backdrop-blur-sm flex flex-col items-center py-4 shrink-0 gap-2 z-20">
          {sidebarItems.map((item) => (
            <div key={item.id} className="relative group">
              {activePanel === item.id && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-violet-500 rounded-r-full" />
              )}
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'w-10 h-10 rounded-xl transition-all duration-200',
                  activePanel === item.id
                    ? 'text-violet-400 bg-violet-500/10'
                    : 'text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800'
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
            </div>
          ))}

          <div className="flex-1" />

          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'w-10 h-10 rounded-xl mb-1 transition-all',
              chatPanelOpen
                ? 'text-violet-400 bg-violet-500/10'
                : 'text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800'
            )}
            onClick={() => setChatPanelOpen(!chatPanelOpen)}
          >
            <MessageSquare className="h-5 w-5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'w-10 h-10 rounded-xl mb-1 transition-all',
              terminalOpen
                ? 'text-violet-400 bg-violet-500/10'
                : 'text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800'
            )}
            onClick={() => setTerminalOpen(!terminalOpen)}
          >
            <TerminalIcon className="h-5 w-5" />
          </Button>
        </aside>

        {/* Sidebar Panel */}
        {sidebarOpen && (
          <aside className="w-64 border-r border-zinc-800 bg-zinc-950/30 backdrop-blur-sm shrink-0 flex flex-col">
            <div className="h-10 flex items-center justify-between px-4 border-b border-zinc-800/50 bg-zinc-900/20">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                {activePanel === 'files' && 'Explorador'}
                {activePanel === 'search' && 'Buscar'}
                {activePanel === 'git' && 'Source Control'}
                {activePanel === 'extensions' && 'Extensions'}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-zinc-500 hover:text-zinc-200"
                onClick={() => setSidebarOpen(false)}
              >
                <PanelLeft className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="flex-1 overflow-auto p-2">
              {activePanel === 'files' && <FileExplorer />}
              {activePanel === 'search' && (
                <div className="flex flex-col items-center justify-center h-40 text-center p-4">
                  <Search className="h-8 w-8 text-zinc-700 mb-2" />
                  <p className="text-sm text-zinc-500">Busca global em breve</p>
                </div>
              )}
              {activePanel === 'git' && (
                <div className="flex flex-col items-center justify-center h-40 text-center p-4">
                  <GitBranch className="h-8 w-8 text-zinc-700 mb-2" />
                  <p className="text-sm text-zinc-500">Git integration em breve</p>
                </div>
              )}
              {activePanel === 'extensions' && (
                <div className="flex flex-col items-center justify-center h-40 text-center p-4">
                  <Blocks className="h-8 w-8 text-zinc-700 mb-2" />
                  <p className="text-sm text-zinc-500">Extensões em breve</p>
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
              <PreviewPanel
                key={`preview-${projectId}`}
                isVisualEditMode={isVisualEditMode}
                onComponentSelect={(filePath) => {
                  console.log('[IDELayout] Componente selecionado:', filePath);
                  setSelectedTargetFile(filePath);
                }}
              />
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
          <aside className="w-[450px] shrink-0 border-l border-zinc-800 shadow-2xl shadow-black/50 z-30">
            <ChatPanel key={`chat-${projectId}`} projectId={projectId} />
          </aside>
        )}
      </div>

      {/* Status Bar */}
      <footer className="h-6 border-t border-zinc-800 bg-zinc-950 flex items-center justify-between px-4 text-[10px] text-zinc-500 shrink-0 select-none">
        <div className="flex items-center gap-4">
          <Button variant="ghost" className="h-full px-2 gap-1.5 text-zinc-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-none transition-colors">
            <GitBranch className="h-3 w-3" />
            <span>main</span>
          </Button>

          <div className="flex items-center gap-1.5 px-2 hover:bg-zinc-900 rounded cursor-pointer transition-colors">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Conectado</span>
          </div>

          <div className="h-3 w-px bg-zinc-800" />
          <span>0 problemas</span>
        </div>

        <div className="flex items-center gap-4">
          <span className="cursor-pointer hover:text-zinc-300 transition-colors">Ln 1, Col 1</span>
          <span className="cursor-pointer hover:text-zinc-300 transition-colors">UTF-8</span>
          <span className="cursor-pointer hover:text-zinc-300 transition-colors">TypeScript React</span>
          <div className="flex items-center gap-1.5 ml-2 text-violet-500">
            <Blocks className="h-3 w-3" />
            <span className="font-medium">AI Builder</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
