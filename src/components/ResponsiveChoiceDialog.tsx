import { Check } from 'lucide-react';
import ResponsiveDialog from './ResponsiveDialog';

export interface ResponsiveChoice {
  value: string;
  label: string;
  description?: string;
}

export default function ResponsiveChoiceDialog({ title, value, options, onChange, onClose }: {
  title: string;
  value: string;
  options: ResponsiveChoice[];
  onChange: (value: string) => void;
  onClose: () => void;
}) {
  return <ResponsiveDialog title={title} onClose={onClose}>
    <div className="grid gap-2">
      {options.map(option => {
        const selected = option.value === value;
        return <button key={option.value} type="button" onClick={() => { onChange(option.value); onClose(); }} className={`flex min-h-12 items-center justify-between gap-3 rounded-xl border px-4 py-2 text-left ${selected ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300' : 'border-slate-200 dark:border-zinc-700'}`}>
          <span className="min-w-0"><strong className="block break-words text-base">{option.label}</strong>{option.description ? <span className="mt-0.5 block text-xs font-medium text-slate-400">{option.description}</span> : null}</span>
          {selected ? <Check className="h-5 w-5 shrink-0" /> : null}
        </button>;
      })}
    </div>
  </ResponsiveDialog>;
}
