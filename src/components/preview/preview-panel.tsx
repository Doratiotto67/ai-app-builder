'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useIDEStore } from '@/stores/ide-store';
import { useWebContainer } from '@/lib/webcontainer';
import { Button } from '@/components/ui/button';
import {
  Loader2,
  AlertCircle,
  Play,
  Trash2,
  MousePointerClick,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PreviewHeader, type DeviceType } from './preview-header';

interface PreviewPanelProps {
  isVisualEditMode?: boolean;
  onComponentSelect?: (filePath: string) => void;
}

export function PreviewPanel({ isVisualEditMode = false, onComponentSelect }: PreviewPanelProps) {
  const { previewUrl, setPreviewUrl, refreshPreview, previewKey, files, currentProject } = useIDEStore();
  const [device, setDevice] = useState<DeviceType>('desktop');
  const [urlInput, setUrlInput] = useState('/');
  const [manualUrl, setManualUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [iframeError, setIframeError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const {
    status,
    error,
    previewUrl: containerUrl,
    initProject,
    updateFile,
  } = useWebContainer({
    onServerReady: (url) => {
      console.log('[PreviewPanel] ✅ Server ready:', url);
      setPreviewUrl(url);
      setManualUrl(null);
      setIframeError(null);
    },
    onTerminalOutput: (data) => {
      // Detectar erros críticos no output do terminal
      if (data.includes('Error:') || data.includes('error:')) {
        console.warn('[WebContainer Terminal]', data);
      }
    },
    onError: (err) => {
      console.error('[WebContainer Error]', err);
      setIframeError(err.message);
    },
  });

  // Referência para controlar arquivos já sincronizados
  const lastSyncedFilesRef = useRef<string>('');
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousFilesLengthRef = useRef<number>(0);
  const initAttemptRef = useRef<number>(0);

  // DERIVADO: URL ativa (declarado cedo para uso nos useEffects)
  const activeUrl = manualUrl || containerUrl || previewUrl;

  // Debug: Logar mudanças de estado importantes
  useEffect(() => {
    console.log('[PreviewPanel] Estado atualizado:', {
      status,
      activeUrl: activeUrl?.substring(0, 50),
      filesCount: files.length,
      containerUrl: containerUrl?.substring(0, 50),
      previewUrl: previewUrl?.substring(0, 50)
    });
  }, [status, activeUrl, files.length, containerUrl, previewUrl]);

  // RESET: Quando projeto muda (detectado pelo reset de files para vazio e depois populado)
  useEffect(() => {
    // Se arquivos foram RESETADOS (de >0 para 0), limpar estado de sync
    if (files.length === 0 && previousFilesLengthRef.current > 0) {
      console.log('[PreviewPanel] 🔄 Projeto reset detectado, limpando estado de sync');
      lastSyncedFilesRef.current = '';
      initAttemptRef.current = 0;
    }
    previousFilesLengthRef.current = files.length;
  }, [files.length]);

  // VISUAL EDIT: Escutar mensagens do iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'COMPONENT_CLICKED') {
        const { componentInfo } = event.data;
        console.log('[VisualEdit] Componente clicado:', componentInfo);

        // Mapeamento inteligente para encontrar o arquivo correto
        const targetFile = findBestMatchingFile(componentInfo, files);
        console.log('[VisualEdit] Arquivo mapeado:', targetFile);
        onComponentSelect?.(targetFile);
      }
    };

    function findBestMatchingFile(
      info: { tagName?: string; className?: string; id?: string; innerText?: string; dataFile?: string; dataSourceFile?: string },
      projectFiles: typeof files
    ): string {
      // 0. PRIORIDADE MÁXIMA: data-source-file (injetado pelo LLM)
      if (info.dataSourceFile) {
        const exists = projectFiles.some(f => f.path === info.dataSourceFile);
        if (exists) {
          return info.dataSourceFile;
        }
      }

      // 1. data-file explícito
      if (info.dataFile) {
        return info.dataFile;
      }

      // 2. Criar lista de candidatos com pontuação
      const candidates: { path: string; score: number; reason: string }[] = [];
      const tag = (info.tagName || '').toLowerCase();
      const cls = (info.className || '').toLowerCase();
      const id = (info.id || '').toLowerCase();
      const text = (info.innerText || '').toLowerCase().slice(0, 200);

      // Extrair palavras-chave
      const keywords = new Set<string>();
      cls.split(/[\s-]+/).forEach(w => w.length > 2 && keywords.add(w));
      id.split(/[\s-_]+/).forEach(w => w.length > 2 && keywords.add(w));
      text.split(/\s+/).slice(0, 5).forEach(w => {
        const clean = w.replace(/[^a-záéíóúãõâêîôûàèìòù]/gi, '');
        if (clean.length > 3) keywords.add(clean);
      });

      // Pontuar cada arquivo
      for (const file of projectFiles) {
        const filePath = file.path.toLowerCase();
        const fileName = filePath.split('/').pop()?.replace(/\.(tsx|jsx|ts|js)$/, '') || '';
        const content = (file.content_text || '').toLowerCase();
        let score = 0;
        const reasons: string[] = [];

        // Match de nome de arquivo com keywords
        for (const kw of keywords) {
          if (fileName.includes(kw) || kw.includes(fileName)) {
            score += 30;
            reasons.push(`filename match: ${kw}`);
          }
        }

        // Layout components
        const layoutComponents = ['header', 'footer', 'nav', 'sidebar', 'hero', 'section', 'layout'];
        for (const comp of layoutComponents) {
          if ((cls.includes(comp) || tag === comp) && (fileName.includes(comp) || filePath.includes(comp))) {
            score += 60;
            reasons.push(`layout match: ${comp}`);
          }
        }

        // Penalizar App.tsx
        if (fileName === 'app') {
          score -= 30;
        }

        if (score !== 0) {
          candidates.push({ path: file.path, score, reason: reasons.join(', ') });
        }
      }

      candidates.sort((a, b) => b.score - a.score);

      if (candidates.length > 0 && candidates[0].score > 0) {
        return candidates[0].path;
      }

      // Fallbacks
      if (tag === 'header' || tag === 'nav' || cls.includes('header') || cls.includes('nav')) {
        return projectFiles.find(f => f.path.toLowerCase().includes('header'))?.path || 'src/components/Header.tsx';
      }
      if (tag === 'footer' || cls.includes('footer')) {
        return projectFiles.find(f => f.path.toLowerCase().includes('footer'))?.path || 'src/components/Footer.tsx';
      }
      if (cls.includes('hero') || cls.includes('banner')) {
        return projectFiles.find(f => f.path.toLowerCase().includes('hero'))?.path || 'src/components/Hero.tsx';
      }

      return 'src/App.tsx';
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [files, onComponentSelect]);

  // VISUAL EDIT: Enviar mensagem para o iframe quando modo muda
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;

    iframe.contentWindow.postMessage(
      { type: 'TOGGLE_VISUAL_EDIT', enabled: isVisualEditMode },
      '*'
    );
    console.log('[PreviewPanel] Enviado TOGGLE_VISUAL_EDIT:', isVisualEditMode);
  }, [isVisualEditMode]);

  // AUTO-SYNC: Sincroniza arquivos quando eles mudam no store (com debounce)
  useEffect(() => {
    // Não sincronizar se container não está pronto
    if (status !== 'ready') {
      console.log('[PreviewPanel] ⏸️ AUTO-SYNC aguardando container (status:', status, ')');
      return;
    }
    
    // Se não temos arquivos, nada a sincronizar
    if (files.length === 0) {
      console.log('[PreviewPanel] ⏸️ AUTO-SYNC: nenhum arquivo no store');
      return;
    }

    // Criar hash para detectar mudanças reais
    const filesHash = files.map(f => {
      const content = f.content_text || '';
      const sample = content.slice(0, 50) + content.slice(Math.max(0, content.length / 2 - 25), content.length / 2 + 25) + content.slice(-50);
      return `${f.path}:${content.length}:${sample}`;
    }).join('|');

    // Log detalhado para debug
    const isFirstSync = lastSyncedFilesRef.current === '';
    const hasChanged = filesHash !== lastSyncedFilesRef.current;
    
    console.log('[PreviewPanel] 🔄 AUTO-SYNC check:', {
      filesCount: files.length,
      isFirstSync,
      hasChanged,
      lastHashLength: lastSyncedFilesRef.current.length,
      currentHashLength: filesHash.length
    });

    // Só sincronizar se realmente mudou
    if (!hasChanged) {
      return;
    }

    // Debounce - mas use tempo menor para primeira sincronização
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }

    const debounceTime = isFirstSync ? 200 : 800; // Mais rápido na primeira vez
    
    syncTimeoutRef.current = setTimeout(async () => {
      lastSyncedFilesRef.current = filesHash;
      console.log(`[PreviewPanel] 📁 Sincronizando ${files.length} arquivos...`);

      let syncedCount = 0;
      let errorCount = 0;
      
      for (const file of files) {
        try {
          const content = file.content_text || '';
          await updateFile(file.path, content);
          syncedCount++;
        } catch (err) {
          errorCount++;
          if (err instanceof Error && err.message.includes('Proxy has been released')) {
            console.warn('[WebContainer] Proxy released, skipping sync');
            break;
          }
          console.error(`[WebContainer] Erro ao sincronizar ${file.path}:`, err);
        }
      }

      console.log(`[PreviewPanel] ✅ Sync completo: ${syncedCount} ok, ${errorCount} erros`);

      // REMOVIDO: Forçar refresh do iframe causava erro "Cannot navigate to URL"
      // e corrida com o Service Worker. O HMR do Vite deve lidar com as atualizações.
      // Se necessário, o usuário pode usar o botão de refresh manual.
      /*
      if (iframeRef.current && activeUrl && syncedCount > 0) {
        console.log('[PreviewPanel] 🔄 Forçando refresh do iframe após sync');
        try {
          if (iframeRef.current.contentWindow) {
            iframeRef.current.contentWindow.location.reload();
          } else {
            const currentSrc = iframeRef.current.src;
            iframeRef.current.src = currentSrc;
          }
        } catch (e) {
          iframeRef.current.src = iframeRef.current.src;
        }
      }
      */
    }, debounceTime);

    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [files, status, updateFile, activeUrl]);

  
  const handleStartPreview = useCallback(async () => {
    console.log('[PreviewPanel] 🎬 handleStartPreview chamado');
    setIsLoading(true);
    setIframeError(null);

    // Verificar se temos arquivos no store
    const currentFiles = useIDEStore.getState().files;
    console.log('[PreviewPanel] 📂 Arquivos no store:', {
      count: currentFiles.length,
      paths: currentFiles.slice(0, 10).map(f => f.path)
    });

    const fileList = currentFiles.map((f) => ({
      path: f.path,
      content: f.content_text || '',
    }));

    console.log('[PreviewPanel] 📦 Passando para initProject:', {
      fileCount: fileList.length,
      projectId: currentProject?.id
    });

    try {
      await initProject(fileList, currentProject?.id);
      console.log('[PreviewPanel] ✅ initProject completou');
    } catch (err) {
      console.error('[PreviewPanel] ❌ Erro ao iniciar projeto:', err);
      setIframeError(err instanceof Error ? err.message : 'Erro desconhecido');
    }
  }, [initProject, currentProject?.id]);

  // AUTO-START: Inicia preview automaticamente quando o componente monta
  const hasAutoStartedRef = useRef(false);
  const isStartingRef = useRef(false);
  const autoStartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filesLoadedAfterReadyRef = useRef(false);

  useEffect(() => {
    // Limpar timeout se o componente desmontar
    return () => {
      if (autoStartTimeoutRef.current) {
        clearTimeout(autoStartTimeoutRef.current);
      }
    };
  }, []);

  // CORREÇÃO: Detectar quando arquivos chegam APÓS o container já estar pronto
  useEffect(() => {
    if (status === 'ready' && files.length > 0 && !filesLoadedAfterReadyRef.current) {
      const currentHash = files.map(f => `${f.path}:${(f.content_text || '').length}`).join('|');
      if (currentHash !== lastSyncedFilesRef.current) {
        console.log('[PreviewPanel] 📂 Arquivos do Supabase chegaram após container pronto, sincronizando...');
        filesLoadedAfterReadyRef.current = true;
      }
    }
  }, [status, files]);

  useEffect(() => {
    if (status === 'idle' && !hasAutoStartedRef.current && !isStartingRef.current) {
      if (files.length > 0) {
        console.log(`[PreviewPanel] 🚀 Auto-iniciando preview com ${files.length} arquivos`);
        hasAutoStartedRef.current = true;
        isStartingRef.current = true;
        handleStartPreview().finally(() => {
          isStartingRef.current = false;
        });
      } else {
        if (!autoStartTimeoutRef.current) {
          console.log('[PreviewPanel] ⏳ Aguardando arquivos do Supabase (max 5s)...');
          autoStartTimeoutRef.current = setTimeout(() => {
            const currentFiles = useIDEStore.getState().files;
            if (currentFiles.length > 0) {
              console.log(`[PreviewPanel] ✅ Arquivos carregados durante espera: ${currentFiles.length}`);
            } else {
              console.log('[PreviewPanel] ⚠️ Timeout - iniciando com projeto base');
            }
            
            if (!hasAutoStartedRef.current) {
              hasAutoStartedRef.current = true;
              isStartingRef.current = true;
              handleStartPreview().finally(() => {
                isStartingRef.current = false;
              });
            }
            autoStartTimeoutRef.current = null;
          }, 5000);
        }
      }
    }
  }, [files.length, status, handleStartPreview]);

  const deviceConfig = {
    desktop: { width: '100%', height: '100%' },
    tablet: { width: '768px', height: '1024px' },
    mobile: { width: '375px', height: '667px' },
  };

  const handleRefresh = useCallback(() => {
    console.log('[PreviewPanel] 🔄 handleRefresh chamado');
    refreshPreview();

    if (iframeRef.current && activeUrl) {
      try {
        if (iframeRef.current.contentWindow) {
          iframeRef.current.contentWindow.location.reload();
        }
      } catch (e) {
        const newSrc = activeUrl + urlInput + '?r=' + Date.now();
        iframeRef.current.src = newSrc;
      }
    }
  }, [refreshPreview, activeUrl, urlInput]);

  const handleForceRestart = useCallback(async () => {
    console.log('[PreviewPanel] ⚡ Reinicialização forçada solicitada');

    lastSyncedFilesRef.current = '';
    hasAutoStartedRef.current = false;
    isStartingRef.current = false;
    initAttemptRef.current = 0;
    filesLoadedAfterReadyRef.current = false;
    setIframeError(null);

    await handleStartPreview();
  }, [handleStartPreview]);

  // handleStartPreview já declarado acima antes dos useEffects

  // Handler para quando o iframe carrega
  const handleIframeLoad = useCallback(() => {
    console.log('[PreviewPanel] ✅ iframe carregou:', activeUrl);
    setIsLoading(false);
    setIframeError(null);
  }, [activeUrl]);

  // Handler para erros do iframe
  const handleIframeError = useCallback((e: React.SyntheticEvent<HTMLIFrameElement>) => {
    console.error('[PreviewPanel] ❌ iframe erro:', e);
    setIsLoading(false);
    setIframeError('Falha ao carregar o preview');
  }, []);

  // Determinar o que mostrar
  const shouldShowIframe = activeUrl && (status === 'ready' || status === 'starting');
  const shouldShowLoading = status === 'booting' || status === 'installing' || status === 'starting';
  const shouldShowIdle = status === 'idle';
  const shouldShowError = status === 'error' || !!iframeError;

  return (
    <div className="h-full flex flex-col bg-neutral-900 relative">
      <PreviewHeader
        device={device}
        setDevice={setDevice}
        urlInput={urlInput}
        setUrlInput={setUrlInput}
        status={status}
        onRefresh={handleRefresh}
        activeUrl={activeUrl}
      />

      {/* Preview Content */}
      <div className="flex-1 flex items-center justify-center p-4 bg-neutral-950/50 overflow-auto">
        {shouldShowError && (error || iframeError) ? (
          <div className="text-center text-red-400 max-w-md bg-red-950/20 p-8 rounded-xl border border-red-500/20">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium mb-2">Erro no WebContainer</h3>
            <p className="text-sm opacity-80 mb-6">{error?.message || iframeError}</p>
            <Button variant="outline" size="sm" onClick={handleForceRestart} className="border-red-500/30 hover:bg-red-500/10 hover:text-red-300">
              <RefreshCw className="h-4 w-4 mr-2" />
              Reiniciar Ambiente
            </Button>
          </div>
        ) : shouldShowIframe ? (
          <div
            className={cn(
              'bg-white rounded-lg overflow-hidden shadow-2xl transition-all duration-300 ring-1 ring-white/10 relative',
              device !== 'desktop' && 'border-8 border-neutral-800'
            )}
            style={deviceConfig[device]}
          >
            {/* Loading overlay */}
            {isLoading && (
              <div className="absolute inset-0 bg-neutral-950/80 flex items-center justify-center z-10">
                <div className="text-center">
                  <Loader2 className="h-8 w-8 text-white/50 animate-spin mx-auto mb-2" />
                  <p className="text-sm text-zinc-400">Carregando preview...</p>
                </div>
              </div>
            )}

            <iframe
              key={previewKey}
              ref={iframeRef}
              src={activeUrl + urlInput}
              className="w-full h-full"
              title="Preview"
              allow="cross-origin-isolated"
              onLoad={handleIframeLoad}
              onError={handleIframeError}
            />

            {/* Visual Edit Mode Banner */}
            {isVisualEditMode && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 bg-cyan-600 text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-lg pointer-events-none animate-pulse">
                <MousePointerClick className="h-3.5 w-3.5" />
                Clique em um componente no preview
              </div>
            )}
          </div>
        ) : shouldShowIdle ? (
          <div className="text-center text-muted-foreground max-w-md">
            <div className="relative mb-6 mx-auto w-16 h-16 flex items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 ring-1 ring-white/10">
              <Play className="h-8 w-8 text-white/80 ml-1" />
            </div>
            <h3 className="text-lg font-medium mb-2 text-white">Iniciar Preview</h3>
            <p className="text-sm text-zinc-400 mb-8 max-w-xs mx-auto leading-relaxed">
              O ambiente de desenvolvimento será iniciado no seu navegador.
            </p>
            <Button
              onClick={handleStartPreview}
              size="lg"
              className="bg-white text-black hover:bg-zinc-200 font-medium px-8"
            >
              Iniciar Servidor
            </Button>
          </div>
        ) : shouldShowLoading ? (
          <div className="text-center text-muted-foreground max-w-sm">
            {/* Progress Circle */}
            <div className="relative w-32 h-32 mx-auto mb-8">
              <svg className="w-full h-full -rotate-90 drop-shadow-2xl" viewBox="0 0 100 100">
                <defs>
                  <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#8b5cf6" />
                    <stop offset="100%" stopColor="#d946ef" />
                  </linearGradient>
                </defs>
                {/* Background circle */}
                <circle
                  className="text-neutral-800"
                  strokeWidth="6"
                  stroke="currentColor"
                  fill="transparent"
                  r="42"
                  cx="50"
                  cy="50"
                />
                {/* Progress circle */}
                <circle
                  stroke="url(#gradient)"
                  strokeWidth="6"
                  strokeLinecap="round"
                  fill="transparent"
                  r="42"
                  cx="50"
                  cy="50"
                  strokeDasharray={264}
                  strokeDashoffset={
                    status === 'booting' ? 264 * 0.7 :
                      status === 'installing' ? 264 * 0.4 :
                        status === 'starting' ? 264 * 0.1 : 264
                  }
                  className="transition-all duration-700 ease-out"
                />
              </svg>
              {/* Status Icon */}
              <div className="absolute inset-0 flex items-center justify-center">
                {status === 'installing' ? (
                  <div className="animate-bounce">📦</div>
                ) : status === 'starting' ? (
                  <div className="animate-pulse">⚡</div>
                ) : (
                  <Loader2 className="h-8 w-8 text-white/50 animate-spin" />
                )}
              </div>
            </div>

            <h3 className="text-lg font-medium mb-1 text-white animate-pulse">
              {status === 'booting' && 'Iniciando sistema...'}
              {status === 'installing' && 'Instalando pacotes...'}
              {status === 'starting' && 'Iniciando servidor...'}
            </h3>
            <p className="text-xs text-zinc-500 uppercase tracking-wider font-medium">
              {status === 'booting' && 'WebContainer'}
              {status === 'installing' && 'NPM Install'}
              {status === 'starting' && 'Vite Dev'}
            </p>
          </div>
        ) : (
          // Fallback - não deveria chegar aqui, mas evita tela branca
          <div className="text-center text-muted-foreground">
            <Loader2 className="h-8 w-8 text-white/50 animate-spin mx-auto mb-4" />
            <p className="text-sm text-zinc-400">Preparando ambiente...</p>
            <p className="text-xs text-zinc-600 mt-2">Status: {status}</p>
          </div>
        )}
      </div>

      {/* Botões de Ação - Canto inferior esquerdo */}
      <div className="absolute bottom-4 left-4 z-10 flex gap-2">
        {/* Botão Reiniciar WebContainer */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleForceRestart}
          disabled={status === 'booting' || status === 'installing' || status === 'starting'}
          className="text-xs bg-zinc-900/80 hover:bg-violet-500/20 border-violet-500/30 text-violet-300 hover:text-violet-200 gap-1.5"
          title="Reiniciar WebContainer (força refresh completo)"
        >
          <Play className="h-3 w-3" />
          Reiniciar Preview
        </Button>

        {/* Botão Limpar Cache - menos visível */}
        <div className="opacity-0 hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (confirm('Isso vai limpar o cache do projeto e recarregar a página. Continuar?')) {
                localStorage.removeItem('app-builder-store');
                window.location.reload();
              }
            }}
            className="text-xs text-zinc-600 hover:text-red-400 hover:bg-red-500/5 gap-1.5"
          >
            <Trash2 className="h-3 w-3" />
            Reset Cache
          </Button>
        </div>
      </div>
    </div>
  );
}
