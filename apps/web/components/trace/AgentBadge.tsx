import { cn } from '@/lib/utils/cn';

const palette: Record<string, string> = {
  multilingualNLU: 'bg-sky-500',
  router: 'bg-slate-500',
  greeter: 'bg-emerald-500',
  recommendation: 'bg-rose-500',
  upsell: 'bg-amber-500',
  contextMemory: 'bg-violet-500',
  sentiment: 'bg-pink-500',
  groupCoordinator: 'bg-teal-500',
  orderValidation: 'bg-indigo-500',
};

export function AgentBadge({ name }: { name: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white',
        palette[name] ?? 'bg-zinc-500',
      )}
    >
      {name}
    </span>
  );
}
