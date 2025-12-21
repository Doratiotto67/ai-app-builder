'use client';

import { useState, useRef, useCallback, KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Plus,
  Wand2,
  MessageSquare,
  Volume2,
  ArrowUp,
  Loader2,
  MousePointerClick,
  X,
} from 'lucide-react';

interface ChatInputProps {
  onSubmit: (message: string) => void;
  onFixCode?: () => void;
  onToggleVisualEdit?: () => void;
  isLoading?: boolean;
  isFixing?: boolean;
  isVisualEditMode?: boolean;
  selectedTarget?: string | null;
  onClearTarget?: () => void;
  placeholder?: string;
}

export function ChatInput({
  onSubmit,
  onFixCode,
  onToggleVisualEdit,
  isLoading = false,
  isFixing = false,
  isVisualEditMode = false,
  selectedTarget = null,
  onClearTarget,
  placeholder = 'Descreva o que você quer criar...',
}: ChatInputProps) {
  const [value, setValue] = useState('');
  const [mode, setMode] = useState<'chat' | 'code'>('chat');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(() => {
    if (!value.trim() || isLoading) return;
    onSubmit(value.trim());
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, isLoading, onSubmit]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const handleTextareaChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setValue(e.target.value);
      // Auto-resize
      const textarea = e.target;
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    },
    []
  );

  return (
    <div className="p-3 bg-zinc-900/95 backdrop-blur-xl border-t border-zinc-800/50">
      {/* Textarea Container */}
      <div className="relative bg-zinc-800/80 rounded-xl border border-zinc-700/50 overflow-hidden transition-all focus-within:border-violet-500/50 focus-within:ring-1 focus-within:ring-violet-500/20">
        {/* Target Selected Badge */}
        {selectedTarget && (
          <div className="flex items-center gap-2 px-3 py-2 bg-cyan-900/30 border-b border-cyan-700/30">
            <MousePointerClick className="h-3.5 w-3.5 text-cyan-400" />
            <span className="text-xs text-cyan-400">Editando:</span>
            <span className="text-xs text-white font-mono bg-cyan-800/50 px-2 py-0.5 rounded">
              {selectedTarget.split('/').pop()}
            </span>
            <button
              onClick={onClearTarget}
              className="text-cyan-400 hover:text-white p-0.5 ml-auto"
              title="Limpar seleção"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleTextareaChange}
          onKeyDown={handleKeyDown}
          placeholder={selectedTarget ? `O que você quer mudar em ${selectedTarget.split('/').pop()}?` : placeholder}
          disabled={isLoading}
          rows={1}
          className={cn(
            'w-full px-4 py-3 bg-transparent text-white placeholder-zinc-500',
            'resize-none outline-none text-sm leading-relaxed',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'min-h-[44px] max-h-[200px]'
          )}
        />

        {/* Bottom Bar */}
        <div className="flex items-center justify-between px-2 py-2 border-t border-zinc-700/30">
          {/* Left Icons */}
          <div className="flex items-center gap-1">
            {/* Plus Button */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-zinc-400 hover:text-white hover:bg-zinc-700/50 rounded-lg"
              title="Adicionar"
            >
              <Plus className="h-4 w-4" />
            </Button>

            {/* Visual Edits Button */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onToggleVisualEdit}
              className={cn(
                'h-8 px-3 gap-1.5 rounded-lg text-xs font-medium transition-colors',
                isVisualEditMode
                  ? 'bg-cyan-600 text-white hover:bg-cyan-500'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-700/50'
              )}
              title="Edição Visual - Clique em um componente no preview"
            >
              <MousePointerClick className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Visual</span>
            </Button>

            {/* Fix Code Button */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onFixCode}
              disabled={isFixing}
              className={cn(
                'h-8 px-3 gap-1.5 text-zinc-400 hover:text-white hover:bg-zinc-700/50 rounded-lg text-xs font-medium',
                isFixing && 'text-violet-400'
              )}
              title="Corrigir código"
            >
              {isFixing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wand2 className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">Corrigir</span>
            </Button>
          </div>

          {/* Right Icons */}
          <div className="flex items-center gap-1">
            {/* Mode Toggle */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setMode(mode === 'chat' ? 'code' : 'chat')}
              className={cn(
                'h-8 px-3 gap-1.5 rounded-lg text-xs font-medium transition-colors',
                mode === 'chat'
                  ? 'bg-violet-600 text-white hover:bg-violet-500'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-700/50'
              )}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span>Chat</span>
            </Button>

            {/* Audio Button */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-zinc-400 hover:text-white hover:bg-zinc-700/50 rounded-lg"
              title="Voz"
            >
              <Volume2 className="h-4 w-4" />
            </Button>

            {/* Send Button */}
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={!value.trim() || isLoading}
              className={cn(
                'h-8 w-8 p-0 rounded-full transition-all',
                value.trim() && !isLoading
                  ? 'bg-violet-600 hover:bg-violet-500 text-white'
                  : 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
              )}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Helper Text */}
      <p className="text-[10px] text-zinc-600 text-center mt-2">
        Enter para enviar • Shift+Enter para nova linha {selectedTarget && '• 🎯 Modo Cirúrgico ativo'}
      </p>
    </div>
  );
}
