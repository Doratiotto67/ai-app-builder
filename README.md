# 🚀 AI App Builder

> **Construa aplicações web completas usando linguagem natural e IA**

Uma plataforma de desenvolvimento "low-code guiada por IA" que permite criar
aplicações React/Vite diretamente no navegador, sem necessidade de ambiente
local.

![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-61dafb?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Supabase](https://img.shields.io/badge/Supabase-Backend-3ECF8E?logo=supabase)
![Tailwind](https://img.shields.io/badge/Tailwind-4-38bdf8?logo=tailwindcss)

---

## ✨ Features

- 🤖 **Chat com IA** - Descreva o que quer construir em linguagem natural
- 📝 **IDE Completa** - Editor de código, explorador de arquivos e terminal
- ⚡ **Preview Instantâneo** - Veja suas alterações em tempo real via
  WebContainers
- 🔄 **Correção Automática** - Sistema de 16 regras que corrige erros de sintaxe
  automaticamente
- 💾 **Persistência** - Todos os projetos salvos no Supabase com histórico de
  versões
- 🔐 **Multi-tenant** - Organizações e projetos isolados via Row Level Security

---

## 🏗️ Arquitetura

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                    │
├──────────────┬──────────────────┬───────────────────────┤
│   Chat/IA    │   IDE/Editor     │   Preview/Runtime     │
└──────┬───────┴────────┬─────────┴──────────┬────────────┘
       │                │                     │
       ▼                ▼                     ▼
┌──────────────┐ ┌─────────────┐ ┌────────────────────────┐
│ Supabase     │ │ Zustand     │ │ WebContainer           │
│ Edge Funcs   │ │ Store       │ │ (Node.js no Browser)   │
└──────────────┘ └─────────────┘ └────────────────────────┘
```

---

## 🚀 Quick Start

### Pré-requisitos

- Node.js 18+
- Conta no [Supabase](https://supabase.com)
- Chave API do [OpenRouter](https://openrouter.ai)

### Instalação

```bash
# Clone o repositório
git clone https://github.com/SEU_USUARIO/ai-app-builder.git
cd ai-app-builder

# Instale as dependências
npm install

# Configure as variáveis de ambiente
cp .env.example .env.local

# Inicie o servidor de desenvolvimento
npm run dev
```

### Variáveis de Ambiente

```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-anon-key
OPENROUTER_API_KEY=sua-openrouter-key
```

---

## 📁 Estrutura do Projeto

```
src/
├── app/                    # Rotas Next.js (App Router)
├── components/
│   ├── chat/               # Interface de chat com IA
│   ├── ide/                # Componentes da IDE
│   └── preview/            # Preview com WebContainer
├── lib/
│   ├── code-validation/    # 🔧 Sistema de correção automática
│   ├── supabase/           # Clientes Supabase
│   └── webcontainer/       # Configuração do runtime
└── stores/
    └── ide-store.ts        # Estado global (Zustand)

supabase/
├── functions/              # Edge Functions (Deno)
│   ├── chat-stream/        # Streaming de IA
│   └── save-file/          # Persistência de arquivos
└── migrations/             # Schema SQL + RLS
```

---

## 🔧 Sistema de Correção Automática

O **Syntax Fixer** aplica 16 regras para corrigir código gerado pela IA:

| Regra           | Descrição                                   |
| --------------- | ------------------------------------------- |
| Tag Balancer    | Fecha automaticamente 21 tipos de tags HTML |
| Return Truncado | Detecta e completa `return (` sem `)`       |
| Export Default  | Adiciona export se componente não tem       |
| Import Repair   | Corrige imports truncados                   |
| Self-closing    | Converte `<input>` → `<input />`            |

---

## 🛠️ Tech Stack

| Categoria | Tecnologia                                |
| --------- | ----------------------------------------- |
| Frontend  | Next.js 15, React 19, TypeScript          |
| Styling   | Tailwind CSS 4, Shadcn/UI                 |
| Estado    | Zustand                                   |
| Backend   | Supabase (Auth, Postgres, Edge Functions) |
| IA        | OpenRouter (Claude, GPT, Gemini, GLM)     |
| Runtime   | WebContainers (StackBlitz)                |

---

## 📖 Documentação

Veja a documentação completa em
[`docs/documentacao_sistema.md`](./docs/documentacao_sistema.md)

---

## 📄 Licença

MIT © 2024
