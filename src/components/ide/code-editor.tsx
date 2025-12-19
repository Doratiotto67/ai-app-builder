'use client';

import { useEffect, useRef, useCallback } from 'react';
import Editor, { Monaco, OnMount } from '@monaco-editor/react';
import { useIDEStore } from '@/stores/ide-store';
import { Skeleton } from '@/components/ui/skeleton';

function getLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  const languageMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    json: 'json',
    md: 'markdown',
    css: 'css',
    scss: 'scss',
    html: 'html',
    xml: 'xml',
    yaml: 'yaml',
    yml: 'yaml',
    py: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    sql: 'sql',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
  };
  return languageMap[ext || ''] || 'plaintext';
}

export function CodeEditor() {
  const { activeFile, editorContent, setEditorContent, theme } = useIDEStore();
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Monaco | null>(null);

  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Configure editor
    editor.updateOptions({
      minimap: { enabled: true },
      fontSize: 14,
      fontFamily: "'Geist Mono', 'Fira Code', 'Consolas', monospace",
      fontLigatures: true,
      lineNumbers: 'on',
      renderWhitespace: 'selection',
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      bracketPairColorization: { enabled: true },
      guides: {
        bracketPairs: true,
        indentation: true,
      },
      padding: { top: 16 },
    });

    // Define custom theme
    monaco.editor.defineTheme('ai-builder-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6A737D', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'F472B6' },
        { token: 'string', foreground: '9ECE6A' },
        { token: 'number', foreground: 'FF9E64' },
        { token: 'type', foreground: '7DCFFF' },
        { token: 'function', foreground: 'BB9AF7' },
      ],
      colors: {
        'editor.background': '#0D0D0D',
        'editor.foreground': '#E5E5E5',
        'editorCursor.foreground': '#A855F7',
        'editor.lineHighlightBackground': '#1A1A1A',
        'editorLineNumber.foreground': '#4B5563',
        'editorLineNumber.activeForeground': '#9CA3AF',
        'editor.selectionBackground': '#7C3AED33',
        'editor.inactiveSelectionBackground': '#7C3AED22',
      },
    });

    monaco.editor.defineTheme('ai-builder-light', {
      base: 'vs',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#FFFFFF',
        'editor.foreground': '#1F2937',
        'editorCursor.foreground': '#7C3AED',
        'editor.lineHighlightBackground': '#F3F4F6',
        'editorLineNumber.foreground': '#9CA3AF',
        'editorLineNumber.activeForeground': '#374151',
        'editor.selectionBackground': '#7C3AED33',
      },
    });
  }, []);

  // Update theme when it changes
  useEffect(() => {
    if (monacoRef.current) {
      monacoRef.current.editor.setTheme(
        theme === 'dark' ? 'ai-builder-dark' : 'ai-builder-light'
      );
    }
  }, [theme]);

  // Update editor content when active file changes
  useEffect(() => {
    if (activeFile && editorRef.current) {
      const content =
        editorContent[activeFile.id] ?? (activeFile as unknown as {content?: string}).content ?? activeFile.content_text ?? '';
      const model = editorRef.current.getModel();
      if (model && model.getValue() !== content) {
        editorRef.current.setValue(content);
      }
    }
  }, [activeFile?.id]);

  const handleChange = useCallback(
    (value: string | undefined) => {
      if (activeFile && value !== undefined) {
        setEditorContent(activeFile.id, value);
      }
    },
    [activeFile, setEditorContent]
  );

  if (!activeFile) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-background text-muted-foreground">
        <div className="text-6xl mb-4">👋</div>
        <h2 className="text-xl font-semibold mb-2">Bem-vindo ao AI App Builder</h2>
        <p className="text-sm max-w-md text-center">
          Use o chat para descrever o que você quer criar e a IA vai gerar o código para você.
        </p>
      </div>
    );
  }

  return (
    <Editor
      height="100%"
      language={getLanguage(activeFile.path)}
      value={editorContent[activeFile.id] ?? (activeFile as unknown as {content?: string}).content ?? activeFile.content_text ?? ''}
      onChange={handleChange}
      onMount={handleEditorMount}
      theme={theme === 'dark' ? 'ai-builder-dark' : 'ai-builder-light'}
      loading={
        <div className="h-full w-full p-4">
          <Skeleton className="h-4 w-3/4 mb-2" />
          <Skeleton className="h-4 w-1/2 mb-2" />
          <Skeleton className="h-4 w-2/3 mb-2" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      }
      options={{
        readOnly: false,
        automaticLayout: true,
      }}
    />
  );
}
