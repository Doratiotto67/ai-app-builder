'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
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
    <div className={cn('my-2', className)}>
      {/* Collapsed summary */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        {runningStep ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-400" />
            <span className="italic">{runningStep.label}</span>
          </>
        ) : (
          <>
            <span className="step-line">{completedCount} etapas concluídas</span>
          </>
        )}
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" />
        )}
      </button>

      {/* Expanded list */}
      <AnimatePresence>
        {expanded && (
          <motion.ul
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-2 ml-4 space-y-1 overflow-hidden"
          >
            {steps.map((step) => (
              <li
                key={step.id}
                className={cn(
                  'flex items-center gap-2 text-sm',
                  step.status === 'done' && 'text-zinc-500',
                  step.status === 'running' && 'text-zinc-200',
                  step.status === 'error' && 'text-red-400',
                  step.status === 'pending' && 'text-zinc-600'
                )}
              >
                {step.status === 'running' && (
                  <Loader2 className="h-3 w-3 animate-spin text-violet-400" />
                )}
                {step.status === 'done' && (
                  <span className="h-3 w-3 rounded-full bg-green-500/70" />
                )}
                {step.status === 'error' && (
                  <span className="h-3 w-3 rounded-full bg-red-500/70" />
                )}
                {step.status === 'pending' && (
                  <span className="h-3 w-3 rounded-full bg-zinc-600/50" />
                )}
                <span>{step.label}</span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

export default StepViewer;
