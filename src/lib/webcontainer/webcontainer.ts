import { WebContainer, type FileSystemTree } from '@webcontainer/api';

// Usar globalThis para persistir entre hot-reloads do Next.js
declare global {
  // eslint-disable-next-line no-var
  var __webcontainerInstance: WebContainer | null;
  // eslint-disable-next-line no-var
  var __webcontainerBootPromise: Promise<WebContainer> | null;
  // eslint-disable-next-line no-var
  var __webcontainerBootAttempted: boolean;
}

// Inicializar globais se não existirem
if (typeof globalThis.__webcontainerInstance === 'undefined') {
  globalThis.__webcontainerInstance = null;
}
if (typeof globalThis.__webcontainerBootPromise === 'undefined') {
  globalThis.__webcontainerBootPromise = null;
}
if (typeof globalThis.__webcontainerBootAttempted === 'undefined') {
  globalThis.__webcontainerBootAttempted = false;
}

export async function getWebContainer(): Promise<WebContainer> {
  // Verificar se já existe uma instância válida
  if (globalThis.__webcontainerInstance) {
    console.log('[WebContainer] ♻️ Reutilizando instância existente');
    return globalThis.__webcontainerInstance;
  }

  // Verificar se já está em processo de boot
  if (globalThis.__webcontainerBootPromise) {
    console.log('[WebContainer] ⏳ Aguardando boot em progresso...');
    return globalThis.__webcontainerBootPromise;
  }

  // Se já tentamos boot antes nesta sessão e falhou, não tentar de novo
  if (globalThis.__webcontainerBootAttempted) {
    console.warn('[WebContainer] ⚠️ Boot já foi tentado anteriormente. Recarregando página...');
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
    // Retornar uma promise que nunca resolve (página vai recarregar)
    return new Promise(() => {});
  }

  // Marcar que estamos tentando boot
  globalThis.__webcontainerBootAttempted = true;

  // Iniciar boot
  globalThis.__webcontainerBootPromise = WebContainer.boot()
    .then(instance => {
      globalThis.__webcontainerInstance = instance;
      globalThis.__webcontainerBootPromise = null;
      console.log('[WebContainer] ✅ Instância criada com sucesso');
      return instance;
    })
    .catch(err => {
      globalThis.__webcontainerBootPromise = null;
      
      // Se o erro for "Only a single WebContainer instance can be booted",
      // significa que já existe uma instância de uma sessão anterior
      if (err.message?.includes('single WebContainer instance')) {
        console.warn('[WebContainer] ⚠️ Conflito de instância detectado. Recarregando página...');
        
        // Fazer reload automático para limpar o estado
        if (typeof window !== 'undefined') {
          // Pequeno delay para o log aparecer
          setTimeout(() => {
            window.location.reload();
          }, 100);
        }
        
        // Retornar uma promise que nunca resolve (página vai recarregar)
        return new Promise(() => {});
      }
      
      throw err;
    });

  return globalThis.__webcontainerBootPromise;
}

export async function mountFiles(
  container: WebContainer,
  files: FileSystemTree
) {
  await container.mount(files);
}

export async function writeFile(
  container: WebContainer,
  path: string,
  contents: string
) {
  // Sanitizar caminho
  let cleanPath = path.replace(/^\/+/, '').replace(/\\/g, '/');
  
  // Remover partes inválidas
  const parts = cleanPath.split('/').filter(part => 
    part && part !== '.' && part !== '..'
  );
  
  if (parts.length === 0) {
    console.warn(`[writeFile] Caminho inválido ignorado: ${path}`);
    return;
  }
  
  cleanPath = parts.join('/');
  
  // Criar diretórios pai se não existirem
  if (parts.length > 1) {
    const dirPath = parts.slice(0, -1).join('/');
    try {
      await container.fs.mkdir(dirPath, { recursive: true });
    } catch {
      // Diretório pode já existir, ignorar
    }
  }

  await container.fs.writeFile(cleanPath, contents);
}

export async function readFile(
  container: WebContainer,
  path: string
): Promise<string> {
  return await container.fs.readFile(path, 'utf-8');
}

export async function runCommand(
  container: WebContainer,
  command: string,
  args: string[] = [],
  onOutput?: (data: string) => void
): Promise<number> {
  const process = await container.spawn(command, args);

  if (onOutput) {
    process.output.pipeTo(
      new WritableStream({
        write(data) {
          onOutput(data);
        },
      })
    );
  }

  return process.exit;
}

export async function installDependencies(
  container: WebContainer,
  onOutput?: (data: string) => void,
  projectId?: string // NOVO: ID do projeto para cache persistente
): Promise<number> {
  try {
    // Ler package.json para verificar cache
    const packageJson = await container.fs.readFile('package.json', 'utf-8');
    const parsedPackage = JSON.parse(packageJson);

    // ETAPA 1: VERIFICAR CACHE PERSISTENTE (IndexedDB)
    if (projectId) {
      const { cacheManager } = await import('./cache-manager');
      const packageHash = await cacheManager.hashPackageJson(packageJson);
      const cached = await cacheManager.get(projectId);

      if (cached && cached.packageJsonHash === packageHash) {
        // Cache existe e package.json não mudou
        const nodeModulesExists = await container.fs.readdir('node_modules')
          .then(() => true)
          .catch(() => false);

        if (nodeModulesExists) {
          onOutput?.('⚡ Cache persistente restaurado!\n');
          console.log('%c[WebContainer] ⚡ Cache persistente reutilizado', 'color: #4ade80; font-weight: bold;');
          return 0;
        } else {
          // Cache existe mas node_modules não (primeiro load após reload)
          onOutput?.('📦 Restaurando dependências do cache...\n');
          // Tentar instalar rapidamente
        }
      } else if (cached) {
        // package.json mudou, invalidar cache
        onOutput?.('⚠️ Dependências mudaram, atualizando cache...\n');
        await cacheManager.delete(projectId);
      }
    }

    // ETAPA 2: CACHE LOCAL (em memória do WebContainer)
    const nodeModulesExists = await container.fs.readdir('node_modules')
      .then(() => true)
      .catch(() => false);

    if (nodeModulesExists) {
      const lockExists = await container.fs.readFile('package-lock.json', 'utf-8')
        .then(() => true)
        .catch(() => false);

      if (lockExists) {
        onOutput?.('✓ Dependências já instaladas (cache local)\n');
        console.log('[WebContainer] Cache local reutilizado');

        // SALVAR NO CACHE PERSISTENTE se ainda não existe
        if (projectId) {
          const { cacheManager } = await import('./cache-manager');
          const packageHash = await cacheManager.hashPackageJson(packageJson);
          await cacheManager.save({
            projectId,
            packageJsonHash: packageHash,
            cachedAt: Date.now(),
            fileTree: {},
            installedPackages: Object.keys(parsedPackage.dependencies || {}),
          });
          console.log('%c[WebContainer] 💾 Cache persistente salvo', 'color: #60a5fa; font-weight: bold;');
        }

        return 0;
      }
    }

    // ETAPA 3: INSTALAR DO ZERO
    onOutput?.('📦 Instalando dependências...\n');
    const exitCode = await runCommand(
      container,
      'npm',
      ['install', '--no-audit', '--no-fund', '--prefer-offline'],
      onOutput
    );

    // SALVAR NO CACHE PERSISTENTE após instalação bem-sucedida
    if (exitCode === 0 && projectId) {
      const { cacheManager } = await import('./cache-manager');
      const packageHash = await cacheManager.hashPackageJson(packageJson);
      await cacheManager.save({
        projectId,
        packageJsonHash: packageHash,
        cachedAt: Date.now(),
        fileTree: {},
        installedPackages: Object.keys(parsedPackage.dependencies || {}),
      });
      onOutput?.('💾 Cache salvo para próxima sessão\n');
      console.log('[WebContainer] Cache persistente criado');
    }

    return exitCode;
  } catch (error) {
    console.error('[WebContainer] Error:', error);
    // Fallback: tentar instalar sem cache
    return runCommand(container, 'npm', ['install', '--no-audit', '--no-fund', '--prefer-offline'], onOutput);
  }
}

export async function startDevServer(
  container: WebContainer,
  onOutput?: (data: string) => void,
  onServerReady?: (url: string, port: number) => void
): Promise<void> {
  let serverReadyCalled = false;

  const handleServerReady = (url: string, port: number) => {
    if (serverReadyCalled) return;
    serverReadyCalled = true;
    console.log('%c[WebContainer] 🎉 Server ready!', 'color: #4ade80; font-weight: bold', { url, port });
    if (onServerReady) {
      onServerReady(url, port);
    }
  };

  // Usar npm run dev que é mais confiável
  const process = await container.spawn('npm', ['run', 'dev']);

  if (onOutput) {
    process.output.pipeTo(
      new WritableStream({
        write(data) {
          onOutput(data);

          // Fallback: detectar URL do Vite na saída do terminal
          // Múltiplos formatos:
          // - "Local:   http://localhost:3000/"
          // - "➜  Local:   http://localhost:5173/"
          // - "VITE ready in XXXms\n  http://localhost:3000"
          // - "Server running at http://..."

          // Padrão 1: Vite format "Local: url"
          const viteMatch = data.match(/(?:Local|Network):\s+(https?:\/\/[^\s]+)/i);
          if (viteMatch && viteMatch[1]) {
            const url = viteMatch[1].trim().replace(/\/$/, ''); // Remove trailing slash
            const portMatch = url.match(/:(\d+)/);
            const port = portMatch ? parseInt(portMatch[1], 10) : 3000;
            console.log('[WebContainer] URL detectada (Vite format):', url);
            handleServerReady(url, port);
            return;
          }

          // Padrão 2: Generic "http://localhost:XXXX" ou "http://127.0.0.1:XXXX"
          const genericMatch = data.match(/(https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):\d+\/?)/i);
          if (genericMatch && genericMatch[1]) {
            const url = genericMatch[1].trim().replace(/\/$/, '');
            const portMatch = url.match(/:(\d+)/);
            const port = portMatch ? parseInt(portMatch[1], 10) : 3000;
            console.log('[WebContainer] URL detectada (generic format):', url);
            handleServerReady(url, port);
            return;
          }
        },
      })
    );
  }

  // Listen for server ready event (método primário)
  container.on('server-ready', (port, url) => {
    console.log('[WebContainer] server-ready event recebido:', { port, url });
    handleServerReady(url, port);
  });

  // Timeout para avisar se demorar demais
  setTimeout(() => {
    if (!serverReadyCalled && onOutput) {
      onOutput('\n⚠️ O servidor está demorando mais que o esperado para responder...\n');
      console.warn('[WebContainer] ⏱️ Timeout: servidor ainda não respondeu após 20s');
    }
  }, 20000);
}

export function destroyWebContainer() {
  if (globalThis.__webcontainerInstance) {
    globalThis.__webcontainerInstance.teardown();
    globalThis.__webcontainerInstance = null;
    globalThis.__webcontainerBootPromise = null;
    console.log('[WebContainer] 🗑️ Instância destruída');
  }
}

// Convert flat file list to WebContainer tree structure
export function convertToFileTree(
  files: Array<{ path: string; content: string }>
): Record<string, unknown> {
  const tree: Record<string, unknown> = {};

  for (const file of files) {
    // Sanitizar caminho: remover barras iniciais e de escape
    const cleanPath = file.path.replace(/^\/+/, '').replace(/\\/g, '/');
    
    // Filtrar partes inválidas (vazias, '.', '..')
    const parts = cleanPath.split('/').filter(part => 
      part && part !== '.' && part !== '..'
    );
    
    // Ignorar arquivos com caminhos inválidos
    if (parts.length === 0) {
      console.warn(`[convertToFileTree] Caminho inválido ignorado: ${file.path}`);
      continue;
    }
    
    let current: Record<string, unknown> = tree;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part]) {
        current[part] = { directory: {} };
      }
      current = (current[part] as { directory: Record<string, unknown> }).directory;
    }

    const fileName = parts[parts.length - 1];
    
    // Validar nome do arquivo
    if (!fileName || fileName === '.' || fileName === '..') {
      console.warn(`[convertToFileTree] Nome de arquivo inválido ignorado: ${file.path}`);
      continue;
    }
    
    current[fileName] = {
      file: {
        contents: file.content,
      },
    };
  }

  return tree;
}

// Create a basic Vite + React project structure (faster than Next.js in WebContainer)
export function createBaseProject(projectName: string = 'my-app'): Record<string, unknown> {
  return {
    'package.json': {
      file: {
        contents: JSON.stringify(
          {
            name: projectName,
            version: '0.1.0',
            private: true,
            type: 'module',
            scripts: {
              dev: 'vite --host',
              build: 'vite build',
              preview: 'vite preview',
            },
            dependencies: {
              react: '^18.2.0',
              'react-dom': '^18.2.0',
              'react-router-dom': '^6.22.0',
              'lucide-react': '^0.284.0',
              'clsx': '^2.0.0',
              'tailwind-merge': '^1.14.0',
              'framer-motion': '^10.16.4',
              'react-hot-toast': '^2.4.1',
              'date-fns': '^2.30.0',
              '@headlessui/react': '^1.7.17',
              'zustand': '^4.4.7',
              'axios': '^1.6.2',
              'react-icons': '^4.12.0',
            },
            devDependencies: {
              '@vitejs/plugin-react': '^4.2.0',
              vite: '^5.0.0',
              typescript: '^5.2.2',
              tailwindcss: '^3.3.0',
              autoprefixer: '^10.4.14',
              postcss: '^8.4.27',
              '@types/react': '^18.2.0',
              '@types/react-dom': '^18.2.0'
            },
          },
          null,
          2
        ),
      },
    },
    'tailwind.config.js': {
      file: {
        contents: `/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
`,
      },
    },
    'postcss.config.js': {
      file: {
        contents: `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
`,
      },
    },
    'vite.config.ts': {
      file: {
        contents: `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react({
      // Desabilitar Fast Refresh no WebContainer para evitar erros de MIME type
      fastRefresh: false
    })
  ],
  server: {
    port: 3000,
    host: true,
    strictPort: false,
    open: false,
    // Desabilitar HMR no WebContainer para evitar erros de MIME type
    hmr: false,
    // Não usar warmup - causa erros em ambientes virtualizados
    watch: {
      usePolling: true,
      interval: 1000
    }
  },
  optimizeDeps: {
    include: [
      'react', 
      'react-dom', 
      'react-router-dom', 
      'lucide-react', 
      'clsx', 
      'tailwind-merge', 
      'framer-motion',
      'react-hot-toast',
      'date-fns',
      '@headlessui/react',
      'zustand',
      'axios',
      'react-icons'
    ],
    // Forçar otimização no primeiro load para evitar problemas
    force: true
  },
  build: {
    // Configurações para build mais estável
    sourcemap: false,
    minify: 'esbuild'
  },
  logLevel: 'info',
  // Fallback para SPA routing
  appType: 'spa'
});
`,
      },
    },
    'tsconfig.json': {
      file: {
        contents: JSON.stringify({
          compilerOptions: {
            target: 'ESNext',
            useDefineForClassFields: true,
            lib: ['DOM', 'DOM.Iterable', 'ESNext'],
            allowJs: true,
            skipLibCheck: true,
            esModuleInterop: true,
            allowSyntheticDefaultImports: true,
            strict: false,
            forceConsistentCasingInFileNames: true,
            module: 'ESNext',
            moduleResolution: 'Node',
            resolveJsonModule: true,
            isolatedModules: true,
            noEmit: true,
            jsx: 'react-jsx'
          },
          include: ['src']
        }, null, 2)
      }
    },
    'index.html': {
      file: {
        contents: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
    
    <!-- Visual Edit Script (v2 - Seleção Precisa) -->
    <script>
    (function() {
      let visualEditMode = false;
      let highlightEl = null;
      let currentHover = null;
      let parentLevel = 0; // Nível de subida na árvore (0 = elemento exato)
      const MAX_PARENT_LEVELS = 5;

      // Criar elemento de highlight
      function createHighlight() {
        if (highlightEl) return;
        highlightEl = document.createElement('div');
        highlightEl.id = 'visual-edit-highlight';
        highlightEl.style.cssText = 'position:fixed;pointer-events:none;border:2px solid #06b6d4;background:rgba(6,182,212,0.1);z-index:99999;transition:all 0.1s ease;display:none;border-radius:4px;box-shadow:0 0 10px rgba(6,182,212,0.3);';
        
        // Label para mostrar o nome do elemento
        const label = document.createElement('div');
        label.id = 'visual-edit-label';
        label.style.cssText = 'position:absolute;top:-22px;left:0;background:#06b6d4;color:#000;font-size:10px;font-weight:bold;padding:2px 6px;border-radius:3px;white-space:nowrap;font-family:monospace;';
        highlightEl.appendChild(label);
        
        document.body.appendChild(highlightEl);
      }

      // Formatar nome do elemento para exibição
      function getElementLabel(el) {
        if (!el || el === document.body) return 'body';
        const tag = el.tagName?.toLowerCase() || '';
        const id = el.id ? '#' + el.id : '';
        const cls = el.className && typeof el.className === 'string' 
          ? '.' + el.className.split(' ').filter(c => c.trim()).slice(0, 2).join('.') 
          : '';
        return tag + id + (cls.length > 1 ? cls : '');
      }

      // Atualizar highlight
      function updateHighlight(el) {
        if (!highlightEl || !el || !visualEditMode || el === document.body || el === document.documentElement) {
          if (highlightEl) highlightEl.style.display = 'none';
          return;
        }
        const rect = el.getBoundingClientRect();
        // Ignorar elementos muito pequenos (menores que 5px) ou fora da viewport
        if (rect.width < 2 || rect.height < 2) {
          highlightEl.style.display = 'none';
          return;
        }
        highlightEl.style.display = 'block';
        highlightEl.style.top = rect.top + 'px';
        highlightEl.style.left = rect.left + 'px';
        highlightEl.style.width = rect.width + 'px';
        highlightEl.style.height = rect.height + 'px';
        
        // Atualizar label
        const label = highlightEl.querySelector('#visual-edit-label');
        if (label) {
          label.textContent = getElementLabel(el) + (parentLevel > 0 ? ' (^' + parentLevel + ')' : '');
        }
      }

      // Encontrar elemento com base no nível de profundidade
      // Nível 0 = elemento exato clicado
      // Nível 1+ = subir na árvore de pais
      function getElementAtLevel(startEl, level) {
        let el = startEl;
        for (let i = 0; i < level && el && el.parentElement && el.parentElement !== document.body; i++) {
          el = el.parentElement;
        }
        return el;
      }

      // Filtrar elementos inválidos (scripts, styles, etc)
      function isValidElement(el) {
        if (!el || !el.tagName) return false;
        const tag = el.tagName.toLowerCase();
        const invalidTags = ['script', 'style', 'link', 'meta', 'head', 'html', 'noscript'];
        return !invalidTags.includes(tag);
      }

      createHighlight();

      // Escutar mensagens do parent
      window.addEventListener('message', function(e) {
        if (e.data?.type === 'TOGGLE_VISUAL_EDIT') {
          visualEditMode = e.data.enabled;
          parentLevel = 0; // Resetar nível ao ativar/desativar
          console.log('[VisualEdit] Modo:', visualEditMode ? 'ATIVADO' : 'desativado');
          if (!visualEditMode && highlightEl) {
            highlightEl.style.display = 'none';
          }
          document.body.style.cursor = visualEditMode ? 'crosshair' : '';
        }
      });

      // Scroll para mudar nível de seleção (para cima = seleciona pai, para baixo = elemento exato)
      document.addEventListener('wheel', function(e) {
        if (!visualEditMode || !currentHover) return;
        e.preventDefault();
        
        if (e.deltaY < 0) {
          // Scroll up = subir na árvore (selecionar pai)
          parentLevel = Math.min(parentLevel + 1, MAX_PARENT_LEVELS);
        } else {
          // Scroll down = descer na árvore (elemento mais específico)
          parentLevel = Math.max(parentLevel - 1, 0);
        }
        
        const el = getElementAtLevel(currentHover, parentLevel);
        updateHighlight(el);
      }, { passive: false });

      document.addEventListener('mousemove', function(e) {
        if (!visualEditMode) return;
        const target = e.target;
        if (!isValidElement(target)) return;
        
        if (target !== currentHover) {
          currentHover = target;
          parentLevel = 0; // Resetar nível ao mudar de elemento
          const el = getElementAtLevel(target, parentLevel);
          updateHighlight(el);
        }
      });

      document.addEventListener('click', function(e) {
        if (!visualEditMode) return;
        e.preventDefault();
        e.stopPropagation();
        
        // Usar o elemento no nível atual de seleção
        const el = getElementAtLevel(e.target, parentLevel);
        if (!isValidElement(el)) return;
        
        // Encontrar o ancestral mais próximo com data-source-file
        const sourceFileEl = el.closest('[data-source-file]');
        const sourceFile = sourceFileEl ? sourceFileEl.getAttribute('data-source-file') : null;
        
        const info = {
          tagName: el.tagName,
          className: typeof el.className === 'string' ? el.className : '',
          id: el.id,
          dataFile: el.dataset?.file || null,
          dataSourceFile: sourceFile,
          innerText: (el.innerText || '').substring(0, 100),
          rect: el.getBoundingClientRect(),
          parentLevel: parentLevel
        };
        console.log('[VisualEdit] Clicado:', info);
        window.parent.postMessage({ type: 'COMPONENT_CLICKED', componentInfo: info }, '*');
      }, true);

      document.addEventListener('mouseleave', function() {
        if (highlightEl) highlightEl.style.display = 'none';
        currentHover = null;
        parentLevel = 0;
      });

      // Atalhos de teclado para navegação
      document.addEventListener('keydown', function(e) {
        if (!visualEditMode || !currentHover) return;
        
        if (e.key === 'ArrowUp' || e.key === '[') {
          // Subir na árvore (selecionar pai)
          e.preventDefault();
          parentLevel = Math.min(parentLevel + 1, MAX_PARENT_LEVELS);
          updateHighlight(getElementAtLevel(currentHover, parentLevel));
        } else if (e.key === 'ArrowDown' || e.key === ']') {
          // Descer na árvore (elemento mais específico)
          e.preventDefault();
          parentLevel = Math.max(parentLevel - 1, 0);
          updateHighlight(getElementAtLevel(currentHover, parentLevel));
        } else if (e.key === 'Escape') {
          // Resetar para elemento exato
          parentLevel = 0;
          updateHighlight(currentHover);
        }
      });

      console.log('[VisualEdit v2] Script carregado - Use scroll ou setas para navegar na hierarquia de elementos');
    })();
    </script>
  </body>
</html>
`,
      },
    },
    src: {
      directory: {
        'utils': {
          directory: {
            'cn.ts': {
              file: {
                contents: `import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
`,
              },
            },
          },
        },
        'main.tsx': {
          file: {
            contents: `import React from 'react';
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
`,
          },
        },
        'App.tsx': {
          file: {
            contents: `import React from 'react';
import { Sparkles, Terminal, ChevronRight, Zap } from 'lucide-react';

export default function App() {
  return (
    <main className="min-h-screen relative overflow-hidden bg-slate-950 font-sans selection:bg-indigo-500/30">
      {/* Background Effects */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[0%] w-[500px] h-[500px] rounded-full bg-purple-600/20 blur-[100px] animate-pulse" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] rounded-full bg-indigo-600/20 blur-[100px] animate-pulse delay-1000" />
      </div>

      <div className="relative z-10 container mx-auto px-4 h-screen flex flex-col items-center justify-center">
        
        {/* Hero Card */}
        <div className="max-w-2xl w-full bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 md:p-12 shadow-2xl text-center transform transition-all hover:scale-[1.01] duration-500">
          
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-sm font-medium mb-8">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
            </span>
            Ambiente de Desenvolvimento Ativo
          </div>

          {/* Title */}
          <h1 className="text-4xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-200 to-slate-400 mb-6 tracking-tight">
            Crie algo <span className="text-indigo-500">extraordinário.</span>
          </h1>

          {/* Description */}
          <p className="text-lg text-slate-400 mb-10 max-w-lg mx-auto leading-relaxed">
            Seu ambiente React + Vite + Tailwind está pronto. 
            Use o chat ao lado para descrever seu app e ver a mágica acontecer em tempo real.
          </p>

          {/* Steps */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10 text-left">
            <div className="p-4 rounded-2xl bg-slate-800/50 border border-slate-800 hover:border-indigo-500/30 transition-colors group">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center mb-3 group-hover:bg-indigo-500/20 transition-colors">
                <Terminal className="w-5 h-5 text-indigo-400" />
              </div>
              <h3 className="text-white font-semibold mb-1">1. Descreva</h3>
              <p className="text-sm text-slate-500">Conte sua ideia para a IA no painel de chat.</p>
            </div>
            <div className="p-4 rounded-2xl bg-slate-800/50 border border-slate-800 hover:border-purple-500/30 transition-colors group">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center mb-3 group-hover:bg-purple-500/20 transition-colors">
                <Sparkles className="w-5 h-5 text-purple-400" />
              </div>
              <h3 className="text-white font-semibold mb-1">2. Gerar</h3>
              <p className="text-sm text-slate-500">O código é criado e montado instantaneamente.</p>
            </div>
            <div className="p-4 rounded-2xl bg-slate-800/50 border border-slate-800 hover:border-emerald-500/30 transition-colors group">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-3 group-hover:bg-emerald-500/20 transition-colors">
                <Zap className="w-5 h-5 text-emerald-400" />
              </div>
              <h3 className="text-white font-semibold mb-1">3. Visualizar</h3>
              <p className="text-sm text-slate-500">Interaja com seu app aqui mesmo no preview.</p>
            </div>
          </div>

        </div>
        
        {/* Footer info */}
        <p className="mt-8 text-slate-500 text-sm flex items-center gap-2">
          Pots by <span className="font-semibold text-slate-400">WebContainer</span>
          <span className="w-1 h-1 rounded-full bg-slate-600" />
          v1.0.0
        </p>
      </div>
    </main>
  );
}
`,
          },
        },
        'index.css': {
          file: {
            contents: `@tailwind base;
@tailwind components;
@tailwind utilities;

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
`,
          },
        },
      },
    },
  };
}
