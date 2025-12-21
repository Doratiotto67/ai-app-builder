-- Tabela para logs dos agentes (chat-stream, fix-code, generate-prd, analyze-image)
CREATE TABLE IF NOT EXISTS public.agent_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identificação
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Tipo de agente
  agent_type TEXT NOT NULL CHECK (agent_type IN ('chat-stream', 'fix-code', 'generate-prd', 'analyze-image', 'save-file')),
  
  -- Status HTTP e classificação
  status_code INTEGER NOT NULL,
  status_category TEXT GENERATED ALWAYS AS (
    CASE 
      WHEN status_code >= 200 AND status_code < 300 THEN 'success'
      WHEN status_code >= 400 AND status_code < 500 THEN 'client_error'
      WHEN status_code >= 500 THEN 'server_error'
      ELSE 'unknown'
    END
  ) STORED,
  
  -- Detalhes do erro/sucesso
  error_code TEXT, -- Ex: 'OPENROUTER_API_ERROR', 'AUTH_FAILED', 'RATE_LIMITED'
  error_message TEXT, -- Mensagem de erro legível
  error_details JSONB, -- Detalhes adicionais (stack trace, raw response, etc)
  
  -- Métricas
  execution_time_ms INTEGER, -- Tempo de execução em milissegundos
  tokens_used INTEGER, -- Tokens consumidos (se aplicável)
  model_used TEXT, -- Modelo LLM usado
  
  -- Contexto da requisição
  request_summary TEXT, -- Resumo do que foi pedido (primeiros 500 chars)
  files_count INTEGER, -- Número de arquivos processados
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Índices para queries comuns
  CONSTRAINT valid_status_code CHECK (status_code >= 100 AND status_code < 600)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_agent_logs_project_id ON public.agent_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_agent_logs_user_id ON public.agent_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_logs_agent_type ON public.agent_logs(agent_type);
CREATE INDEX IF NOT EXISTS idx_agent_logs_status_code ON public.agent_logs(status_code);
CREATE INDEX IF NOT EXISTS idx_agent_logs_status_category ON public.agent_logs(status_category);
CREATE INDEX IF NOT EXISTS idx_agent_logs_created_at ON public.agent_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_logs_error_code ON public.agent_logs(error_code) WHERE error_code IS NOT NULL;

-- RLS Policies
ALTER TABLE public.agent_logs ENABLE ROW LEVEL SECURITY;

-- Admins podem ver todos os logs
CREATE POLICY "Admins can view all agent logs"
  ON public.agent_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      JOIN public.projects p ON p.org_id = om.org_id
      WHERE p.id = agent_logs.project_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
    )
  );

-- Usuários podem ver logs dos seus próprios projetos
CREATE POLICY "Users can view their project logs"
  ON public.agent_logs
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = agent_logs.project_id
      AND p.created_by = auth.uid()
    )
  );

-- Service role pode inserir logs (para as Edge Functions)
CREATE POLICY "Service role can insert logs"
  ON public.agent_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Comentários para documentação
COMMENT ON TABLE public.agent_logs IS 'Logs de execução dos agentes de IA (chat-stream, fix-code, generate-prd, analyze-image)';
COMMENT ON COLUMN public.agent_logs.agent_type IS 'Tipo do agente: chat-stream, fix-code, generate-prd, analyze-image, save-file';
COMMENT ON COLUMN public.agent_logs.status_code IS 'Código HTTP da resposta (200, 401, 500, etc)';
COMMENT ON COLUMN public.agent_logs.status_category IS 'Categoria do status: success, client_error, server_error';
COMMENT ON COLUMN public.agent_logs.error_code IS 'Código de erro interno para categorização (ex: OPENROUTER_API_ERROR)';
COMMENT ON COLUMN public.agent_logs.error_message IS 'Mensagem de erro legível para o usuário';
COMMENT ON COLUMN public.agent_logs.error_details IS 'Detalhes técnicos do erro em formato JSON';
