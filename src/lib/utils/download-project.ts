'use client';

import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import type { ProjectFile } from '@/types/database';

/**
 * Cria um arquivo ZIP com todos os arquivos do projeto e faz o download
 * @param files Array de arquivos do projeto
 * @param projectName Nome do projeto para o arquivo ZIP
 */
export async function downloadProjectAsZip(
  files: ProjectFile[],
  projectName: string
): Promise<void> {
  if (!files || files.length === 0) {
    throw new Error('Nenhum arquivo para download');
  }

  const zip = new JSZip();
  
  // Sanitizar nome do projeto para nome de arquivo válido
  const sanitizedProjectName = projectName
    .replace(/[^a-zA-Z0-9\s-_]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase()
    || 'projeto';

  // Adicionar cada arquivo ao ZIP mantendo a estrutura de pastas
  for (const file of files) {
    const content = file.content_text || '';
    // Remover barra inicial se existir para evitar pasta raiz vazia
    const filePath = file.path.startsWith('/') ? file.path.slice(1) : file.path;
    
    zip.file(filePath, content);
  }

  // Gerar o ZIP
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 }, // Melhor compressão
  });

  // Fazer download
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  saveAs(blob, `${sanitizedProjectName}-${timestamp}.zip`);
}

/**
 * Hook-like helper para UI - retorna estado do download
 */
export interface DownloadState {
  isDownloading: boolean;
  error: string | null;
}
