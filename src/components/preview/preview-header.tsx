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
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type DeviceType = 'desktop' | 'tablet' | 'mobile';

interface PreviewHeaderProps {
  device: DeviceType;
  setDevice: (d: DeviceType) => void;
  urlInput: string;
  setUrlInput: (url: string) => void;
  status: 'idle' | 'booting' | 'installing' | 'starting' | 'ready' | 'error';
  onRefresh: () => void;
  activeUrl: string | null;
}

export function PreviewHeader({
  device,
  setDevice,
  urlInput,
  setUrlInput,
  status,
  onRefresh,
  activeUrl,
}: PreviewHeaderProps) {
  const devices = [
    { id: 'mobile' as const, icon: Smartphone, label: 'Mobile' },
    { id: 'tablet' as const, icon: Tablet, label: 'Tablet' },
    { id: 'desktop' as const, icon: Monitor, label: 'Desktop' },
  ];

  const statusConfig = {
    idle: { label: 'Parado', color: 'bg-neutral-500' },
    booting: { label: 'Iniciando...', color: 'bg-yellow-500' },
    installing: { label: 'Instalando...', color: 'bg-yellow-500' },
    starting: { label: 'Carregando...', color: 'bg-blue-500' },
    ready: { label: 'Pronto', color: 'bg-green-500' },
    error: { label: 'Erro', color: 'bg-red-500' },
  };

  return (
    <div className="h-12 border-b border-white/5 bg-black/20 backdrop-blur-sm flex items-center gap-2 px-3 shrink-0">
      <div className="flex items-center gap-1 bg-black/40 rounded-lg p-1">
        {devices.map((d) => (
          <Button
            key={d.id}
            variant="ghost"
            size="sm"
            className={cn(
              'h-7 w-7 p-0 hover:bg-white/10 text-zinc-400 hover:text-white', 
              device === d.id && 'bg-white/20 text-white shadow-sm'
            )}
            onClick={() => setDevice(d.id)}
            title={d.label}
          >
            <d.icon className="h-4 w-4" />
          </Button>
        ))}
      </div>

      <div className="flex-1 flex items-center gap-2 bg-black/40 rounded-md px-2 h-8 border border-white/5 focus-within:border-white/20 transition-colors">
        <Globe className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
        <Input
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          className="h-full border-none bg-transparent text-xs text-zinc-300 placeholder:text-zinc-600 focus-visible:ring-0 px-0"
          placeholder="/"
        />
      </div>

      <Badge 
        variant="secondary" 
        className={cn(
          "text-[10px] h-6 px-2 gap-1.5 font-medium border-0",
          status === 'error' ? "bg-red-500/10 text-red-400" : 
          status === 'ready' ? "bg-green-500/10 text-green-400" :
          "bg-blue-500/10 text-blue-400"
        )}
      >
        <div className={cn('h-1.5 w-1.5 rounded-full animate-pulse', statusConfig[status].color)} />
        {statusConfig[status].label}
      </Badge>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          className="h-8 w-8 p-0 text-zinc-400 hover:text-white hover:bg-white/10"
          disabled={status !== 'ready'}
          title="Atualizar preview"
        >
          <RefreshCw className={cn("h-4 w-4", status === 'booting' && "animate-spin")} />
        </Button>

        {activeUrl && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.open(activeUrl, '_blank')}
            className="h-8 w-8 p-0 text-zinc-400 hover:text-white hover:bg-white/10"
            title="Abrir em nova aba"
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
