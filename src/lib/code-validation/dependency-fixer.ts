import { ExtractedFile } from './validate-imports';

// Lista de pacotes conhecidos e suas versões recomendadas
const KNOWN_PACKAGES: Record<string, string> = {
  // UI & Styling
  'lucide-react': '^0.344.0',
  'react-hot-toast': '^2.4.1',
  'clsx': '^2.1.0',
  'tailwind-merge': '^2.2.1',
  'framer-motion': '^11.0.8',
  'class-variance-authority': '^0.7.0',
  
  // Forms & Validation
  'react-hook-form': '^7.51.0',
  'zod': '^3.22.4',
  '@hookform/resolvers': '^3.3.4',
  
  // Data Fetching
  'axios': '^1.6.7',
  '@tanstack/react-query': '^5.24.1',
  
  // Routing
  'react-router-dom': '^6.22.3',
  
  // Utils
  'date-fns': '^3.3.1',
  'uuid': '^9.0.1',
};

/**
 * Analisa os arquivos e adiciona dependências faltantes ao package.json
 */
export function fixDependencies(files: ExtractedFile[]): ExtractedFile[] {
  // 1. Encontrar ou criar package.json
  let packageJsonFile = files.find(f => f.path === 'package.json');
  let packageJsonContent: any = {};

  if (packageJsonFile) {
    try {
      packageJsonContent = JSON.parse(packageJsonFile.content);
    } catch (e) {
      console.error('Erro ao fazer parse do package.json existente:', e);
      // Se falhar o parse, assumimos um novo objeto mas mantemos o arquivo original como backup se necessário
      // mas aqui vamos tentar corrigir
    }
  } else {
    // Se não existir, criar um básico
    packageJsonContent = {
      name: 'vite-project',
      private: true,
      version: '0.0.0',
      type: 'module',
      scripts: {
        dev: 'vite',
        build: 'tsc && vite build',
        lint: 'eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0',
        preview: 'vite preview'
      },
      dependencies: {
        'react': '^18.2.0',
        'react-dom': '^18.2.0'
      },
      devDependencies: {
        '@types/react': '^18.2.64',
        '@types/react-dom': '^18.2.21',
        '@vitejs/plugin-react': '^4.2.1',
        'typescript': '^5.2.2',
        'vite': '^5.1.4',
        'autoprefixer': '^10.4.18',
        'postcss': '^8.4.35',
        'tailwindcss': '^3.4.1'
      }
    };
    // Adicionar à lista de arquivos
    packageJsonFile = {
        path: 'package.json',
        content: JSON.stringify(packageJsonContent, null, 2),
        language: 'json'
    };
    files.push(packageJsonFile);
  }

  // Garantir que dependencies existe
  if (!packageJsonContent.dependencies) {
    packageJsonContent.dependencies = {};
  }

  // 2. Escanear imports em todos os arquivos
  const usedPackages = new Set<string>();
  
  // Regex para encontrar imports: import ... from 'package-name'
  const importRegex = /from\s+['"]([^'"]+)['"]/g;
  const requireRegex = /require\(['"]([^'"]+)['"]\)/g;

  files.forEach(file => {
    if (file.language === 'typescript' || file.language === 'javascript' || file.language === 'tsx' || file.language === 'jsx') {
      let match;
      // Resetar regex
      importRegex.lastIndex = 0;
      requireRegex.lastIndex = 0;

      while ((match = importRegex.exec(file.content)) !== null) {
        const pkgName = getPackageNameFromImport(match[1]);
        if (pkgName) usedPackages.add(pkgName);
      }
      
      while ((match = requireRegex.exec(file.content)) !== null) {
        const pkgName = getPackageNameFromImport(match[1]);
        if (pkgName) usedPackages.add(pkgName);
      }
    }
  });

  // 3. Adicionar dependências faltantes
  let modified = false;
  const addedPackages: string[] = [];

  usedPackages.forEach(pkg => {
    // Se é um pacote conhecido e não está nas dependências (nem devDependencies)
    if (KNOWN_PACKAGES[pkg] && 
        !packageJsonContent.dependencies[pkg] && 
        (!packageJsonContent.devDependencies || !packageJsonContent.devDependencies[pkg])) {
      
      packageJsonContent.dependencies[pkg] = KNOWN_PACKAGES[pkg];
      addedPackages.push(pkg);
      modified = true;
    }
  });

  // 4. Atualizar o arquivo package.json se houve mudanças
  if (modified && packageJsonFile) {
    console.log(`[dependency-fixer] 📦 Adicionando pacotes faltantes: ${addedPackages.join(', ')}`);
    packageJsonFile.content = JSON.stringify(packageJsonContent, null, 2);
    
    // Atualizar na lista original (embora a referência do objeto já ajude, strings são imutáveis em JS, 
    // mas aqui estamos mudando a propriedade .content do objeto referenciado em files)
  }

  return files;
}

/**
 * Extrai o nome do pacote de um path de import
 * Ex: 'react' -> 'react'
 * Ex: 'react/jsx-runtime' -> 'react'
 * Ex: '@radix-ui/react-slot' -> '@radix-ui/react-slot'
 * Ex: './Button' -> null (import relativo)
 */
function getPackageNameFromImport(importPath: string): string | null {
  if (importPath.startsWith('.') || importPath.startsWith('/')) {
    return null;
  }

  // Tratamento para @scoped/package
  if (importPath.startsWith('@')) {
    const parts = importPath.split('/');
    if (parts.length >= 2) {
      return `${parts[0]}/${parts[1]}`;
    }
    return importPath;
  }

  // Pacote normal
  const parts = importPath.split('/');
  return parts[0];
}
