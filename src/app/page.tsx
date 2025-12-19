import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Sparkles,
  Code2,
  Zap,
  Eye,
  MessageSquare,
  Blocks,
  ArrowRight,
  Github,
} from 'lucide-react';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-neutral-950 via-neutral-900 to-neutral-950 text-white">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-neutral-800/50 bg-neutral-950/80 backdrop-blur-xl">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-lg">AI App Builder</span>
          </div>
          <nav className="hidden md:flex items-center gap-8">
            <Link
              href="#features"
              className="text-sm text-neutral-400 hover:text-white transition-colors"
            >
              Recursos
            </Link>
            <Link
              href="#how-it-works"
              className="text-sm text-neutral-400 hover:text-white transition-colors"
            >
              Como Funciona
            </Link>
            <Link
              href="#pricing"
              className="text-sm text-neutral-400 hover:text-white transition-colors"
            >
              Preços
            </Link>
          </nav>
          <div className="flex items-center gap-4">
            <Link href="/login">
              <Button variant="ghost" size="sm">
                Entrar
              </Button>
            </Link>
            <Link href="/projects">
              <Button
                size="sm"
                className="bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600"
              >
                Começar Grátis
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-32 pb-20 px-4">
        <div className="container mx-auto text-center max-w-4xl">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-500/10 border border-violet-500/20 mb-8">
            <Sparkles className="h-4 w-4 text-violet-400" />
            <span className="text-sm text-violet-300">
              Powered by GLM-4.6, Qwen2.5-VL & Gemini 3.0 Flash
            </span>
          </div>

          <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-white via-violet-200 to-fuchsia-200 bg-clip-text text-transparent">
            Descreva. Crie.
            <br />
            Publique.
          </h1>

          <p className="text-xl text-neutral-400 mb-10 max-w-2xl mx-auto">
            Transforme suas ideias em aplicações web funcionais usando apenas
            texto. A IA entende o que você quer e gera código de produção
            instantaneamente.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/projects/new">
              <Button
                size="lg"
                className="bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 text-lg px-8 h-14"
              >
                Criar Seu Primeiro App
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="https://github.com" target="_blank">
              <Button
                variant="outline"
                size="lg"
                className="text-lg px-8 h-14 border-neutral-700 hover:bg-neutral-800"
              >
                <Github className="mr-2 h-5 w-5" />
                Ver no GitHub
              </Button>
            </Link>
          </div>
        </div>

        {/* Hero Image/Demo */}
        <div className="container mx-auto mt-16 max-w-6xl">
          <div className="relative rounded-xl overflow-hidden border border-neutral-800 bg-neutral-900 shadow-2xl shadow-violet-500/10">
            <div className="h-8 bg-neutral-800 flex items-center px-4 gap-2">
              <div className="h-3 w-3 rounded-full bg-red-500" />
              <div className="h-3 w-3 rounded-full bg-yellow-500" />
              <div className="h-3 w-3 rounded-full bg-green-500" />
              <span className="ml-4 text-xs text-neutral-500">
                AI App Builder
              </span>
            </div>
            <div className="aspect-video bg-gradient-to-br from-neutral-900 via-violet-950/20 to-neutral-900 flex items-center justify-center">
              <div className="text-center">
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center mx-auto mb-6">
                  <Code2 className="h-12 w-12 text-white" />
                </div>
                <p className="text-neutral-500">Demo da IDE virá aqui</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-4 bg-neutral-900/50">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Tudo que você precisa para criar
            </h2>
            <p className="text-neutral-400 max-w-2xl mx-auto">
              Uma IDE completa no navegador com IA integrada, preview em tempo
              real e deploy instantâneo.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: MessageSquare,
                title: 'Chat com IA',
                description:
                  'Descreva o que você quer em linguagem natural e a IA gera o código automaticamente.',
              },
              {
                icon: Code2,
                title: 'Editor Monaco',
                description:
                  'O mesmo editor do VS Code, com syntax highlighting, autocomplete e muito mais.',
              },
              {
                icon: Eye,
                title: 'Preview em Tempo Real',
                description:
                  'Veja suas mudanças instantaneamente com hot reload no navegador.',
              },
              {
                icon: Zap,
                title: 'Correção Automática',
                description:
                  'A IA detecta erros e propõe correções automaticamente.',
              },
              {
                icon: Blocks,
                title: 'Design Tokens',
                description:
                  'Edite cores, fontes e espaçamentos em tempo real com reflexo instantâneo.',
              },
              {
                icon: Sparkles,
                title: 'Screenshot → Código',
                description:
                  'Envie uma imagem de referência e a IA recria o design para você.',
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="p-6 rounded-xl bg-neutral-800/50 border border-neutral-700/50 hover:border-violet-500/50 transition-colors"
              >
                <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 flex items-center justify-center mb-4">
                  <feature.icon className="h-6 w-6 text-violet-400" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-neutral-400 text-sm">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-4xl text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Pronto para criar algo incrível?
          </h2>
          <p className="text-neutral-400 mb-10 max-w-xl mx-auto">
            Comece a criar seu app agora mesmo. Nenhuma configuração necessária.
          </p>
          <Link href="/projects/new">
            <Button
              size="lg"
              className="bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 text-lg px-8 h-14"
            >
              Começar Agora
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-neutral-800 py-8 px-4">
        <div className="container mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded bg-gradient-to-br from-violet-500 to-fuchsia-500" />
            <span className="font-semibold">AI App Builder</span>
          </div>
          <p className="text-sm text-neutral-500">
            © 2024 AI App Builder. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}
