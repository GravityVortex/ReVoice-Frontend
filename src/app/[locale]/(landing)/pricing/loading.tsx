export default function Loading() {
  return (
    <div className="container py-16 md:py-20">
      <div className="animate-pulse space-y-8">
        <div className="h-10 w-48 rounded-md bg-muted" />
        <div className="grid gap-6 md:grid-cols-3">
          <div className="h-96 rounded-xl bg-muted" />
          <div className="h-96 rounded-xl bg-muted" />
          <div className="h-96 rounded-xl bg-muted" />
        </div>
      </div>
    </div>
  );
}

