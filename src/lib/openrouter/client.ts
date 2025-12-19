// OpenRouter API Client
// Used for all AI models: GLM-4.6, Qwen2.5-VL, Gemini 3 Flash

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1';

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | OpenRouterContent[];
}

export interface OpenRouterContent {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string;
  };
}

export interface OpenRouterRequest {
  model: string;
  messages: OpenRouterMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
}

export interface OpenRouterResponse {
  id: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface OpenRouterStreamChunk {
  id: string;
  choices: {
    index: number;
    delta: {
      role?: string;
      content?: string;
    };
    finish_reason: string | null;
  }[];
}

// Available models via OpenRouter - MODELOS ATUALIZADOS
export const MODELS = {
  // GLM-4.6 para geração de código (30k+ tokens)
  CODE: 'z-ai/glm-4.6',
  // Qwen2.5-VL para análise de imagens/screenshots
  VISION: 'qwen/qwen-2-vl-72b-instruct',
  // Gemini 3 Flash Preview para UX Design (20k+ tokens)
  UX_DESIGN: 'google/gemini-3-flash-preview',
} as const;

// Token limits - TOKENS AUMENTADOS
export const TOKEN_LIMITS = {
  CODE: 32768, // 32k tokens para código
  VISION: 8192,
  UX_DESIGN: 24576, // 24k tokens para design
} as const;

export type ModelType = keyof typeof MODELS;

export class OpenRouterClient {
  private apiKey: string;
  private siteUrl: string;
  private siteName: string;

  constructor(apiKey: string, siteUrl = '', siteName = 'AI App Builder') {
    this.apiKey = apiKey;
    this.siteUrl = siteUrl;
    this.siteName = siteName;
  }

  private getHeaders(): HeadersInit {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': this.siteUrl,
      'X-Title': this.siteName,
    };
  }

  async chat(request: OpenRouterRequest): Promise<OpenRouterResponse> {
    const response = await fetch(`${OPENROUTER_API_URL}/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        ...request,
        stream: false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  async *streamChat(request: OpenRouterRequest): AsyncGenerator<OpenRouterStreamChunk> {
    const response = await fetch(`${OPENROUTER_API_URL}/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        ...request,
        stream: true,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            return;
          }
          try {
            const chunk = JSON.parse(data) as OpenRouterStreamChunk;
            yield chunk;
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  }

  // Helper method for code generation with GLM-4.6
  async generateCode(prompt: string, systemPrompt?: string): Promise<string> {
    const messages: OpenRouterMessage[] = [];
    
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await this.chat({
      model: MODELS.CODE,
      messages,
      temperature: 0.7,
      max_tokens: TOKEN_LIMITS.CODE,
    });

    return response.choices[0]?.message?.content || '';
  }

  // Helper method for vision analysis
  async analyzeImage(imageUrl: string, prompt: string): Promise<string> {
    const messages: OpenRouterMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: imageUrl } },
        ],
      },
    ];

    const response = await this.chat({
      model: MODELS.VISION,
      messages,
      temperature: 0.5,
      max_tokens: TOKEN_LIMITS.VISION,
    });

    return response.choices[0]?.message?.content || '';
  }

  // Helper method for UX design generation with Gemini 3 Flash
  async generateUXDesign(prompt: string, context?: string): Promise<string> {
    const systemPrompt = `You are an expert UX/UI designer and product manager. 
Your task is to create detailed design specifications, PRDs, and component designs.
Always output structured markdown with clear sections.
Focus on modern, premium, accessible design patterns.
${context ? `\nContext: ${context}` : ''}`;

    const messages: OpenRouterMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ];

    const response = await this.chat({
      model: MODELS.UX_DESIGN,
      messages,
      temperature: 0.8,
      max_tokens: TOKEN_LIMITS.UX_DESIGN,
    });

    return response.choices[0]?.message?.content || '';
  }
}

// Factory function for server-side usage
export function createOpenRouterClient(): OpenRouterClient {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY environment variable is not set');
  }
  return new OpenRouterClient(
    apiKey,
    process.env.NEXT_PUBLIC_SITE_URL || '',
    'AI App Builder'
  );
}
