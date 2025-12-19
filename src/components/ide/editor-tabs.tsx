'use client';

import { useIDEStore } from '@/stores/ide-store';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';

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
    <div className="h-9 border-b bg-muted/30 shrink-0">
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
                  'group flex items-center gap-2 px-3 h-full border-r cursor-pointer min-w-0',
                  isActive
                    ? 'bg-background border-t-2 border-t-primary'
                    : 'bg-muted/50 hover:bg-muted'
                )}
                onClick={() => setActiveFile(file)}
              >
                <span
                  className={cn(
                    'text-sm truncate max-w-32',
                    unsaved && 'italic'
                  )}
                >
                  {fileName}
                  {unsaved && ' •'}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 p-0 opacity-0 group-hover:opacity-100"
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
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
