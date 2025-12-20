'use client';

import { useEffect, useRef, useState } from 'react';
import { useIDEStore } from '@/stores/ide-store';
import { useWebContainer } from '@/lib/webcontainer';
import { Button } from '@/components/ui/button';
import {
  Loader2,
  AlertCircle,
  Play,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { previewLog } from '@/lib/debug/logger';
import { PreviewHeader, type DeviceType } from './preview-header';

export function PreviewPanel() {
  const { previewUrl, setPreviewUrl, refreshPreview, files } = useIDEStore();
  const [device, setDevice] = useState<DeviceType>('desktop');
  const [urlInput, setUrlInput] = useState('/');
  const [manualUrl, setManualUrl] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const {
    status,
    error,
    previewUrl: containerUrl,
    initProject,
    updateFile,
  } = useWebContainer({
    onServerReady: (url) => {
      setPreviewUrl(url);
    },
    onTerminalOutput: (data) => {
      console.log('[WebContainer]', data);
    },
    onError: (err) => {
      console.error('[WebContainer Error]', err);
    },
  });

  // Referência para controlar arquivos já sincronizados
  const lastSyncedFilesRef = useRef<string>('');
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousFilesLengthRef = useRef<number>(0);

  // DERIVADO: URL ativa (declarado cedo para uso nos useEffects)
  const activeUrl = manualUrl || containerUrl || previewUrl;

  // RESET: Quando projeto muda (detectado pelo reset de files para vazio e depois populado)
  useEffect(() => {
    // Se arquivos foram RESETADOS (de >0 para 0), limpar estado de sync
    if (files.length === 0 && previousFilesLengthRef.current > 0) {
      console.log('[PreviewPanel] 🔄 Projeto reset detectado, limpando estado de sync');
      lastSyncedFilesRef.current = '';
    }
    previousFilesLengthRef.current = files.length;
  }, [files.length]);

  // AUTO-SYNC: Sincroniza arquivos quando eles mudam no store (com debounce)
  useEffect(() => {
    if (status !== 'ready' || files.length === 0) return;

    // Criar hash simples dos arquivos para detectar mudanças reais (inclui CONTEÚDO, não só tamanho)
    const filesHash = files.map(f => `${f.path}:${(f.content_text || '').slice(0, 100)}`).join('|');
    
    // Só sincronizar se realmente mudou
    if (filesHash === lastSyncedFilesRef.current) {
      previewLog.info('⏭️ Arquivos não mudaram, pulando sync');
      return;
    }

    // Debounce para evitar múltiplas sincronizações em sequência
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }

    syncTimeoutRef.current = setTimeout(async () => {
      lastSyncedFilesRef.current = filesHash;
      console.log(`[PreviewPanel] 📁 Sincronizando ${files.length} arquivos...`);
      
      let syncedCount = 0;
      for (const file of files) {
        try {
          const content = file.content_text || '';
          await updateFile(file.path, content);
          syncedCount++;
        } catch (err) {
          if (err instanceof Error && err.message.includes('Proxy has been released')) {
            console.warn('[WebContainer] Proxy released, skipping sync');
            break;
          }
          console.error(`[WebContainer] Erro ao sincronizar ${file.path}:`, err);
        }
      }
      
      console.log(`[PreviewPanel] ✅ ${syncedCount} arquivos sincronizados`);
      
      // FORÇAR REFRESH do iframe após sincronização bem-sucedida
      if (iframeRef.current && activeUrl && syncedCount > 0) {
        console.log('[PreviewPanel] 🔄 Forçando refresh do iframe');
        const currentSrc = iframeRef.current.src;
        // Técnica para reload suave sem piscar branco se possível
        try {
           if (iframeRef.current.contentWindow) {
             iframeRef.current.contentWindow.location.reload();
           } else {
             iframeRef.current.src = currentSrc;
           }
        } catch (e) {
           iframeRef.current.src = currentSrc;
        }
      }
    }, 500); // Espera 500ms antes de sincronizar

    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [files, status, updateFile, activeUrl]);

  // AUTO-START: Inicia preview automaticamente quando o componente monta
  const hasAutoStartedRef = useRef(false);
  const isStartingRef = useRef(false);
  const autoStartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  useEffect(() => {
    // Limpar timeout se o componente desmontar
    return () => {
      if (autoStartTimeoutRef.current) {
        clearTimeout(autoStartTimeoutRef.current);
      }
    };
  }, []);
  
  useEffect(() => {
    // Iniciar preview se:
    // 1. Status está idle (não iniciado)
    // 2. Não iniciamos ainda
    // 3. Não estamos no meio de iniciar
    if (status === 'idle' && !hasAutoStartedRef.current && !isStartingRef.current) {
      // Se temos arquivos, iniciar imediatamente
      // Se não temos, esperar um pouco (dando tempo para o Supabase retornar)
      if (files.length > 0) {
        console.log(`[PreviewPanel] 🚀 Auto-iniciando preview com ${files.length} arquivos`);
        hasAutoStartedRef.current = true;
        isStartingRef.current = true;
        handleStartPreview().finally(() => {
          isStartingRef.current = false;
        });
      } else {
        // Esperar 2 segundos para arquivos do Supabase chegarem
        if (!autoStartTimeoutRef.current) {
          console.log('[PreviewPanel] ⏳ Aguardando arquivos do Supabase...');
          autoStartTimeoutRef.current = setTimeout(() => {
            if (status === 'idle' && !hasAutoStartedRef.current) {
              console.log('[PreviewPanel] ⚠️ Timeout - iniciando com projeto base');
              hasAutoStartedRef.current = true;
              isStartingRef.current = true;
              handleStartPreview().finally(() => {
                isStartingRef.current = false;
              });
            }
            autoStartTimeoutRef.current = null;
          }, 2000);
        }
      }
    }
  }, [files.length, status]);

  const deviceConfig = {
    desktop: { width: '100%', height: '100%' },
    tablet: { width: '768px', height: '1024px' },
    mobile: { width: '375px', height: '667px' },
  };

  const handleRefresh = () => {
    if (iframeRef.current && activeUrl) {
      iframeRef.current.src = activeUrl + urlInput;
    }
    refreshPreview();
  };

  const handleStartPreview = async () => {
    // Passar arquivos do store para serem mergeados com projeto base
    const fileList = files.map((f) => ({
      path: f.path,
      content: f.content_text || '',
    }));

    await initProject(fileList);
  };

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
        {status === 'error' && error ? (
          <div className="text-center text-red-400 max-w-md bg-red-950/20 p-8 rounded-xl border border-red-500/20">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium mb-2">Erro no WebContainer</h3>
            <p className="text-sm opacity-80 mb-6">{error.message}</p>
            <Button variant="outline" size="sm" onClick={handleStartPreview} className="border-red-500/30 hover:bg-red-500/10 hover:text-red-300">
              Reiniciar Ambiente
            </Button>
          </div>
        ) : activeUrl && status === 'ready' ? (
          <div
            className={cn(
              'bg-white rounded-lg overflow-hidden shadow-2xl transition-all duration-300 ring-1 ring-white/10',
              device !== 'desktop' && 'border-8 border-neutral-800'
            )}
            style={deviceConfig[device]}
          >
            <iframe
              ref={iframeRef}
              src={activeUrl + urlInput}
              className="w-full h-full"
              title="Preview"
              allow="cross-origin-isolated"
            />
          </div>
        ) : status === 'idle' ? (
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
        ) : (
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
        )}
      </div>

      {/* Botão Limpar Cache - Canto inferior esquerdo */}
      <div className="absolute bottom-4 left-4 z-10 opacity-0 hover:opacity-100 transition-opacity">
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
  );
}
