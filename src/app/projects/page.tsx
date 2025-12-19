'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-provider';
import { getProjects, getOrganizations, createProject, createOrganization, deleteProject } from '@/lib/api/project-service';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { 
  Plus, 
  Folder, 
  Clock, 
  ArrowRight, 
  Sparkles, 
  Loader2, 
  Eye, 
  Trash2, 
  MoreVertical, 
  LogOut,
  User,
  Building2,
  Code,
  Palette,
  ShoppingCart,
  BarChart3
} from 'lucide-react';

interface Project {
  id: string;
  name: string;
  description: string | null;
  updated_at: string;
  created_at: string;
  orgs?: { name: string; slug: string };
}

interface Organization {
  id: string;
  name: string;
  slug: string;
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'Hoje';
  if (diffDays === 1) return 'Ontem';
  if (diffDays < 7) return `${diffDays} dias atrás`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} semanas atrás`;
  return date.toLocaleDateString('pt-BR');
}

function getProjectIcon(name: string) {
  const nameLower = name.toLowerCase();
  if (nameLower.includes('dashboard') || nameLower.includes('admin')) return <BarChart3 className="h-5 w-5 text-white" />;
  if (nameLower.includes('ecommerce') || nameLower.includes('loja') || nameLower.includes('shop')) return <ShoppingCart className="h-5 w-5 text-white" />;
  if (nameLower.includes('landing') || nameLower.includes('page')) return <Palette className="h-5 w-5 text-white" />;
  return <Code className="h-5 w-5 text-white" />;
}

function getProjectGradient(index: number) {
  const gradients = [
    'from-violet-500 to-fuchsia-500',
    'from-blue-500 to-cyan-500',
    'from-emerald-500 to-teal-500',
    'from-orange-500 to-amber-500',
    'from-pink-500 to-rose-500',
    'from-indigo-500 to-purple-500',
  ];
  return gradients[index % gradients.length];
}

export default function ProjectsPage() {
  const { user, signOut, loading: authLoading } = useAuth();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?next=/projects');
      return;
    }
    
    if (user) {
      loadData();
    }
  }, [user, authLoading, router]);

  async function loadData() {
    try {
      setLoading(true);
      console.log('[Projects] Carregando dados para usuário:', user?.email);
      
      // Carregar projetos
      let projectsData = [];
      try {
        projectsData = await getProjects();
        console.log('[Projects] Projetos carregados:', projectsData?.length || 0);
      } catch (projError: unknown) {
        console.warn('[Projects] Erro ao carregar projetos (pode ser RLS):', projError);
        // Se falhar, pode ser que não tenha projetos ou RLS bloqueou
      }
      
      // Carregar organizações
      let orgsData = [];
      try {
        orgsData = await getOrganizations();
        console.log('[Projects] Organizações carregadas:', orgsData?.length || 0);
      } catch (orgError: unknown) {
        console.warn('[Projects] Erro ao carregar organizações (pode ser RLS):', orgError);
        // Se falhar, vamos criar uma org automaticamente na criação do projeto
      }
      
      setProjects(projectsData || []);
      setOrganizations(orgsData || []);
    } catch (error: unknown) {
      console.error('Erro geral ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  }


  async function handleCreateProject() {
    if (!newProjectName.trim()) return;
    
    setCreating(true);
    try {
      let orgId = organizations[0]?.id;
      console.log('[Projects] Criando projeto. Org existente:', orgId);
      
      // Se não tem organização, criar uma
      if (!orgId) {
        console.log('[Projects] Nenhuma org encontrada, criando nova...');
        try {
          const newOrg = await createOrganization('Minha Organização');
          orgId = newOrg.id;
          setOrganizations([newOrg]);
          console.log('[Projects] Nova org criada:', orgId);
        } catch (orgError: unknown) {
          const errorMessage = orgError instanceof Error ? orgError.message : String(orgError);
          console.error('[Projects] Erro ao criar organização:', errorMessage);
          throw new Error(`Falha ao criar organização: ${errorMessage}`);
        }
      }
      
      console.log('[Projects] Criando projeto na org:', orgId);
      const project = await createProject(orgId, newProjectName, newProjectDescription || undefined);
      console.log('[Projects] Projeto criado:', project.id);
      router.push(`/projects/${project.id}`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Erro ao criar projeto:', errorMessage, error);
      alert(`Erro ao criar projeto: ${errorMessage}`);
    } finally {
      setCreating(false);
      setDialogOpen(false);
    }
  }


  async function handleDeleteProject(projectId: string) {
    if (!confirm('Tem certeza que deseja excluir este projeto? Esta ação não pode ser desfeita.')) return;
    
    setDeletingId(projectId);
    try {
      await deleteProject(projectId);
      setProjects(projects.filter(p => p.id !== projectId));
    } catch (error) {
      console.error('Erro ao excluir projeto:', error);
      alert('Erro ao excluir projeto. Tente novamente.');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleSignOut() {
    await signOut();
    router.push('/login');
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-neutral-950 via-neutral-900 to-neutral-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
          <p className="text-muted-foreground">Carregando projetos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-neutral-950 via-neutral-900 to-neutral-950">
      {/* Header */}
      <header className="border-b border-neutral-800 bg-neutral-950/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-lg text-white">AI App Builder</span>
          </Link>
          
          <div className="flex items-center gap-4">
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600">
                  <Plus className="mr-2 h-4 w-4" />
                  Novo Projeto
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-neutral-900 border-neutral-800">
                <DialogHeader>
                  <DialogTitle>Criar Novo Projeto</DialogTitle>
                  <DialogDescription>
                    Dê um nome ao seu projeto para começar a construir com IA.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <Input
                    placeholder="Nome do projeto"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    className="bg-neutral-800 border-neutral-700"
                  />
                  <Input
                    placeholder="Descrição (opcional)"
                    value={newProjectDescription}
                    onChange={(e) => setNewProjectDescription(e.target.value)}
                    className="bg-neutral-800 border-neutral-700"
                  />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button 
                    onClick={handleCreateProject}
                    disabled={creating || !newProjectName.trim()}
                    className="bg-gradient-to-r from-violet-500 to-fuchsia-500"
                  >
                    {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                    Criar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                  <Avatar className="h-10 w-10 border-2 border-violet-500/50">
                    <AvatarFallback className="bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white">
                      {user?.email?.charAt(0).toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-neutral-900 border-neutral-800">
                <div className="flex items-center gap-2 p-2 border-b border-neutral-800">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm truncate">{user?.email}</span>
                </div>
                <DropdownMenuItem onClick={handleSignOut} className="text-red-400 focus:text-red-400">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2 text-white">Seus Projetos</h1>
          <p className="text-muted-foreground">
            {projects.length === 0 
              ? 'Crie seu primeiro projeto e comece a construir com IA'
              : `${projects.length} projeto${projects.length !== 1 ? 's' : ''} • Gerencie seus apps`
            }
          </p>
        </div>

        {projects.length === 0 ? (
          <Card className="border-dashed border-neutral-700 bg-neutral-900/50">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 flex items-center justify-center mb-6">
                <Folder className="h-10 w-10 text-violet-500" />
              </div>
              <h3 className="text-xl font-semibold mb-2 text-white">Nenhum projeto ainda</h3>
              <p className="text-muted-foreground mb-6 text-center max-w-md">
                Crie seu primeiro projeto e comece a construir aplicações incríveis com inteligência artificial.
              </p>
              <Button 
                onClick={() => setDialogOpen(true)}
                className="bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600"
              >
                <Plus className="mr-2 h-4 w-4" />
                Criar Primeiro Projeto
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* New Project Card */}
            <Card 
              className="border-dashed border-neutral-700 hover:border-violet-500/50 bg-neutral-900/30 hover:bg-neutral-900/50 transition-all cursor-pointer h-full group"
              onClick={() => setDialogOpen(true)}
            >
              <CardContent className="flex flex-col items-center justify-center h-full min-h-[280px]">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Plus className="h-8 w-8 text-violet-500" />
                </div>
                <span className="font-medium text-white">Novo Projeto</span>
                <span className="text-sm text-muted-foreground mt-1">Comece a construir</span>
              </CardContent>
            </Card>

            {/* Project Cards */}
            {projects.map((project, index) => (
              <Card 
                key={project.id} 
                className="border-neutral-800 bg-neutral-900/50 hover:border-violet-500/50 hover:shadow-lg hover:shadow-violet-500/5 transition-all h-full group overflow-hidden"
              >
                {/* Mini Preview Area */}
                <div className={`h-32 bg-gradient-to-br ${getProjectGradient(index)} relative overflow-hidden`}>
                  <div className="absolute inset-0 bg-black/20" />
                  <div className="absolute inset-4 bg-neutral-900/90 rounded-lg p-2 overflow-hidden">
                    <div className="space-y-1">
                      <div className="h-2 bg-neutral-700 rounded w-3/4" />
                      <div className="h-2 bg-neutral-700 rounded w-1/2" />
                      <div className="h-6 bg-violet-500/30 rounded mt-2" />
                      <div className="h-2 bg-neutral-700 rounded w-2/3 mt-2" />
                    </div>
                  </div>
                  <div className="absolute top-2 right-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 bg-black/30 hover:bg-black/50">
                          <MoreVertical className="h-4 w-4 text-white" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-neutral-900 border-neutral-800">
                        <DropdownMenuItem asChild>
                          <Link href={`/projects/${project.id}`} className="flex items-center">
                            <Eye className="mr-2 h-4 w-4" />
                            Abrir
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => handleDeleteProject(project.id)}
                          className="text-red-400 focus:text-red-400"
                          disabled={deletingId === project.id}
                        >
                          {deletingId === project.id ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="mr-2 h-4 w-4" />
                          )}
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                <Link href={`/projects/${project.id}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${getProjectGradient(index)} flex items-center justify-center`}>
                        {getProjectIcon(project.name)}
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <CardTitle className="mt-3 text-white">{project.name}</CardTitle>
                    <CardDescription className="line-clamp-2">
                      {project.description || 'Sem descrição'}
                    </CardDescription>
                  </CardHeader>
                  <CardFooter className="pt-0">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>Atualizado {formatDate(project.updated_at)}</span>
                    </div>
                  </CardFooter>
                </Link>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
