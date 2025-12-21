
import React from 'react';
import { ArrowRight } from 'lucide-react';

export function HeroSection() {
    return (
        <section className="relative px-4 py-24 mx-auto max-w-7xl sm:px-6 lg:px-8">
            <div className="w-full max-w-4xl mx-auto text-center">
                <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl md:text-6xl">
                    <span className="block">Transforme suas Ideias</span>
                    <span className="block text-indigo-400">Em Realidade</span>
                </h1>
                <p className="mt-6 text-xl text-gray-300 max-w-2xl mx-auto">
                    Crie aplicações incríveis com facilidade. Nossa plataforma fornece tudo o que você precisa para lançar seu próximo grande projeto.
                </p>
                <div className="mt-10 flex justify-center gap-4">
                    <button className="px-8 py-3 text-base font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 md:text-lg md:px-10">
                        Começar Agora
                    </button>
                    <button className="flex items-center px-8 py-3 text-base font-medium text-indigo-100 bg-gray-800 rounded-lg hover:bg-gray-700 md:text-lg md:px-10">
                        Saiba Mais <ArrowRight className="w-5 h-5 ml-2" />
                    </button>
                </div>
            </div>
        </section>
    );
}
