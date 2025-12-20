'use client';

import { useIDEStore } from '@/stores/ide-store';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { getFileIcon } from '@/lib/utils';


export function EditorTabs() {
  const { openFiles, activeFile, setActiveFile, closeFile, hasUnsavedChanges } =
    useIDEStore();

  if (openFiles.length === 0) {
    return (
      <div className="h-9 border-b bg-muted/30 flex items-center px-4">
        <span className="text-xs text-muted-foreground">
          Nenhum arquivo aberto
        </span>
      </div>
    );
  }

  return (
    <div className="h-9 border-b border-zinc-800 bg-zinc-900 shrink-0">
      <ScrollArea className="h-full w-full">
        <div className="flex h-full">
          {openFiles.map((file) => {
            const isActive = activeFile?.id === file.id;
            const unsaved = hasUnsavedChanges(file.id);
            const fileName = file.path.split('/').pop() || file.path;

            return (
              <div
                key={file.id}
                className={cn(
                  'group flex items-center gap-2 px-3 h-full border-r border-zinc-800 cursor-pointer min-w-0 transition-colors select-none',
                  isActive
                    ? 'bg-zinc-950 border-t-2 border-t-violet-500 text-zinc-100'
                    : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 border-t-2 border-t-transparent'
                )}
                onClick={() => setActiveFile(file)}
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="text-xs">{getFileIcon(fileName)}</span>
                  <span
                    className={cn(
                      'text-xs truncate max-w-32 font-medium',
                      unsaved && 'italic text-yellow-500/80'
                    )}
                  >
                    {fileName}
                    {unsaved && '*'}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-4 w-4 p-0 opacity-0 group-hover:opacity-100 hover:bg-zinc-700/50 rounded-sm transition-all",
                    isActive ? "text-zinc-400 hover:text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeFile(file.id);
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" className="h-2" />
      </ScrollArea>
    </div>
  );
}
