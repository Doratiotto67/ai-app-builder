import { create } from 'zustand';
import { devtools, subscribeWithSelector, persist, createJSONStorage } from 'zustand/middleware';
import type { Project, ProjectFile, ChatThread, ChatMessage, AgentRun } from '@/types/database';
import { storeLog, filesLog } from '@/lib/debug/logger';

interface FileTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileTreeNode[];
  isOpen?: boolean;
}

interface IDEState {
  // Project
  currentProject: Project | null;
  setCurrentProject: (project: Project | null) => void;

  // Files
  files: ProjectFile[];
  setFiles: (files: ProjectFile[]) => void;
  addFile: (file: ProjectFile) => void;
  updateFile: (fileId: string, updates: Partial<ProjectFile>) => void;
  deleteFile: (fileId: string) => void;

  // File tree
  fileTree: FileTreeNode[];
  setFileTree: (tree: FileTreeNode[]) => void;
  toggleFolder: (path: string) => void;

  // Active file
  activeFile: ProjectFile | null;
  setActiveFile: (file: ProjectFile | null) => void;
  openFiles: ProjectFile[];
  openFile: (file: ProjectFile) => void;
  closeFile: (fileId: string) => void;

  // Editor content (unsaved changes)
  editorContent: Record<string, string>;
  setEditorContent: (fileId: string, content: string) => void;
  hasUnsavedChanges: (fileId: string) => boolean;

  // Chat
  currentThread: ChatThread | null;
  setCurrentThread: (thread: ChatThread | null) => void;
  messages: ChatMessage[];
  setMessages: (messages: ChatMessage[]) => void;
  addMessage: (message: ChatMessage) => void;
  isStreaming: boolean;
  setIsStreaming: (streaming: boolean) => void;
  streamingContent: string;
  setStreamingContent: (content: string) => void;
  appendStreamingContent: (content: string) => void;

  // Agent runs
  activeAgentRun: AgentRun | null;
  setActiveAgentRun: (run: AgentRun | null) => void;

  // Preview
  previewUrl: string | null;
  setPreviewUrl: (url: string | null) => void;
  previewKey: number;
  refreshPreview: () => void;

  // UI state
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  chatPanelOpen: boolean;
  setChatPanelOpen: (open: boolean) => void;
  terminalOpen: boolean;
  setTerminalOpen: (open: boolean) => void;
  activePanel: 'files' | 'search' | 'git' | 'extensions';
  setActivePanel: (panel: 'files' | 'search' | 'git' | 'extensions') => void;
  
  // Editor collapse
  isEditorCollapsed: boolean;
  setEditorCollapsed: (collapsed: boolean) => void;
  toggleEditorCollapsed: () => void;

  // Theme
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
}

function buildFileTree(files: ProjectFile[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];
  const pathMap = new Map<string, FileTreeNode>();

  // Sort files by path
  const sortedFiles = [...files].sort((a, b) => a.path.localeCompare(b.path));

  for (const file of sortedFiles) {
    const parts = file.path.split('/').filter(Boolean);
    let currentPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const parentPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      if (!pathMap.has(currentPath)) {
        const node: FileTreeNode = {
          name: part,
          path: currentPath,
          isDirectory: !isLast,
          children: !isLast ? [] : undefined,
          isOpen: false,
        };

        pathMap.set(currentPath, node);

        if (parentPath) {
          const parent = pathMap.get(parentPath);
          if (parent?.children) {
            parent.children.push(node);
          }
        } else {
          root.push(node);
        }
      }
    }
  }

  return root;
}

export const useIDEStore = create<IDEState>()(
  devtools(
    persist(
      subscribeWithSelector((set, get) => ({
        // Project
        currentProject: null,
        setCurrentProject: (project) => {
          const current = get().currentProject;
          // Se mudou de projeto, limpar todos os dados do projeto anterior
          if (project?.id !== current?.id) {
            storeLog.info('🔄 Mudando de projeto', { 
              from: current?.name || 'nenhum', 
              to: project?.name || 'nenhum',
              projectId: project?.id 
            });
            set({
              currentProject: project,
              files: [],
              fileTree: [],
              messages: [],
              currentThread: null,
              openFiles: [],
              activeFile: null,
              editorContent: {},
              streamingContent: '',
              isStreaming: false,
              previewUrl: null,
            });
          } else {
            set({ currentProject: project });
          }
        },

        // Files
        files: [],
        setFiles: (files) => {
          filesLog.info('📂 Atualizando arquivos', { count: files.length, paths: files.map(f => f.path) });
          set({ files, fileTree: buildFileTree(files) });
        },
        addFile: (file) => {
          filesLog.success('➕ Novo arquivo', { path: file.path });
          const files = [...get().files, file];
          set({ files, fileTree: buildFileTree(files) });
        },
        updateFile: (fileId, updates) => {
          const file = get().files.find(f => f.id === fileId);
          filesLog.info('✏️ Arquivo atualizado', { path: file?.path, updates: Object.keys(updates) });
          const files = get().files.map((f) =>
            f.id === fileId ? { ...f, ...updates } : f
          );
          set({ files, fileTree: buildFileTree(files) });
        },
        deleteFile: (fileId) => {
          const file = get().files.find(f => f.id === fileId);
          filesLog.warn('🗑️ Arquivo removido', { path: file?.path });
          const files = get().files.filter((f) => f.id !== fileId);
          set({ files, fileTree: buildFileTree(files) });
        },

        // File tree
        fileTree: [],
        setFileTree: (tree) => set({ fileTree: tree }),
        toggleFolder: (path) => {
          const toggleNode = (nodes: FileTreeNode[]): FileTreeNode[] =>
            nodes.map((node) => {
              if (node.path === path) {
                return { ...node, isOpen: !node.isOpen };
              }
              if (node.children) {
                return { ...node, children: toggleNode(node.children) };
              }
              return node;
            });
          set({ fileTree: toggleNode(get().fileTree) });
        },

        // Active file
        activeFile: null,
        setActiveFile: (file) => set({ activeFile: file }),
        openFiles: [],
        openFile: (file) => {
          const openFiles = get().openFiles;
          if (!openFiles.find((f) => f.id === file.id)) {
            set({ openFiles: [...openFiles, file] });
          }
          set({ activeFile: file });
        },
        closeFile: (fileId) => {
          const openFiles = get().openFiles.filter((f) => f.id !== fileId);
          const activeFile = get().activeFile;
          set({
            openFiles,
            activeFile: activeFile?.id === fileId ? openFiles[0] || null : activeFile,
          });
        },

        // Editor content
        editorContent: {},
        setEditorContent: (fileId, content) =>
          set((state) => ({
            editorContent: { ...state.editorContent, [fileId]: content },
          })),
        hasUnsavedChanges: (fileId) => {
          const file = get().files.find((f) => f.id === fileId);
          const editorContent = get().editorContent[fileId];
          return file?.content_text !== editorContent;
        },

        // Chat
        currentThread: null,
        setCurrentThread: (thread) => set({ currentThread: thread }),
        messages: [],
        setMessages: (messages) => set({ messages }),
        addMessage: (message) =>
          set((state) => ({ messages: [...state.messages, message] })),
        isStreaming: false,
        setIsStreaming: (streaming) => set({ isStreaming: streaming }),
        streamingContent: '',
        setStreamingContent: (content) => set({ streamingContent: content }),
        appendStreamingContent: (content) =>
          set((state) => ({ streamingContent: state.streamingContent + content })),

        // Agent runs
        activeAgentRun: null,
        setActiveAgentRun: (run) => set({ activeAgentRun: run }),

        // Preview
        previewUrl: null,
        setPreviewUrl: (url) => set({ previewUrl: url }),
        previewKey: 0,
        refreshPreview: () =>
          set((state) => ({ previewKey: state.previewKey + 1 })),

        // UI state
        sidebarOpen: true,
        setSidebarOpen: (open) => set({ sidebarOpen: open }),
        chatPanelOpen: true,
        setChatPanelOpen: (open) => set({ chatPanelOpen: open }),
        terminalOpen: false,
        setTerminalOpen: (open) => set({ terminalOpen: open }),
        activePanel: 'files',
        setActivePanel: (panel) => set({ activePanel: panel }),
        
        // Editor collapse
        isEditorCollapsed: false,
        setEditorCollapsed: (collapsed) => set({ isEditorCollapsed: collapsed }),
        toggleEditorCollapsed: () => set((state) => ({ isEditorCollapsed: !state.isEditorCollapsed })),

        // Theme
        theme: 'dark',
        setTheme: (theme) => set({ theme }),
      })),
      {
        name: 'app-builder-store',
        storage: createJSONStorage(() => localStorage),
        // Persiste APENAS dados de UI, NÃO dados que vêm do Supabase
        // files, messages - vêm do Supabase por projeto
        // currentProject - usado para saber qual projeto carregar
        partialize: (state) => ({
          currentProject: state.currentProject,
          // NÃO persistir files - vêm do Supabase por project_id
          // NÃO persistir messages - vêm do Supabase por thread_id
          theme: state.theme,
          // Dados de UI que podem ser persistidos
          openFiles: [], // Limpar para evitar referências quebradas
          activeFile: null,
        }),
        // Rebuild fileTree após hidratação
        onRehydrateStorage: () => (state) => {
          storeLog.info('🔄 Store hidratado do localStorage', {
            projectId: state?.currentProject?.id,
            projectName: state?.currentProject?.name
          });
          // Arquivos e mensagens serão carregados do Supabase quando necessário
          if (state) {
            state.files = [];
            state.fileTree = [];
            state.messages = [];
            state.editorContent = {};
          }
        },
      }
    ),
    { name: 'ide-store' }
  )
);

