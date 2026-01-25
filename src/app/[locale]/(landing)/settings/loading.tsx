export default function Loading() {
  return (
    <div className="animate-pulse space-y-8">
      <div className="h-8 w-56 rounded-md bg-muted" />
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="h-4 w-24 rounded bg-muted" />
          <div className="h-32 rounded-xl bg-muted" />
        </div>
        <div className="space-y-4">
          <div className="h-12 rounded-lg bg-muted" />
          <div className="h-12 rounded-lg bg-muted" />
        </div>
      </div>
    </div>
  );
}

