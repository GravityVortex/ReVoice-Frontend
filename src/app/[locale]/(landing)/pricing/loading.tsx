export default function Loading() {
  return (
    <div className="container py-16 md:py-20">
      <div className="animate-pulse space-y-8">
        {/* Header */}
        <div className="mx-auto flex flex-col items-center space-y-4 text-center">
          <div className="h-10 w-48 rounded-md bg-muted" />
          <div className="h-4 w-96 rounded bg-muted" />
        </div>

        {/* Group Switcher */}
        <div className="mx-auto flex w-full justify-center">
          <div className="h-12 w-64 rounded-lg bg-muted" />
        </div>

        {/* Payment Selector */}
        <div className="mx-auto flex w-full justify-center">
          <div className="h-12 w-80 rounded-xl bg-muted" />
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          <div className="h-96 rounded-xl bg-muted" />
          <div className="h-96 rounded-xl bg-muted" />
          <div className="h-96 rounded-xl bg-muted" />
        </div>
      </div>
    </div>
  );
}

