'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Loader2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Step {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'error';
  details?: string;
}

interface StepViewerProps {
  steps: Step[];
  className?: string;
}

export function StepViewer({ steps, className }: StepViewerProps) {
  const [expanded, setExpanded] = useState(false);

  if (steps.length === 0) return null;

  const runningStep = steps.find((s) => s.status === 'running');
  const completedCount = steps.filter((s) => s.status === 'done').length;

  return (
    <div className={cn('my-2 group/steps', className)}>
      {/* Collapsed summary */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-3 text-[12px] font-medium text-zinc-500 hover:text-zinc-300 transition-all bg-zinc-900/40 px-3 py-1.5 rounded-full border border-zinc-800/50 hover:border-zinc-700 shadow-sm"
      >
        <div className="relative flex items-center justify-center">
          {runningStep ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-400" />
          ) : (
            <div className="h-3.5 w-3.5 rounded-full bg-violet-500/20 border border-violet-500/40 flex items-center justify-center">
              <Check className="h-2 w-2 text-violet-400" />
            </div>
          )}
        </div>

        <span className="tracking-tight">
          {runningStep ? (
            <span className="italic">{runningStep.label}</span>
          ) : (
            <span>{completedCount} {completedCount === 1 ? 'fase concluída' : 'fases concluídas'}</span>
          )}
        </span>

        <div className={cn(
          "h-4 w-4 rounded-full flex items-center justify-center bg-zinc-800/50 border border-zinc-700/50 transition-transform duration-300",
          expanded ? "rotate-180" : "rotate-0"
        )}>
          <ChevronDown className="h-2.5 w-2.5" />
        </div>
      </button>

      {/* Expanded list */}
      <AnimatePresence>
        {expanded && (
          <motion.ul
            initial={{ opacity: 0, height: 0, y: -4 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -4 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="mt-3 ml-6 space-y-2.5 overflow-hidden relative"
          >
            {/* Thread line */}
            <div className="absolute left-[-15px] top-0 bottom-2 w-[1.5px] bg-gradient-to-b from-zinc-800 to-transparent" />

            {steps.map((step, idx) => (
              <motion.li
                key={step.id}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                className={cn(
                  'flex items-center gap-3 text-[12.5px] transition-colors',
                  step.status === 'done' && 'text-zinc-500',
                  step.status === 'running' && 'text-zinc-200 font-medium',
                  step.status === 'error' && 'text-red-400',
                  step.status === 'pending' && 'text-zinc-600'
                )}
              >
                <div className="shrink-0 relative">
                  {step.status === 'running' && (
                    <Loader2 className="h-3 w-3 animate-spin text-violet-400" />
                  )}
                  {step.status === 'done' && (
                    <div className="h-1.5 w-1.5 rounded-full bg-violet-500/60 shadow-[0_0_8px_rgba(139,92,246,0.4)]" />
                  )}
                  {step.status === 'error' && (
                    <div className="h-1.5 w-1.5 rounded-full bg-red-500/60" />
                  )}
                  {step.status === 'pending' && (
                    <div className="h-1.5 w-1.5 rounded-full bg-zinc-800" />
                  )}
                </div>
                <span className="tracking-tight">{step.label}</span>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

export default StepViewer;
