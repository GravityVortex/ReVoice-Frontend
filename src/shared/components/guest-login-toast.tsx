import { Check, X } from 'lucide-react';

interface GuestLoginToastProps {
  t: (key: string) => string;
  onDismiss: () => void;
}

export function GuestLoginToast({ t, onDismiss }: GuestLoginToastProps) {
  return (
    <div className="flex w-full items-start gap-3 rounded-xl border border-white/10 bg-black/40 p-4 shadow-2xl backdrop-blur-xl transition-all duration-300 hover:bg-black/50">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary ring-1 ring-primary/30">
        <Check className="h-5 w-5" />
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <h3 className="text-sm font-semibold text-white">
          {t('guest_login_success_title')}
        </h3>
        <p className="text-xs leading-relaxed text-zinc-400">
          {t('guest_login_success_desc')}
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="group -mr-1 -mt-1 rounded-lg p-1 text-zinc-500 transition-colors hover:bg-white/10 hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
