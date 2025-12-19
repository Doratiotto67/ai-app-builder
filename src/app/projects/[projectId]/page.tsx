import { IDELayout } from '@/components/ide/ide-layout';
import type { Metadata } from 'next';

interface ProjectPageProps {
  params: Promise<{ projectId: string }>;
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { projectId } = await params;

  return <IDELayout projectId={projectId} />;
}

export async function generateMetadata({ params }: ProjectPageProps): Promise<Metadata> {
  const { projectId } = await params;
  
  return {
    title: `Projeto ${projectId} - AI App Builder`,
    description: 'IDE com IA para criar apps',
  };
}

