"use client";

import { cn } from "@/shared/lib/utils";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  X,
  XCircle,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, ToasterProps } from "sonner";
import { useEffect, useState } from "react";

const Toaster = ({ toastOptions, icons, style, ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  const mergedToastOptions: NonNullable<ToasterProps["toastOptions"]> = {
    duration: 3600,
    unstyled: true,
    ...toastOptions,
    classNames: {
      toast: cn(
        "toast-glass group pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-xl p-3 font-sans text-foreground backdrop-blur-[var(--glass-blur)]",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--toast-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        toastOptions?.classNames?.toast
      ),
      icon: cn(
        "relative z-10 mt-0.5 text-[var(--toast-accent)]",
        toastOptions?.classNames?.icon
      ),
      content: cn(
        "relative z-10 flex min-w-0 flex-1 flex-col gap-0.5",
        toastOptions?.classNames?.content
      ),
      title: cn(
        "text-sm font-medium leading-5 tracking-tight",
        toastOptions?.classNames?.title
      ),
      description: cn(
        "text-xs leading-4 text-muted-foreground",
        toastOptions?.classNames?.description
      ),
      closeButton: cn(
        "absolute right-2 top-2 z-10 grid size-7 place-items-center rounded-full border border-white/10 bg-transparent text-muted-foreground opacity-0 transition-opacity",
        "group-hover:opacity-100 focus:opacity-100 hover:bg-white/5 hover:text-foreground",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--toast-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        toastOptions?.classNames?.closeButton
      ),
      actionButton: cn(
        "relative z-10 mt-0.5 inline-flex h-7 shrink-0 items-center rounded-md border border-white/10 bg-white/5 px-2 text-xs font-medium text-foreground",
        "transition-colors hover:bg-white/10",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--toast-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        toastOptions?.classNames?.actionButton
      ),
      cancelButton: cn(
        "relative z-10 mt-0.5 inline-flex h-7 shrink-0 items-center rounded-md border border-white/10 bg-transparent px-2 text-xs font-medium text-muted-foreground",
        "transition-colors hover:bg-white/5 hover:text-foreground",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--toast-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        toastOptions?.classNames?.cancelButton
      ),
      loader: cn(
        "relative z-10 text-[var(--toast-accent)]",
        toastOptions?.classNames?.loader
      ),
      default: cn(
        "[--toast-accent:var(--primary)]",
        toastOptions?.classNames?.default
      ),
      success: cn(
        "[--toast-accent:var(--primary)]",
        toastOptions?.classNames?.success
      ),
      info: cn("[--toast-accent:var(--primary)]", toastOptions?.classNames?.info),
      warning: cn(
        "[--toast-accent:var(--primary)]",
        toastOptions?.classNames?.warning
      ),
      loading: cn(
        "[--toast-accent:var(--primary)]",
        toastOptions?.classNames?.loading
      ),
      error: cn(
        "[--toast-accent:var(--destructive)]",
        toastOptions?.classNames?.error
      ),
    },
  };

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster"
      style={
        {
          "--width": "min(420px, calc(100vw - 2rem))",
          "--normal-bg": "var(--glass-bg)",
          "--normal-text": "var(--foreground)",
          "--normal-border": "var(--glass-border)",
          ...style,
        } as React.CSSProperties
      }
      icons={{
        success: <CheckCircle2 className="size-4" />,
        info: <Info className="size-4" />,
        warning: <AlertTriangle className="size-4" />,
        error: <XCircle className="size-4" />,
        loading: <Loader2 className="size-4 animate-spin" />,
        close: <X className="size-4" />,
        ...icons,
      }}
      toastOptions={mergedToastOptions}
      {...props}
    />
  );
};

export { Toaster };
