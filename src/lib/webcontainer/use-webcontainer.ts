'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { WebContainer } from '@webcontainer/api';
import {
  getWebContainer,
  mountFiles,
  writeFile,
  installDependencies,
  startDevServer,
  destroyWebContainer,
  createBaseProject,
  convertToFileTree,
} from './webcontainer';
import { webcontainerLog } from '@/lib/debug/logger';


interface UseWebContainerOptions {
  autoStart?: boolean;
  onTerminalOutput?: (data: string) => void;
  onServerReady?: (url: string) => void;
  onError?: (error: Error) => void;
}

interface WebContainerState {
  status: 'idle' | 'booting' | 'installing' | 'starting' | 'ready' | 'error';
  error: Error | null;
  previewUrl: string | null;
  terminalOutput: string[];
}

// Deep merge para combinar projeto base com arquivos do usuário
function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      // Se ambos são objetos, mergear recursivamente
      const sourceObj = source[key] as Record<string, unknown>;
      const targetObj = target[key] as Record<string, unknown>;

      // Se é um diretório, mergear conteúdo
      if ('directory' in sourceObj && 'directory' in targetObj) {
        result[key] = {
          directory: deepMerge(
            targetObj.directory as Record<string, unknown>,
            sourceObj.directory as Record<string, unknown>
          ),
        };
      } else {
        result[key] = deepMerge(targetObj, sourceObj);
      }
    } else {
      // Sobrescrever com valor do source
      result[key] = source[key];
    }
  }

  return result;
}

// Função auxiliar para transformar arquivos do usuário para o formato Vite/WebContainer
function transformFileForVite(path: string, content: string): { path: string, content: string } {
  let transformedPath = path;
  let transformedContent = content;

  // SANITIZAÇÃO DE PATH
  transformedPath = transformedPath.replace(/^\/+/, ''); // Remover barras iniciais
  transformedPath = transformedPath.replace(/\\/g, '/'); // Converter backslash para forward slash

  // 1. Normalizar caminhos App.tsx ou App.jsx ou app/page.tsx → src/App.tsx
  // O Vite se confunde se houver múltiplos Apps. Vamos unificar tudo para src/App.tsx
  if (transformedPath.match(/^\/?(app\/page|src\/App|App)\.(tsx|jsx|js|ts)$/)) {
    transformedPath = 'src/App.tsx';
    // CRÍTICO: NÃO modificar exports - isso quebrava o código JSX antes!
    // Apenas remover 'use client'
    transformedContent = transformedContent
      .replace(/'use client';?\s*\n?/g, '')
      .replace(/"use client";?\s*\n?/g, '');
  }
  // 2. Mover arquivos de pastas conhecidas para src/
  const foldersToMove = ['app/', 'components/', 'lib/', 'hooks/', 'utils/', 'services/', 'context/'];
  const matchedFolder = foldersToMove.find(folder => transformedPath.startsWith(folder) || transformedPath.startsWith('/' + folder));

  if (matchedFolder && transformedPath !== 'src/App.tsx') {
    transformedPath = 'src/' + transformedPath.replace(/^\//, '');
  }

  // 4. Ajustar index.html
  if (transformedPath === 'index.html') {
    transformedContent = transformedContent
      .replace(/\/src\/main\.js(x)?/g, '/src/main.tsx')
      .replace(/src=['"]https:\/\/cdn\.tailwindcss\.com['"][^>]*><\/script>/g, '') // Remover CDN
      .replace(/<script[^>]*>\s*tailwind\.config\s*=\s*[\s\S]*?<\/script>/g, ''); // Remover config inline
  }

  // 5. CONVERSÕES DE COMPATIBILIDADE NEXT.JS -> VITE
  // Remover imports de Next.js
  transformedContent = transformedContent
    .replace(/import Head from ['"]next\/head['"];?\n?/g, '')
    .replace(/import Link from ['"]next\/link['"];?\n?/g, '')
    .replace(/import Image from ['"]next\/image['"];?\n?/g, '');

  // Substituir tags <Head> por fragmentos
  transformedContent = transformedContent
    .replace(/<Head>([\s\S]*?)<\/Head>/g, '<>$1</>')
    .replace(/<Head\s*>([\s\S]*?)<\/Head>/g, '<>$1</>');

  // Substituir <Link href="..."> por <a href="..."> APENAS SE NÃO FOR REACT ROUTER
  const hasReactRouter = transformedContent.includes("'react-router-dom'") || transformedContent.includes('"react-router-dom"');
  if (!hasReactRouter) {
    transformedContent = transformedContent.replace(/<Link\s+href={?(['"])([^'"]+)\1}?>/g, '<a href="$2">');
    transformedContent = transformedContent.replace(/<\/Link>/g, '</a>');
  }

  // Substituir <Image ... /> por <img ... />
  transformedContent = transformedContent.replace(/<Image\s+/g, '<img ');

  // 5.1 CORRIGIR ERROS DE SINTAXE JSX COMUNS
  // Padrão: <Link ... />{content}</Link> -> <Link ...>{content}</Link>
  // Este erro acontece quando a IA gera self-closing seguido de conteúdo
  transformedContent = transformedContent.replace(
    /(<(?:Link|a|button|span|div)[^>]*)\s*\/>\s*(\{[^}]+\}|\w+)\s*<\/(?:Link|a|button|span|div)>/g,
    '$1>$2</Link>'
  );

  // 5.2 Corrigir className cortado: className={` -> className=""
  transformedContent = transformedContent.replace(
    /className=\{`([^`]*?)$/gm,
    'className="$1"'
  );

  // 5.3 Corrigir template strings incompletas em className
  // className={`foo bar -> className="foo bar"
  transformedContent = transformedContent.replace(
    /className=\{`([^`}]+)(?!\`)\}/g,
    'className="$1"'
  );

  // 5.4 Remover template strings problemáticas com expressões
  // className={`text-${var} ...`} -> className="text-blue-500" (fallback seguro)
  transformedContent = transformedContent.replace(
    /className=\{`([^$`]*)\$\{[^}]+\}([^`]*)`\}/g,
    (match, before, after) => {
      // Remove expressões e mantém classes estáticas
      const cleanClasses = (before + after).replace(/\s+/g, ' ').trim();
      return `className="${cleanClasses || 'text-inherit'}"`;
    }
  );

  // 5.5 Corrigir expressões vazias: {} -> null
  transformedContent = transformedContent.replace(
    />\s*\{\s*\}\s*</g,
    '>{null}<'
  );

  // 5.6 Corrigir tags JSX não fechadas comuns (heurística simples)
  // <div className=... \n<p> -> <div className=...>\n<p>
  transformedContent = transformedContent.replace(
    /(<(?:div|span|p|section|article|header|footer|main|nav|aside)[^>]*[^/])\n(\s*<)/g,
    (match, tag, next) => {
      // Se a tag não termina com > ou />, adicionar >
      if (!tag.endsWith('>')) {
        return tag + '>\n' + next;
      }
      return match;
    }
  );

  // 5.7 Remover 'use client' (não necessário em Vite)
  transformedContent = transformedContent.replace(
    /['"]use client['"];?\s*\n?/g,
    ''
  );

  // 6. REMOVER BrowserRouter/Router DUPLICADO (já existe no main.tsx)
  // Isso evita o erro "cannot render a <Router> inside another <Router>"
  if (transformedPath.includes('App.tsx') || transformedPath.includes('App.jsx')) {
    // Remover imports de BrowserRouter
    transformedContent = transformedContent
      .replace(/import\s*{\s*BrowserRouter\s*(?:,\s*[^}]+)?}\s*from\s*['"]react-router-dom['"];?\n?/g, (match) => {
        // Manter outros imports do react-router-dom se existirem
        const otherImports = match.match(/{\s*BrowserRouter\s*,\s*([^}]+)}/);
        if (otherImports && otherImports[1]) {
          return `import { ${otherImports[1].trim()} } from 'react-router-dom';\n`;
        }
        return '';
      })
      .replace(/import\s*{\s*([^}]*),\s*BrowserRouter\s*}\s*from\s*['"]react-router-dom['"];?\n?/g,
        "import { $1 } from 'react-router-dom';\n")
      .replace(/import\s*{\s*([^}]*),\s*BrowserRouter\s*,\s*([^}]*)}\s*from\s*['"]react-router-dom['"];?\n?/g,
        "import { $1, $2 } from 'react-router-dom';\n");

    // Remover wrapper <BrowserRouter> mas manter o conteúdo interno
    transformedContent = transformedContent
      .replace(/<BrowserRouter>\s*/g, '')
      .replace(/\s*<\/BrowserRouter>/g, '');

    // Mesmo tratamento para Router (alias comum)
    transformedContent = transformedContent
      .replace(/<Router>\s*/g, '')
      .replace(/\s*<\/Router>/g, '');
  }

  // Adicionar crossorigin a outros scripts/links externos
  transformedContent = transformedContent.replace(/<script src="(https?:\/\/[^"]+)">/g, '<script src="$1" crossorigin>');
  transformedContent = transformedContent.replace(/<link([^>]*) href="(https?:\/\/[^"]+)"([^>]*)>/g, (match, before, url, after) => {
    if (match.includes('crossorigin')) return match;
    return `<link${before} href="${url}"${after} crossorigin>`;
  });

  // 7. GARANTIR QUE main.tsx SEMPRE TENHA BrowserRouter
  // Se a IA gerou um main.tsx sem BrowserRouter, precisamos corrigi-lo
  const normalizedPath = transformedPath.replace(/^\/+/, ''); // Remove leading slashes
  const isMainTsx = normalizedPath === 'src/main.tsx' ||
    normalizedPath === 'main.tsx' ||
    transformedPath.endsWith('main.tsx');

  if (isMainTsx) {
    transformedPath = 'src/main.tsx';

    // Verificar se o conteúdo tem BrowserRouter (case insensitive check para robustez)
    const hasBrowserRouter = transformedContent.includes('BrowserRouter');
    const hasAppReference = transformedContent.includes('App') &&
      (transformedContent.includes('createRoot') || transformedContent.includes('render'));

    console.log(`[transformFileForVite] main.tsx detectado - hasBrowserRouter: ${hasBrowserRouter}, hasAppReference: ${hasAppReference}`);

    // SEMPRE forçar o main.tsx correto com BrowserRouter
    // Esta é a abordagem mais segura para evitar o erro de useLocation
    transformedContent = `import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
`;
    console.log('[transformFileForVite] main.tsx corrigido com BrowserRouter');
  }

  return { path: transformedPath, content: transformedContent };
}

export function useWebContainer({
  autoStart = false,
  onTerminalOutput,
  onServerReady,
  onError,
}: UseWebContainerOptions = {}) {
  const [state, setState] = useState<WebContainerState>({
    status: 'idle',
    error: null,
    previewUrl: null,
    terminalOutput: [],
  });


  const containerRef = useRef<WebContainer | null>(null);
  const isInitializingRef = useRef(false);

  const appendOutput = useCallback((data: string) => {
    setState((prev) => ({
      ...prev,
      terminalOutput: [...prev.terminalOutput, data].slice(-100),
    }));
    onTerminalOutput?.(data);
  }, [onTerminalOutput]);

  const boot = useCallback(async () => {
    if (containerRef.current) return containerRef.current;

    setState((prev) => ({ ...prev, status: 'booting' }));
    appendOutput('Iniciando WebContainer...\n');

    try {
      const container = await getWebContainer();
      containerRef.current = container;
      return container;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to boot WebContainer');
      setState((prev) => ({ ...prev, status: 'error', error }));
      onError?.(error);
      throw error;
    }
  }, [appendOutput, onError]);

  const initProject = useCallback(
    async (files?: Array<{ path: string; content: string }>, projectId?: string) => {
      if (isInitializingRef.current) {
        webcontainerLog.warn('⏳ Inicialização já em curso, ignorando chamada duplicada.');
        return;
      }

      isInitializingRef.current = true;
      webcontainerLog.info('🚀 Iniciando projeto', { filesCount: files?.length || 0 });
      webcontainerLog.time('init-project');

      try {
        if (containerRef.current && state.status === 'error') {
          webcontainerLog.warn('⚠️ Reiniciando WebContainer devido a erro anterior');
          appendOutput('Reiniciando WebContainer...\n');
          destroyWebContainer();
          containerRef.current = null;
        }

        const container = await boot();
        webcontainerLog.success('✅ WebContainer iniciado');

        appendOutput('Preparando projeto base...\n');
        const baseProject = createBaseProject();

        let finalTree = { ...baseProject };
        if (files && files.length > 0) {
          webcontainerLog.info('📁 Processando arquivos do usuário', { count: files.length });
          appendOutput(`Processando ${files.length} arquivos do projeto...\n`);

          const convertedFiles = files
            .filter(f => {
              if (f.path === 'index.html' && f.content.includes('%PUBLIC_URL%')) {
                appendOutput(`⚠️ Ignorando index.html com formato CRA\n`);
                return false;
              }
              return true;
            })
            .map(f => transformFileForVite(f.path, f.content));

          const userFiles = convertToFileTree(convertedFiles);
          finalTree = deepMerge(baseProject, userFiles);

          // LIMPEZA DE DUPLICIDADE
          const srcDir = (finalTree.src as any)?.directory;
          if (srcDir) {
            if (srcDir['App.tsx'] && srcDir['App.jsx']) delete srcDir['App.jsx'];
            if (srcDir['main.tsx'] && srcDir['main.jsx']) delete srcDir['main.jsx'];
          }
        }

        appendOutput(`Montando arquivos...\n`);

        try {
          // Limpeza profunda para evitar que o Vite se confunda com arquivos antigos
          await container.fs.rm('src', { recursive: true });
          await container.fs.rm('App.jsx', { force: true }).catch(() => { });
          await container.fs.rm('main.jsx', { force: true }).catch(() => { });
        } catch (e) { }

        await mountFiles(container, finalTree as any);
        appendOutput('✓ Arquivos montados com sucesso\n');

        setState((prev) => ({ ...prev, status: 'installing' }));
        appendOutput('Instalando dependências...\n');

        const installExitCode = await installDependencies(container, appendOutput, projectId);
        if (installExitCode !== 0) {
          throw new Error(`npm install failed with code ${installExitCode}`);
        }

        appendOutput('\n✓ Dependências instaladas!\n');
        setState((prev) => ({ ...prev, status: 'starting' }));

        // Timeout de segurança: se o servidor não responder em 60s, reportar erro
        let serverStarted = false;
        const serverTimeout = setTimeout(() => {
          if (!serverStarted) {
            webcontainerLog.error('⏱️ Timeout: Servidor não respondeu em 60 segundos');
            appendOutput('\n⚠️ Timeout: Servidor demorou demais para responder. Tente reiniciar.\n');
            // Não mudar status para error, apenas avisar (servidor pode ainda estar carregando)
          }
        }, 60000);

        await startDevServer(container, appendOutput, (url) => {
          serverStarted = true;
          clearTimeout(serverTimeout);
          webcontainerLog.success('🎉 Servidor pronto!', { url });
          setState((prev) => ({ ...prev, status: 'ready', previewUrl: url }));
          appendOutput(`\n✓ Servidor pronto: ${url}\n`);
          onServerReady?.(url);
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error('Failed to initialize project');
        console.error('[WebContainer] Error:', err);
        appendOutput(`\n✗ ERRO: ${err.message}\n`);
        setState((prev) => ({ ...prev, status: 'error', error: err }));
        onError?.(err);
      } finally {
        isInitializingRef.current = false;
        webcontainerLog.timeEnd('init-project');
      }
    },
    [boot, appendOutput, onServerReady, onError, state.status]
  );

  const updateFile = useCallback(
    async (path: string, content: string) => {
      if (!containerRef.current) return;

      try {
        const transformed = transformFileForVite(path, content);
        await writeFile(containerRef.current, transformed.path, transformed.content);
      } catch (error) {
        if (error instanceof Error && error.message.includes('Proxy has been released')) {
          containerRef.current = null;
          setState((prev) => ({ ...prev, status: 'idle' }));
          return;
        }
        throw error;
      }
    },
    []
  );

  const cleanup = useCallback(() => {
    destroyWebContainer();
    containerRef.current = null;
    setState({
      status: 'idle',
      error: null,
      previewUrl: null,
      terminalOutput: [],
    });
  }, []);

  useEffect(() => {
    if (autoStart) {
      initProject();
    }
  }, [autoStart, initProject]);

  return {
    ...state,
    initProject,
    updateFile,
    cleanup,
  };
}
