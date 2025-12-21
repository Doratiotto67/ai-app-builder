// Pacotes permitidos no WebContainer
// Se um import não começar com "." (relativo) e não estiver nesta lista, será marcado como inválido.

export const ALLOWED_PACKAGES = [
    // React Core
    'react',
    'react-dom',
    'react-dom/client',
    'react/jsx-runtime',

    // Routing
    'react-router-dom',

    // Styling & UI
    'clsx',
    'tailwind-merge',
    'framer-motion', // Versão suportada

    // Icons
    'lucide-react', // Preferido
    'react-icons',  // Fallback
    'react-icons/fa',
    'react-icons/fi',
    'react-icons/md',
    'react-icons/bi',
    'react-icons/bs',
    'react-icons/hi',

    // Data Fetching
    '@supabase/supabase-js',
    'axios',
    'swr',
    '@tanstack/react-query',

    // Forms
    'react-hook-form',
    'zod',
    '@hookform/resolvers/zod',

    // Utilities
    'date-fns',
    'uuid',
    'lodash',
    'canvas-confetti',

    // UI Components (se instalados)
    '@headlessui/react',
    'react-hot-toast',

    // Charts
    'recharts',
    'chart.js',
    'react-chartjs-2'
];
