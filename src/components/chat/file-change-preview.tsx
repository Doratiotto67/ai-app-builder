'use client';

import { motion } from 'framer-motion';
import { FileCode, FileText, Image, PenLine, Plus, Trash2, FileJson, FileType } from 'lucide-react';
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
  if (['tsx', 'jsx'].includes(ext)) return FileCode;
  if (['ts', 'js'].includes(ext)) return FileType;
  if (ext === 'json') return FileJson;
  if (['png', 'jpg', 'jpeg', 'svg', 'gif', 'webp'].includes(ext)) return Image;
  if (ext === 'css') return FileText;
  return FileText;
}

export function FileChangePreview({ files, onFileClick, className }: FileChangePreviewProps) {
  if (files.length === 0) return null;

  return (
    <div className={cn('w-full space-y-3', className)}>
      <div className="flex items-center justify-between px-1">
        <h4 className="text-[11px] font-bold text-zinc-500 uppercase tracking-[0.2em]">
          Arquivos Gerados <span className="text-zinc-700 ml-1">•</span> <span className="ml-1 text-zinc-400">{files.length}</span>
        </h4>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {files.map((file, idx) => {
          const ActionIcon = actionIcons[file.action];
          const FileIcon = getFileIcon(file.path);
          const fileName = file.path.split('/').pop() || file.path;
          const dirPath = file.path.split('/').slice(0, -1).join('/');

          return (
            <motion.button
              key={`${file.path}-${idx}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ scale: 1.02, transition: { duration: 0.2 } }}
              whileTap={{ scale: 0.98 }}
              transition={{ delay: idx * 0.04, duration: 0.3, ease: 'easeOut' }}
              onClick={() => onFileClick?.(file.path)}
              className="file-card group text-left w-full flex items-center gap-4"
              title={file.path}
            >
              {/* Icon Container with specific language colors */}
              <div className={cn(
                "relative flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-all bg-zinc-900/60 border border-white/5 group-hover:border-violet-500/30 group-hover:shadow-[0_0_15px_-5px_rgba(139,92,246,0.3)]",
                actionColors[file.action].replace('text-', 'text-opacity-90 ')
              )}>
                <FileIcon className="h-5 w-5 opacity-60 group-hover:opacity-100 transition-opacity" />

                {/* Micro Action Badge */}
                <div className={cn(
                  "absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center border-2 border-zinc-950 shadow-lg transition-transform group-hover:scale-110",
                  file.action === 'created' ? 'bg-emerald-500' :
                    file.action === 'edited' ? 'bg-amber-500' : 'bg-rose-500'
                )}>
                  <ActionIcon className="h-2.5 w-2.5 text-white" />
                </div>
              </div>

              <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                <span className="text-[13.5px] font-semibold text-zinc-200 group-hover:text-white transition-colors truncate tracking-tight">
                  {fileName}
                </span>
                {dirPath && (
                  <span className="text-[10.5px] font-medium text-zinc-500 group-hover:text-zinc-400 transition-colors truncate tracking-wide">
                    {dirPath}
                  </span>
                )}
              </div>

              {/* Status Indicator */}
              <div className="flex-shrink-0 pr-1">
                <div className={cn(
                  "px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border transition-all",
                  file.action === 'created' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 group-hover:bg-emerald-500/20" :
                    file.action === 'edited' ? "bg-amber-500/10 border-amber-500/20 text-amber-400 group-hover:bg-amber-500/20" :
                      "bg-rose-500/10 border-rose-500/20 text-rose-400 group-hover:bg-rose-500/20"
                )}>
                  {actionLabels[file.action]}
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

export default FileChangePreview;
