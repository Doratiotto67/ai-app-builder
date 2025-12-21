
import React from 'react';
import { ArrowRight } from 'lucide-react';

export function Hero() {
    return (
        <section className="relative px-4 py-24 mx-auto max-w-7xl sm:px-6 lg:px-8 bg-zinc-900 border-b border-zinc-800">
            <div className="w-full max-w-4xl mx-auto text-center">
                <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl md:text-6xl">
                    <span className="block">Dê Vida às suas</span>
                    <span className="block text-indigo-400">Ideias Mais Ousadas</span>
                </h1>
                <p className="mt-6 text-xl text-gray-400 max-w-2xl mx-auto">
                    Uma plataforma poderosa para construir o futuro. Comece a desenvolver hoje mesmo com ferramentas de última geração.
                </p>
                <div className="mt-10 flex justify-center gap-4">
                    <button className="px-8 py-3 text-base font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors md:text-lg md:px-10">
                        Começar Grátis
                    </button>
                    <button className="flex items-center px-8 py-3 text-base font-medium text-indigo-100 bg-zinc-800 rounded-lg hover:bg-zinc-700 transition-colors md:text-lg md:px-10">
                        Documentação <ArrowRight className="w-5 h-5 ml-2" />
                    </button>
                </div>
            </div>
        </section>
    );
}
