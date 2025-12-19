import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Folder, Clock, ArrowRight, Sparkles } from 'lucide-react';

// Mock data - será substituído por dados do Supabase
const mockProjects = [
  {
    id: '1',
    name: 'Landing Page SaaS',
    description: 'Uma landing page moderna para um produto SaaS',
    updated_at: '2024-12-18T10:00:00Z',
  },
  {
    id: '2',
    name: 'Dashboard Admin',
    description: 'Painel administrativo com gráficos e tabelas',
    updated_at: '2024-12-17T15:30:00Z',
  },
  {
    id: '3',
    name: 'E-commerce',
    description: 'Loja virtual completa com carrinho',
    updated_at: '2024-12-16T09:00:00Z',
  },
];

function formatDate(dateString: string) {
  const date = new Date(dateString);
  return new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' }).format(
    Math.round((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
    'day'
  );
}

export default function ProjectsPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-lg">AI App Builder</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/projects/new">
              <Button className="bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600">
                <Plus className="mr-2 h-4 w-4" />
                Novo Projeto
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Seus Projetos</h1>
          <p className="text-muted-foreground">
            Gerencie seus projetos e crie novos apps com IA
          </p>
        </div>

        {mockProjects.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Folder className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Nenhum projeto ainda</h3>
              <p className="text-muted-foreground mb-6 text-center max-w-sm">
                Crie seu primeiro projeto e comece a construir apps incríveis com IA.
              </p>
              <Link href="/projects/new">
                <Button className="bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600">
                  <Plus className="mr-2 h-4 w-4" />
                  Criar Primeiro Projeto
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* New Project Card */}
            <Link href="/projects/new">
              <Card className="border-dashed hover:border-violet-500/50 hover:bg-accent/50 transition-colors cursor-pointer h-full">
                <CardContent className="flex flex-col items-center justify-center h-full min-h-[200px]">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 flex items-center justify-center mb-4">
                    <Plus className="h-6 w-6 text-violet-500" />
                  </div>
                  <span className="font-medium">Novo Projeto</span>
                </CardContent>
              </Card>
            </Link>

            {/* Project Cards */}
            {mockProjects.map((project) => (
              <Link key={project.id} href={`/projects/${project.id}`}>
                <Card className="hover:border-violet-500/50 hover:shadow-lg hover:shadow-violet-500/5 transition-all cursor-pointer h-full group">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
                        <Folder className="h-5 w-5 text-white" />
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <CardTitle className="mt-4">{project.name}</CardTitle>
                    <CardDescription>{project.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>Atualizado {formatDate(project.updated_at)}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
