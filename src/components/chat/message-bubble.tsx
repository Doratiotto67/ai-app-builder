'use client';

import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Bot,
  User,
  ChevronDown,
  ChevronUp,
  FileCode,
  Check,
  Loader2,
  Copy,
} from 'lucide-react';
import type { ChatMessage } from '@/types/database';

interface ExtractedFile {
  path: string;
  language: string;
}

interface MessageBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
  extractedFiles?: ExtractedFile[];
  onCreateFiles?: () => void;
  filesCreated?: boolean;
  isCreatingFiles?: boolean;
}

// Extrair resumo da mensagem (primeiras linhas antes do código)
function extractSummary(content: string): string {
  const lines = content.split('\n');
  const summaryLines: string[] = [];
  
  for (const line of lines) {
    // Parar quando encontrar bloco de código
    if (line.startsWith('```')) break;
    // Ignorar linhas vazias no início
    if (summaryLines.length === 0 && !line.trim()) continue;
    // Limitar a 3 linhas
    if (summaryLines.length >= 3) break;
    summaryLines.push(line);
  }
  
  return summaryLines.join('\n') || 'Gerando resposta...';
}

// Extrair nomes de arquivos mencionados
function extractFileNames(content: string): ExtractedFile[] {
  const files: ExtractedFile[] = [];
  const regex = /```(\w+)?\s*\n?(?:\/\/\s*(.+\.\w+)|#\s*(.+\.\w+))?\n/g;
  
  let match;
  while ((match = regex.exec(content)) !== null) {
    const language = match[1] || 'text';
    const filename = match[2] || match[3];
    if (filename) {
      files.push({ path: filename, language });
    }
  }
  
  return files;
}

export function MessageBubble({
  message,
  isStreaming = false,
  extractedFiles = [],
  onCreateFiles,
  filesCreated = false,
  isCreatingFiles = false,
}: MessageBubbleProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isUser = message.role === 'user';
  
  const content = message.content || '';
  const summary = useMemo(() => extractSummary(content), [content]);
  const files = useMemo(() => 
    extractedFiles.length > 0 ? extractedFiles : extractFileNames(content), 
    [content, extractedFiles]
  );
  
  const hasCode = content.includes('```');
  
  // Copiar conteúdo
  const handleCopy = () => {
    navigator.clipboard.writeText(content);
  };

  if (isUser) {
    return (
      <div className="flex justify-end mb-3 px-4">
        <div className="flex items-start gap-2 max-w-[85%]">
          <div className="bg-violet-600 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm">
            {content}
          </div>
          <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center shrink-0">
            <User className="h-4 w-4 text-zinc-300" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4 px-4">
      <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-700/30 bg-zinc-800/30">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
            <Bot className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-sm font-medium text-zinc-200">AI Assistant</span>
          {isStreaming && (
            <div className="flex items-center gap-1.5 text-xs text-violet-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Gerando...</span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="px-4 py-3">
          {/* Summary */}
          <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
            {summary}
          </p>

          {/* Files List */}
          {files.length > 0 && (
            <div className="mt-3 pt-3 border-t border-zinc-700/30">
              <div className="flex items-center gap-2 mb-2 text-xs text-zinc-400">
                <FileCode className="h-3.5 w-3.5" />
                <span>Arquivos:</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {files.map((file, i) => (
                  <Badge
                    key={i}
                    variant="secondary"
                    className="bg-zinc-700/50 text-zinc-300 text-xs px-2 py-0.5"
                  >
                    {file.path}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Expanded Code View */}
          {isExpanded && hasCode && (
            <div className="mt-3 pt-3 border-t border-zinc-700/30">
              <pre className="text-xs text-zinc-400 bg-zinc-900/50 rounded-lg p-3 overflow-x-auto max-h-[400px]">
                {content}
              </pre>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-zinc-700/30 bg-zinc-800/20">
          <div className="flex items-center gap-2">
            {hasCode && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExpanded(!isExpanded)}
                className="h-7 px-2 text-xs text-zinc-400 hover:text-white"
              >
                {isExpanded ? (
                  <>
                    <ChevronUp className="h-3.5 w-3.5 mr-1" />
                    Ocultar código
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3.5 w-3.5 mr-1" />
                    Ver código
                  </>
                )}
              </Button>
            )}
            
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className="h-7 px-2 text-xs text-zinc-400 hover:text-white"
            >
              <Copy className="h-3.5 w-3.5 mr-1" />
              Copiar
            </Button>
          </div>

          {files.length > 0 && onCreateFiles && !filesCreated && (
            <Button
              size="sm"
              onClick={onCreateFiles}
              disabled={isCreatingFiles}
              className="h-7 px-3 text-xs bg-violet-600 hover:bg-violet-500 text-white"
            >
              {isCreatingFiles ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  Criando...
                </>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5 mr-1" />
                  Criar Arquivos
                </>
              )}
            </Button>
          )}

          {filesCreated && (
            <div className="flex items-center gap-1.5 text-xs text-green-400">
              <Check className="h-3.5 w-3.5" />
              <span>{files.length} arquivo(s) criado(s)</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
