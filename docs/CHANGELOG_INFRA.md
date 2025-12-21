# 📜 Changelog de Infraestrutura - Preview & WebContainer

## [v6.0.0] - 2025-12-20

### 🚀 Adições
- **Auto-Fix v6.0:** Novo motor de correção de sintaxe JSX que resolve problemas de backticks e tags truncadas.
- **Botão "Reiniciar Preview":** Funcionalidade para dar reset total no WebContainer.
- **Loading Overlay:** Feedback visual de carregamento no painel de preview.
- **Relatório Técnico:** Documentação detalhada em `docs/RELATORIO_TECNICO_WEBCONTAINER.md`.

### 🔧 Alterações
- **Vite Config:** Desativado HMR e Fast Refresh para estabilizar o carregamento de módulos (evita erro de MIME type).
- **PreviewPanel Refactoring:** Melhoria na lógica de estados (idle, booting, ready, error).
- **Edge Functions:** Sincronização do motor de correção nas funções `fix-code` e `chat-stream`.

### 🐛 Correções
- Corrigido erro de "Failed to load module script" no preview.
- Corrigido erro de sintaxe "Expected > but found `" em componentes gerados.
- Corrigido problema de tela branca eterna quando o servidor demorava a responder.
- Corrigido erro TS7034 na página de projetos.

---
*Manutenções realizadas pela equipe de IA Antigravity.*
