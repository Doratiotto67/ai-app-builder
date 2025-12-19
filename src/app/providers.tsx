'use client';

import { useEffect } from 'react';
import { AuthProvider } from '@/lib/auth/auth-provider';
import { logSystemStatus } from '@/lib/debug/logger';

export function Providers({ children }: { children: React.ReactNode }) {
  // Inicializar sistema de debug no primeiro render
  useEffect(() => {
    logSystemStatus();
  }, []);

  return <AuthProvider>{children}</AuthProvider>;
}
