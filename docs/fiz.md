 # Correção do Projeto — Passo a Passo (Portal da Transparência Paranaíta)

## Objetivo
Deixar o projeto compilando e rodando corretamente (React + Vite + Tailwind), eliminando os erros exibidos em `#problems_and_diagnostics` e garantindo que `npm run typecheck` e `npm run build` passem.

## Principais problemas encontrados (antes)
- Ausência de `package.json` e de dependências instaladas, causando erros como “Cannot find module `react` / `lucide-react`”.
- Ausência de ponto de entrada padrão do Vite/React (faltava `index.html` e `src/main.tsx`).
- Duplicação de hooks: arquivos `.ts` corretos convivendo com stubs `.tsx` incorretos.
- Tipos inconsistentes no fluxo de erro: o overlay esperava um tipo inexistente/importado do lugar errado.
- Configuração do TypeScript sem suporte prático à resolução de módulos em ambiente Node/Vite, gerando erros tipo “`react/jsx-runtime` does not exist” e “JSX.IntrinsicElements”.

## Passo a passo do que foi feito

### 1) Diagnóstico inicial e inspeção da estrutura
- Verifiquei a árvore do projeto e confirmei que existia apenas a pasta `src/` (sem `package.json`, `index.html`, etc.).
- Identifiquei duplicidade de arquivos na pasta `src/hooks/` e múltiplos componentes “stub”.

### 2) Remoção de duplicatas/arquivos incorretos em hooks
- Removi os stubs duplicados que conflitam com os hooks reais:
  - `src/hooks/useAccessibility.tsx`
  - `src/hooks/useErrorTrap.tsx`
- Mantive os hooks funcionais em `.ts`:
  - `src/hooks/useAccessibility.ts`
  - `src/hooks/useErrorTrap.ts`

Por quê: os stubs `.tsx` não implementavam hooks (eram componentes placeholder), mas ocupavam o mesmo “nome lógico” no projeto e confundiam importações e diagnósticos.

### 3) Criação do ponto de entrada do app (Vite/React)
- Criei `index.html` na raiz com `<div id="root"></div>` e `<script type="module" src="/src/main.tsx"></script>`.
- Criei `src/main.tsx` para inicializar o React:
  - `ReactDOM.createRoot(...).render(<App />)`
- Mantive `src/index.css` com as diretivas do Tailwind.

Por quê: sem esses arquivos, o Vite não tem “entrypoint” e o React não monta a aplicação.

### 4) Criação das configurações do projeto (Vite + TS + Tailwind)
- Criei `package.json` com scripts e dependências (React, Vite, Tailwind, Lucide etc.).
- Criei `vite.config.ts` com `@vitejs/plugin-react`.
- Criei `tsconfig.json` e `tsconfig.node.json`.
- Criei `tailwind.config.js` e `postcss.config.js`.

### 5) Instalação das dependências
Executei:
```bash
npm install
```

Resultado esperado: a pasta `node_modules/` passa a existir e os diagnósticos “Cannot find module `react`/`lucide-react`” deixam de acontecer.

### 6) Ajuste do TypeScript para eliminar erros de JSX e resolução de módulos
- Atualizei o `tsconfig.json` para uma resolução mais compatível com o ecossistema (Node/Vite):
  - `jsx` em `react-jsx`
  - `moduleResolution` em `node`
  - `esModuleInterop` e `allowSyntheticDefaultImports` habilitados

Isso removeu os sintomas:
- “This JSX tag requires the module path `react/jsx-runtime`…”
- “JSX element implicitly has type `any` because no interface `JSX.IntrinsicElements` exists…”

### 7) Correção do fluxo de erros (overlay + tipagem)
- Corrigi o import incorreto em `src/components/features/ErrorOverlay.tsx`:
  - Deixou de importar um tipo inexistente de `src/hooks/useErrorTrap` e passou a usar `AppError` de `src/types/error.ts`.
- Ajustei `src/types/error.ts` para refletir o que o runtime realmente gera:
  - Adicionei `column?: number;` em `AppError`, pois `src/hooks/useErrorTrap.ts` envia `event.colno`.

### 8) Correções em componentes e consistência de UI
- Ajustei a classe de alto contraste no `src/App.tsx` para ficar compatível com o CSS global (`.high-contrast` em `src/index.css`).
- Removi imports não usados que geravam warnings.
- Substituí componentes placeholder por implementações reais (sem mudar o objetivo do projeto):
  - `src/components/layout/Header.tsx`
  - `src/components/home/PromoCards.tsx`
  - `src/components/home/ServiceTabs.tsx`
  - `src/components/layout/Footer.tsx`
  - `src/components/sections/Hero.tsx`

### 9) Remoção de arquivos não utilizados
- Removi arquivos que eram apenas stubs e não estavam sendo usados/importados:
  - `src/components/sections/BiomaGrid.tsx`
  - `src/components/sections/CTASection.tsx`
  - `src/components/sections/Purpose.tsx`
  - `src/components/ui/GreenButton.tsx`

### 10) Ajuste dos scripts e validação final
- Ajustei os scripts do `package.json` para refletirem validações reais do projeto:
  - `typecheck`: `tsc --noEmit`
  - `build`: `npm run typecheck && vite build`
  - `lint`: `npm run typecheck`

Rodei as validações:
```bash
npm run typecheck
npm run build
```

## Como rodar o projeto
```bash
npm install
npm run dev
```

## Observação sobre vulnerabilidades
Durante o `npm install`, o npm reportou vulnerabilidades moderadas. Não executei `npm audit fix --force` automaticamente, porque isso pode introduzir mudanças quebráveis. Se quiser tratar isso agora, a forma segura é começar com:
```bash
npm audit