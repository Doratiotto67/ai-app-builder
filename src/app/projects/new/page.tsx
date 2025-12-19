'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/auth-provider';
import { createOrganization, getOrganizations, createProject } from '@/lib/api/project-service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sparkles, ArrowLeft, Loader2, Plus } from 'lucide-react';
import { useEffect } from 'react';

interface Organization {
  id: string;
  name: string;
  slug: string;
}

export default function NewProjectPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [orgId, setOrgId] = useState<string>('');
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(false);
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      // Redireciona para login com informação do callback
      router.push('/login?next=/projects/new&reason=auth_required');
      return;
    }

    if (user) {
      loadOrganizations();
    }
  }, [user, authLoading, router]);

  const loadOrganizations = async () => {
    try {
      const orgs = await getOrganizations();
      setOrganizations(orgs as Organization[]);
      if (orgs.length > 0) {
        setOrgId(orgs[0].id);
      }
      // Se não tiver organizações, o usuário verá o botão para criar uma
    } catch (error) {
      console.error('Failed to load organizations:', error);
      // Não tenta criar automaticamente - deixa o usuário criar manualmente
      setOrganizations([]);
    }
  };

  const handleCreateDefaultOrg = async () => {
    if (!user) {
      setError('Você precisa estar logado para criar uma organização');
      return;
    }

    setCreatingOrg(true);
    setError(null);
    try {
      const org = await createOrganization('Minha Organização');
      setOrganizations([org as Organization]);
      setOrgId(org.id);
    } catch (error) {
      console.error('Failed to create organization:', error);
      
      let errorMessage = 'Não foi possível criar a organização.';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'object' && error !== null && 'message' in error) {
        errorMessage = (error as { message: string }).message;
      }

      if (errorMessage.includes('relation "public.orgs" does not exist')) {
        errorMessage = 'Banco de dados não inicializado. Execute a migração SQL no Supabase.';
      } else if (errorMessage.includes('infinite recursion') || errorMessage.includes('stack depth limit exceeded')) {
        errorMessage = 'Erro de política de segurança (Recursão). Execute a migração "20241219000005_fix_recursion_v4.sql" no Supabase.';
      } else if (errorMessage.includes('duplicate key')) {
        errorMessage = 'Nome de organização já existe. Tentando criar com nome único...';
        // Opcional: Aqui poderíamos tentar novamente automaticamente, mas por enquanto vamos orientar o usuário
        // Como alteramos o service para gerar slug único, o próximo clique deve funcionar.
        errorMessage = 'Conflito de nome resolvido. Por favor, clique em "Criar organização" novamente.';
      }

      setError(errorMessage);
    } finally {
      setCreatingOrg(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !orgId) return;

    setLoading(true);
    setError(null);

    try {
      const project = await createProject(orgId, name, description);
      router.push(`/projects/${project.id}`);
    } catch (error) {
      console.error('Failed to create project:', error);
      let errorMessage = 'Erro ao criar projeto';

      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'object' && error !== null && 'message' in error) {
        errorMessage = (error as { message: string }).message;
      }

      setError(errorMessage);
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-neutral-950 via-neutral-900 to-neutral-950">
      {/* Header */}
      <header className="border-b border-neutral-800 bg-neutral-950/80 backdrop-blur-xl">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/projects" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-lg text-white">AI App Builder</span>
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 py-12 max-w-2xl">
        <Link
          href="/projects"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-white mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para projetos
        </Link>

        <Card className="bg-card/50 backdrop-blur-xl border-neutral-800">
          <CardHeader>
            <CardTitle className="text-2xl">Criar Novo Projeto</CardTitle>
            <CardDescription>
              Descreva seu projeto e a IA ajudará você a construí-lo
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">Nome do Projeto</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ex: Minha Landing Page"
                  className="bg-neutral-800/50 border-neutral-700"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Descrição (opcional)</label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descreva o que você quer construir..."
                  className="bg-neutral-800/50 border-neutral-700 min-h-[100px]"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Organização</label>
                {organizations.length > 0 ? (
                  <Select value={orgId} onValueChange={setOrgId}>
                    <SelectTrigger className="bg-neutral-800/50 border-neutral-700">
                      <SelectValue placeholder="Selecione uma organização" />
                    </SelectTrigger>
                    <SelectContent>
                      {organizations.map((org) => (
                        <SelectItem key={org.id} value={org.id}>
                          {org.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full bg-neutral-800/50 border-neutral-700"
                    onClick={handleCreateDefaultOrg}
                    disabled={creatingOrg}
                  >
                    {creatingOrg ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Plus className="h-4 w-4 mr-2" />
                    )}
                    Criar organização
                  </Button>
                )}
              </div>

              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600"
                disabled={loading || !name.trim() || !orgId}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Criando...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Criar Projeto
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Quick Start Templates */}
        <div className="mt-8">
          <h3 className="text-lg font-semibold mb-4">Ou comece com um template</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { name: 'Landing Page', icon: '🚀' },
              { name: 'Dashboard', icon: '📊' },
              { name: 'E-commerce', icon: '🛒' },
              { name: 'Blog', icon: '📝' },
              { name: 'Portfolio', icon: '🎨' },
              { name: 'SaaS', icon: '💼' },
            ].map((template) => (
              <button
                key={template.name}
                type="button"
                className="p-4 rounded-lg border border-neutral-800 bg-neutral-900/50 hover:bg-neutral-800/50 hover:border-violet-500/50 transition-colors text-left"
                onClick={() => {
                  setName(template.name);
                  setDescription(`Um ${template.name.toLowerCase()} moderno e responsivo.`);
                }}
              >
                <div className="text-2xl mb-2">{template.icon}</div>
                <div className="font-medium text-sm">{template.name}</div>
              </button>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
