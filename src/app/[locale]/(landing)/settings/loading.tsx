export default function Loading() {
  return (
    <div className="container py-16 md:py-20">
      <div className="animate-pulse space-y-8">
        <div className="h-8 w-56 rounded-md bg-muted" />
        <div className="flex gap-8">
          <div className="hidden w-64 flex-shrink-0 space-y-3 md:block">
            <div className="h-10 rounded-md bg-muted" />
            <div className="h-10 rounded-md bg-muted" />
            <div className="h-10 rounded-md bg-muted" />
            <div className="h-10 rounded-md bg-muted" />
          </div>
          <div className="min-w-0 flex-1 space-y-4">
            <div className="h-32 rounded-xl bg-muted" />
            <div className="h-64 rounded-xl bg-muted" />
          </div>
        </div>
      </div>
    </div>
  );
}

