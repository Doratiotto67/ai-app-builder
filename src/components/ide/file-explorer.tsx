'use client';

import { useIDEStore } from '@/stores/ide-store';
import { cn, getFileIcon } from '@/lib/utils';
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface FileTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileTreeNode[];
  isOpen?: boolean;
}



function TreeNode({ node, depth = 0 }: { node: FileTreeNode; depth?: number }) {
  const { toggleFolder, openFile, files, activeFile } = useIDEStore();

  const handleClick = () => {
    if (node.isDirectory) {
      toggleFolder(node.path);
    } else {
      // Normalizar path para busca (remover barra inicial se houver)
      const normalizedNodePath = node.path.replace(/^\/+/, '');
      const file = files.find((f) => {
        const normalizedFilePath = f.path.replace(/^\/+/, '');
        return normalizedFilePath === normalizedNodePath;
      });
      if (file) {
        openFile(file);
      } else {
        console.warn('Arquivo não encontrado:', node.path, 'Files:', files.map(f => f.path));
      }
    }
  };

  const isActive = activeFile?.path === node.path;

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1.5 py-1 px-2 cursor-pointer transition-colors text-sm rounded-sm',
          'hover:bg-zinc-800/80 hover:text-zinc-100',
          isActive ? 'bg-violet-500/20 text-violet-300' : 'text-zinc-400'
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={handleClick}
      >
        {node.isDirectory ? (
          <>
            {node.isOpen ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            {node.isOpen ? (
              <FolderOpen className="h-4 w-4 shrink-0 text-yellow-500" />
            ) : (
              <Folder className="h-4 w-4 shrink-0 text-yellow-500" />
            )}
          </>
        ) : (
          <>
            <span className="w-4" />
            <span className="text-xs">{getFileIcon(node.name)}</span>
          </>
        )}
        <span className="truncate">{node.name}</span>
      </div>
      {node.isDirectory && node.isOpen && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeNode key={child.path} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileExplorer() {
  const { fileTree, currentProject } = useIDEStore();

  if (fileTree.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        <p className="mb-2">Nenhum arquivo ainda.</p>
        <p>Use o chat para criar seu primeiro arquivo!</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="py-2">
        <div className="px-2 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {currentProject?.name || 'Projeto'}
        </div>
        {fileTree.map((node) => (
          <TreeNode key={node.path} node={node} />
        ))}
      </div>
    </ScrollArea>
  );
}
