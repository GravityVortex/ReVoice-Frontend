import { cn } from '@/shared/lib/utils';

const LANG_STYLES: Record<string, { bg: string; text: string }> = {
  en: { bg: 'bg-indigo-500/15', text: 'text-indigo-300' },
  zh: { bg: 'bg-red-500/15', text: 'text-red-300' },
  ja: { bg: 'bg-rose-500/15', text: 'text-rose-300' },
  es: { bg: 'bg-amber-500/15', text: 'text-amber-300' },
  fr: { bg: 'bg-blue-500/15', text: 'text-blue-300' },
  de: { bg: 'bg-zinc-400/15', text: 'text-zinc-300' },
  it: { bg: 'bg-emerald-500/15', text: 'text-emerald-300' },
  pt: { bg: 'bg-teal-500/15', text: 'text-teal-300' },
};

const FALLBACK_STYLE = { bg: 'bg-white/10', text: 'text-white/70' };

export function LangBadge({
  code,
  size = 'md',
  className,
}: {
  code: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizeMap = {
    sm: 'size-5 text-[9px]',
    md: 'size-7 text-[10px]',
    lg: 'size-9 text-xs',
  };
  const style = LANG_STYLES[code] || FALLBACK_STYLE;

  return (
    <span
      className={cn(
        sizeMap[size],
        style.bg,
        style.text,
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-wide uppercase',
        className
      )}
    >
      {code}
    </span>
  );
}
