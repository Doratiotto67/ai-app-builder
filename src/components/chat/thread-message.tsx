'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Bot, User, Copy, Check, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StepViewer } from './step-viewer';
import { FileChangePreview, type FileAction } from './file-change-preview';
import ReactMarkdown from 'react-markdown';

interface FileChange {
  path: string;
  action: FileAction;
  language?: string;
}

interface Step {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'error';
}

interface ThreadMessageProps {
  role: 'user' | 'assistant';
  content: string;
  images?: string[]; // Base64 or URLs
  steps?: Step[];
  files?: FileChange[];
  isStreaming?: boolean;
  onFileClick?: (path: string) => void;
  className?: string;
}

// Extract summary text (before code blocks)
function extractSummary(content: string): string {
  const lines = content.split('\n');
  const summaryLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('```')) break;
    if (summaryLines.length === 0 && !line.trim()) continue;
    summaryLines.push(line);
  }

  return summaryLines.join('\n') || content;
}

// Check if content has code blocks
function hasCodeBlocks(content: string): boolean {
  return content.includes('```');
}

export function ThreadMessage({
  role,
  content,
  images,
  steps,
  files,
  isStreaming,
  onFileClick,
  className,
}: ThreadMessageProps) {
  const [copied, setCopied] = useState(false);
  const isUser = role === 'user';

  const summary = useMemo(() => extractSummary(content), [content]);
  const hasCode = useMemo(() => hasCodeBlocks(content), [content]);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // User message - Clean, right-aligned, with subtle border and glass effect
  if (isUser) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className={cn('chat-message flex flex-col items-end gap-2 px-4 py-2', className)}
      >
        <div className="flex items-start gap-4 max-w-[85%] group">
          <div className="relative">
            <div className="bg-zinc-800/40 backdrop-blur-md border border-zinc-700/50 rounded-2xl px-4 py-2.5 shadow-sm group-hover:border-zinc-600/60 transition-colors">
              <p className="text-[14px] text-zinc-100 leading-relaxed whitespace-pre-wrap font-medium">
                {content}
              </p>
            </div>
          </div>
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-zinc-800 to-zinc-700 border border-zinc-600/30 flex items-center justify-center shrink-0 mt-1 shadow-md text-zinc-400">
            <User className="h-4.5 w-4.5" />
          </div>
        </div>

        {/* User images */}
        {images && images.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-1 justify-end mr-12">
            {images.map((img, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-24 h-24 rounded-xl overflow-hidden border border-zinc-700/50 shadow-lg hover:border-violet-500/50 transition-colors cursor-zoom-in"
              >
                <img src={img} alt={`Anexo ${i + 1}`} className="w-full h-full object-cover" />
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    );
  }

  // Assistant message - Premium stream style with better spacing and typography
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className={cn('chat-message px-4 py-6 group/msg', className)}
    >
      <div className="assistant-message-container">
        {/* Avatar Area with Glow - Fixed Position */}
        <div className="assistant-avatar-fixed">
          <div className="relative shrink-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-pink-500 p-[1.5px] shadow-[0_0_20px_-5px_rgba(139,92,246,0.6)] animate-glow-pulse">
              <div className="w-full h-full rounded-[10px] bg-zinc-900 flex items-center justify-center">
                <Bot className="h-5 w-5 text-white animate-pulse-subtle" />
              </div>
            </div>
            {isStreaming && (
              <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-violet-500 border-2 border-zinc-950 rounded-full shadow-lg" />
            )}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 min-w-0 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[12px] font-bold text-zinc-100/90 tracking-wider uppercase">Assistente</span>
          </div>

          {/* Steps (Thinking process) */}
          {steps && steps.length > 0 && (
            <div className="mb-4">
              <StepViewer steps={steps} />
            </div>
          )}

          {/* Text Content */}
          <div className="prose prose-sm prose-invert max-w-none prose-pre:my-0">
            <div className="text-zinc-200 text-[15px] font-normal leading-relaxed tracking-tight selection:bg-violet-500/30">
              <ReactMarkdown
                components={{
                  hr: () => <hr className="my-6 border-zinc-800/50" />,
                  pre: () => null,
                  code: ({ children, className }) => {
                    const isCodeBlock = className?.includes('language-');
                    if (isCodeBlock) return null;
                    return (
                      <code className="bg-zinc-800/60 text-violet-300 px-1.5 py-0.5 rounded-md border border-white/5 font-mono text-[12.5px] align-middle tracking-tight shadow-sm mx-0.5">
                        {children}
                      </code>
                    );
                  },
                  p: ({ children }) => <p className="mb-4 last:mb-0 line-height-[1.6]">{children}</p>,
                  ul: ({ children }) => <ul className="space-y-2 my-4 pl-1">{children}</ul>,
                  li: ({ children }) => (
                    <li className="text-[14.5px] leading-relaxed text-zinc-300 flex gap-3 items-start group/li">
                      <span className="shrink-0 mt-2.5 w-1.5 h-1.5 rounded-full bg-violet-500/40 group-hover/li:bg-violet-500 transition-colors" />
                      <div>{children}</div>
                    </li>
                  ),
                  strong: ({ children }) => <span className="font-bold text-white tracking-wide">{children}</span>,
                }}
              >
                {hasCode ? summary : content}
              </ReactMarkdown>
            </div>
          </div>

          {/* Cursor */}
          {isStreaming && (
            <motion.div
              animate={{ opacity: [1, 0, 1] }}
              transition={{ repeat: Infinity, duration: 1 }}
              className="inline-block w-1.5 h-4.5 bg-violet-500 rounded-full ml-1 align-middle shadow-[0_0_12px_rgba(139,92,246,0.8)]"
            />
          )}

          {/* File Changes Preview */}
          {files && files.length > 0 && (
            <div className="mt-8 pt-6 border-t border-zinc-800/30">
              <FileChangePreview files={files} onFileClick={onFileClick} />
            </div>
          )}

          {/* Subtle Actions Bar */}
          {!isStreaming && content.length > 20 && (
            <div className="flex items-center gap-4 mt-6 opacity-0 group-hover/msg:opacity-100 transition-all duration-300 transform translate-y-1 group-hover/msg:translate-y-0">
              <button
                onClick={handleCopy}
                className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-zinc-500 hover:text-zinc-200 transition-all bg-zinc-900/40 hover:bg-zinc-800/60 px-3 py-1.5 rounded-lg border border-zinc-800/50 hover:border-zinc-700 shadow-sm"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-green-400" />
                    <span className="text-green-400">Copiado</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copiar Resposta
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default ThreadMessage;
