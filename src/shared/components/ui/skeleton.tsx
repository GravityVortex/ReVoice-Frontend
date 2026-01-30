import { cn } from "@/shared/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        // Keep it neutral: match the site's dark-first UI, but still render in light mode.
        "animate-pulse rounded-md bg-black/5 dark:bg-white/10",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
