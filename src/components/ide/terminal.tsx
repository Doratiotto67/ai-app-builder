'use client';

import { useEffect, useRef, useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface TerminalLine {
  id: number;
  type: 'input' | 'output' | 'error';
  content: string;
}

export function Terminal() {
  const [lines, setLines] = useState<TerminalLine[]>([
    {
      id: 1,
      type: 'output',
      content: 'AI App Builder Terminal v1.0.0',
    },
    {
      id: 2,
      type: 'output',
      content: 'Digite "help" para ver os comandos disponíveis.',
    },
    {
      id: 3,
      type: 'output',
      content: '',
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    const newId = lines.length + 1;

    // Add input line
    setLines((prev) => [
      ...prev,
      { id: newId, type: 'input', content: `$ ${inputValue}` },
    ]);

    // Process command
    const command = inputValue.trim().toLowerCase();
    let response: TerminalLine;

    switch (command) {
      case 'help':
        response = {
          id: newId + 1,
          type: 'output',
          content: `Comandos disponíveis:
  help     - Mostra esta ajuda
  clear    - Limpa o terminal
  status   - Mostra status do projeto
  build    - Executa build do projeto
  preview  - Abre preview`,
        };
        break;
      case 'clear':
        setLines([]);
        setInputValue('');
        return;
      case 'status':
        response = {
          id: newId + 1,
          type: 'output',
          content: '✓ Projeto pronto. Nenhum erro encontrado.',
        };
        break;
      case 'build':
        response = {
          id: newId + 1,
          type: 'output',
          content: '⏳ Executando build... (simulado)',
        };
        break;
      default:
        response = {
          id: newId + 1,
          type: 'error',
          content: `Comando não reconhecido: ${inputValue}`,
        };
    }

    setLines((prev) => [...prev, response]);
    setInputValue('');
  };

  return (
    <div
      className="h-full flex flex-col bg-[#0D0D0D] text-green-400 font-mono text-sm"
      onClick={() => inputRef.current?.focus()}
    >
      <div className="h-8 flex items-center justify-between px-4 border-b border-neutral-800">
        <span className="text-xs text-neutral-500">Terminal</span>
      </div>
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        {lines.map((line) => (
          <div
            key={line.id}
            className={
              line.type === 'error'
                ? 'text-red-400'
                : line.type === 'input'
                ? 'text-neutral-300'
                : 'text-green-400'
            }
          >
            <pre className="whitespace-pre-wrap">{line.content}</pre>
          </div>
        ))}
        <form onSubmit={handleSubmit} className="flex items-center mt-1">
          <span className="text-neutral-500 mr-2">$</span>
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            className="flex-1 bg-transparent outline-none text-neutral-100"
            autoFocus
          />
        </form>
      </ScrollArea>
    </div>
  );
}
