// Declarações de tipo para Deno runtime em Supabase Edge Functions
// Este arquivo resolve os erros de tipagem no ambiente local

declare global {
  namespace Deno {
    interface Env {
      get(key: string): string | undefined;
      set(key: string, value: string): void;
      delete(key: string): void;
      has(key: string): boolean;
      toObject(): { [key: string]: string };
    }
    
    const env: Env;
    
    function serve(
      handler: (request: Request) => Response | Promise<Response>
    ): void;
    
    function serve(
      options: { port?: number; hostname?: string },
      handler: (request: Request) => Response | Promise<Response>
    ): void;
  }

  interface EdgeRuntime {
    waitUntil(promise: Promise<unknown>): void;
  }
}

export {};
