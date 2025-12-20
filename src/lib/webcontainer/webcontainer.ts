import { WebContainer, type FileSystemTree } from '@webcontainer/api';

let webcontainerInstance: WebContainer | null = null;
let bootPromise: Promise<WebContainer> | null = null;

export async function getWebContainer(): Promise<WebContainer> {
  if (webcontainerInstance) {
    return webcontainerInstance;
  }

  if (bootPromise) {
    return bootPromise;
  }

  bootPromise = WebContainer.boot().then(instance => {
    webcontainerInstance = instance;
    bootPromise = null;
    return instance;
  }).catch(err => {
    bootPromise = null;
    throw err;
  });

  return bootPromise;
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
  // Criar diretórios pai se não existirem
  const parts = path.split('/').filter(Boolean);
  if (parts.length > 1) {
    const dirPath = parts.slice(0, -1).join('/');
    try {
      await container.fs.mkdir(dirPath, { recursive: true });
    } catch {
      // Diretório pode já existir, ignorar
    }
  }
  
  await container.fs.writeFile(path, contents);
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
  onOutput?: (data: string) => void
): Promise<number> {
  return runCommand(container, 'npm', ['install'], onOutput);
}

export async function startDevServer(
  container: WebContainer,
  onOutput?: (data: string) => void,
  onServerReady?: (url: string, port: number) => void
): Promise<void> {
  const process = await container.spawn('npm', ['run', 'dev']);

  if (onOutput) {
    process.output.pipeTo(
      new WritableStream({
        write(data) {
          onOutput(data);
        },
      })
    );
  }

  // Listen for server ready event
  container.on('server-ready', (port, url) => {
    if (onServerReady) {
      onServerReady(url, port);
    }
  });
}

export function destroyWebContainer() {
  if (webcontainerInstance) {
    webcontainerInstance.teardown();
    webcontainerInstance = null;
  }
}

// Convert flat file list to WebContainer tree structure
export function convertToFileTree(
  files: Array<{ path: string; content: string }>
): Record<string, unknown> {
  const tree: Record<string, unknown> = {};

  for (const file of files) {
    const parts = file.path.split('/').filter(Boolean);
    let current: Record<string, unknown> = tree;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part]) {
        current[part] = { directory: {} };
      }
      current = (current[part] as { directory: Record<string, unknown> }).directory;
    }

    const fileName = parts[parts.length - 1];
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
              'framer-motion': '^10.16.4'
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
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
  },
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
  </body>
</html>
`,
      },
    },
    src: {
      directory: {
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
