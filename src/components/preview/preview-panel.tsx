'use client';

import { useEffect, useRef, useState } from 'react';
import { useIDEStore } from '@/stores/ide-store';
import { useWebContainer } from '@/lib/webcontainer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  RefreshCw,
  ExternalLink,
  Smartphone,
  Tablet,
  Monitor,
  Globe,
  Play,
  Loader2,
  AlertCircle,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { previewLog } from '@/lib/debug/logger';

type DeviceType = 'desktop' | 'tablet' | 'mobile';

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
    terminalOutput,
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

  // AUTO-SYNC: Sincroniza arquivos quando eles mudam no store (com debounce)
  useEffect(() => {
    if (status !== 'ready' || files.length === 0) return;

    // Criar hash simples dos arquivos para detectar mudanças reais
    const filesHash = files.map(f => `${f.path}:${f.content_text?.length || 0}`).join('|');
    
    // Só sincronizar se realmente mudou
    if (filesHash === lastSyncedFilesRef.current) return;

    // Debounce para evitar múltiplas sincronizações em sequência
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }

    syncTimeoutRef.current = setTimeout(async () => {
      lastSyncedFilesRef.current = filesHash;
      console.log('[PreviewPanel] Sincronizando arquivos...');
      
      for (const file of files) {
        try {
          const content = file.content_text || '';
          await updateFile(file.path, content);
        } catch (err) {
          if (err instanceof Error && err.message.includes('Proxy has been released')) {
            console.warn('[WebContainer] Proxy released, skipping sync');
            break;
          }
          console.error(`[WebContainer] Erro ao sincronizar ${file.path}:`, err);
        }
      }
    }, 500); // Espera 500ms antes de sincronizar

    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [files, status, updateFile]);

  // AUTO-START: Inicia preview automaticamente quando o componente monta
  const hasAutoStartedRef = useRef(false);
  const isStartingRef = useRef(false);
  
  useEffect(() => {
    // Iniciar preview se:
    // 1. Status está idle (não iniciado)
    // 2. Não iniciamos ainda
    // 3. Não estamos no meio de iniciar
    if (status === 'idle' && !hasAutoStartedRef.current && !isStartingRef.current) {
      // Só auto-iniciar se temos arquivos OU se passaram 2 segundos sem arquivos (iniciar com projeto base)
      const shouldStart = files.length > 0;
      
      if (shouldStart) {
        console.log('[PreviewPanel] Auto-iniciando preview com', files.length, 'arquivos');
        hasAutoStartedRef.current = true;
        isStartingRef.current = true;
        handleStartPreview().finally(() => {
          isStartingRef.current = false;
        });
      }
    }
  }, [files.length, status]);

  const activeUrl = manualUrl || containerUrl || previewUrl;

  const deviceConfig = {
    desktop: { width: '100%', height: '100%' },
    tablet: { width: '768px', height: '1024px' },
    mobile: { width: '375px', height: '667px' },
  };

  const devices = [
    { id: 'mobile' as const, icon: Smartphone, label: 'Mobile' },
    { id: 'tablet' as const, icon: Tablet, label: 'Tablet' },
    { id: 'desktop' as const, icon: Monitor, label: 'Desktop' },
  ];

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

  const statusConfig = {
    idle: { label: 'Parado', color: 'bg-neutral-500' },
    booting: { label: 'Iniciando...', color: 'bg-yellow-500' },
    installing: { label: 'Instalando...', color: 'bg-yellow-500' },
    starting: { label: 'Carregando...', color: 'bg-blue-500' },
    ready: { label: 'Pronto', color: 'bg-green-500' },
    error: { label: 'Erro', color: 'bg-red-500' },
  };

  return (
    <div className="h-full flex flex-col bg-neutral-900 relative">
      {/* Preview Header */}
      <div className="h-12 border-b border-neutral-800 flex items-center gap-2 px-3 shrink-0">
        <div className="flex items-center gap-1 bg-neutral-800 rounded-lg p-1">
          {devices.map((d) => (
            <Button
              key={d.id}
              variant="ghost"
              size="sm"
              className={cn('h-7 w-7 p-0', device === d.id && 'bg-neutral-700')}
              onClick={() => setDevice(d.id)}
            >
              <d.icon className="h-4 w-4" />
            </Button>
          ))}
        </div>

        <div className="flex-1 flex items-center gap-2">
          <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            className="h-7 bg-neutral-800 border-neutral-700 text-sm"
            placeholder="/"
          />
        </div>

        <Badge variant="secondary" className="text-xs">
          <div className={cn('h-2 w-2 rounded-full mr-1', statusConfig[status].color)} />
          {statusConfig[status].label}
        </Badge>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          className="h-7 w-7 p-0"
          disabled={status !== 'ready'}
          title="Atualizar preview"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>

        {activeUrl && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.open(activeUrl, '_blank')}
            className="h-7 w-7 p-0"
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Preview Content */}
      <div className="flex-1 flex items-center justify-center p-4 bg-neutral-950 overflow-auto">
        {status === 'error' && error ? (
          <div className="text-center text-red-400 max-w-md">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium mb-2">Erro no WebContainer</h3>
            <p className="text-sm opacity-80 mb-4">{error.message}</p>
            <Button variant="outline" size="sm" onClick={handleStartPreview}>
              Tentar novamente
            </Button>
          </div>
        ) : activeUrl && status === 'ready' ? (
          <div
            className={cn(
              'bg-white rounded-lg overflow-hidden shadow-2xl transition-all duration-300',
              device !== 'desktop' && 'border-8 border-neutral-800'
            )}
            style={deviceConfig[device]}
          >
            <iframe
              ref={iframeRef}
              src={activeUrl + urlInput}
              className="w-full h-full"
              title="Preview"
            />
          </div>
        ) : status === 'idle' ? (
          <div className="text-center text-muted-foreground max-w-md">
            <div className="text-6xl mb-4">🚀</div>
            <h3 className="text-lg font-medium mb-2">Preview</h3>
            <p className="text-sm mb-4">
              Clique no botão abaixo para iniciar o servidor de desenvolvimento no navegador.
            </p>
            <p className="text-xs text-zinc-500 mb-6">
              💡 As dependências do projeto são instaladas localmente no seu navegador usando WebContainer.
              Isso pode levar alguns segundos na primeira vez.
            </p>
            <Button
              onClick={handleStartPreview}
              className="bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600"
            >
              <Play className="h-4 w-4 mr-2" />
              Iniciar Preview
            </Button>
          </div>
        ) : (
          <div className="text-center text-muted-foreground max-w-sm">
            {/* Progress Circle */}
            <div className="relative w-24 h-24 mx-auto mb-6">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                {/* Background circle */}
                <circle
                  className="text-neutral-800"
                  strokeWidth="8"
                  stroke="currentColor"
                  fill="transparent"
                  r="42"
                  cx="50"
                  cy="50"
                />
                {/* Progress circle */}
                <circle
                  className="text-violet-500 transition-all duration-500"
                  strokeWidth="8"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="transparent"
                  r="42"
                  cx="50"
                  cy="50"
                  strokeDasharray={264}
                  strokeDashoffset={
                    status === 'booting' ? 264 * 0.8 :
                    status === 'installing' ? 264 * 0.4 :
                    status === 'starting' ? 264 * 0.1 : 264
                  }
                />
              </svg>
              {/* Percentage text */}
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-bold text-white">
                  {status === 'booting' ? '20%' :
                   status === 'installing' ? '60%' :
                   status === 'starting' ? '90%' : '0%'}
                </span>
              </div>
            </div>

            <h3 className="text-lg font-medium mb-2 text-white">
              {status === 'booting' && 'Iniciando ambiente...'}
              {status === 'installing' && 'Instalando dependências...'}
              {status === 'starting' && 'Quase pronto...'}
            </h3>
            
            {/* Progress steps */}
            <div className="flex flex-col items-start gap-2 mt-4 text-left bg-neutral-900/50 rounded-lg p-4">
              <div className={cn(
                "flex items-center gap-2 text-sm transition-colors",
                status === 'booting' || status === 'installing' || status === 'starting' 
                  ? "text-green-400" : "text-neutral-500"
              )}>
                {(status === 'installing' || status === 'starting') 
                  ? <span className="text-green-400">✓</span> 
                  : <Loader2 className="h-3 w-3 animate-spin" />}
                Iniciando WebContainer
              </div>
              <div className={cn(
                "flex items-center gap-2 text-sm transition-colors",
                status === 'installing' ? "text-violet-400" :
                status === 'starting' ? "text-green-400" : "text-neutral-500"
              )}>
                {status === 'starting' 
                  ? <span className="text-green-400">✓</span>
                  : status === 'installing' 
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <span className="text-neutral-600">○</span>}
                Instalando dependências
              </div>
              <div className={cn(
                "flex items-center gap-2 text-sm transition-colors",
                status === 'starting' ? "text-violet-400" : "text-neutral-500"
              )}>
                {status === 'starting' 
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <span className="text-neutral-600">○</span>}
                Iniciando servidor
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Botão Limpar Cache - Canto inferior esquerdo */}
      <div className="absolute bottom-4 left-4 z-10">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (confirm('Isso vai limpar o cache do projeto e recarregar a página. Continuar?')) {
              localStorage.removeItem('app-builder-store');
              window.location.reload();
            }
          }}
          className="text-xs text-orange-500 hover:text-orange-400 hover:bg-orange-500/10 gap-1"
        >
          <Trash2 className="h-3 w-3" />
          Limpar cache
        </Button>
      </div>
    </div>
  );
}
