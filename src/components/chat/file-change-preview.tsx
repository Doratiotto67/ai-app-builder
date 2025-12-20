'use client';

import { motion } from 'framer-motion';
import { FileCode, FileText, Image, PenLine, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type FileAction = 'created' | 'edited' | 'deleted';

interface FileChange {
  path: string;
  action: FileAction;
  language?: string;
}

interface FileChangePreviewProps {
  files: FileChange[];
  onFileClick?: (path: string) => void;
  className?: string;
}

const actionIcons: Record<FileAction, typeof Plus> = {
  created: Plus,
  edited: PenLine,
  deleted: Trash2,
};

const actionLabels: Record<FileAction, string> = {
  created: 'Criado',
  edited: 'Editado',
  deleted: 'Removido',
};

const actionColors: Record<FileAction, string> = {
  created: 'text-green-400',
  edited: 'text-blue-400',
  deleted: 'text-red-400',
};

function getFileIcon(path: string) {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  if (['tsx', 'jsx', 'ts', 'js'].includes(ext)) return FileCode;
  if (['png', 'jpg', 'jpeg', 'svg', 'gif', 'webp'].includes(ext)) return Image;
  return FileText;
}

export function FileChangePreview({ files, onFileClick, className }: FileChangePreviewProps) {
  if (files.length === 0) return null;

  return (
    <div className={cn('w-full', className)}>
      <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2 px-1">
        Alterações ({files.length})
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {files.map((file, idx) => {
          const ActionIcon = actionIcons[file.action];
          const FileIcon = getFileIcon(file.path);
          const fileName = file.path.split('/').pop() || file.path;
          const dirPath = file.path.split('/').slice(0, -1).join('/');

          return (
            <motion.button
              key={`${file.path}-${idx}`}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ scale: 1.01, x: 2 }}
              whileTap={{ scale: 0.99 }}
              transition={{ delay: idx * 0.03, duration: 0.2 }}
              onClick={() => onFileClick?.(file.path)}
              className="group flex items-center gap-3 p-2 rounded-lg bg-zinc-900/40 border border-zinc-800/60 hover:border-zinc-700 hover:bg-zinc-800/60 transition-all text-left w-full overflow-hidden"
              title={file.path}
            >
              <div className={cn(
                "flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center bg-zinc-800/50 border border-zinc-700/30 group-hover:border-zinc-600 transition-colors",
                actionColors[file.action]
              )}>
                <FileIcon className="h-4 w-4 opacity-70 group-hover:opacity-100" />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[12px] font-medium text-zinc-300 group-hover:text-zinc-100 truncate">
                    {fileName}
                  </span>
                </div>
                {dirPath && (
                  <div className="text-[10px] text-zinc-500 truncate group-hover:text-zinc-400">
                    {dirPath}
                  </div>
                )}
              </div>

              <div className={cn(
                "flex-shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-zinc-900/50 border border-zinc-800",
                actionColors[file.action].replace('text-', 'text-').replace('400', '500')
              )}>
                {actionLabels[file.action]}
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

export default FileChangePreview;
