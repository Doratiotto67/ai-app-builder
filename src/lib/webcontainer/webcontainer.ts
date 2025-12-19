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
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`,
          },
        },
        'App.tsx': {
          file: {
            contents: `export default function App() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600">
      <div className="text-center text-white">
        <h1 className="text-4xl font-bold mb-4">
          Welcome to My App
        </h1>
        <p className="text-xl opacity-80">
          Tailwind is now running locally!
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
