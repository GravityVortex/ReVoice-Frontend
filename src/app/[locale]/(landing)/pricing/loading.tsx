import { Skeleton } from '@/shared/components/ui/skeleton';

export default function Loading() {
  return (
    <div>
      {/* Pricing */}
      <section className="py-24 md:py-36">
        <div className="mx-auto mb-12 px-4 text-center md:px-8">
          <Skeleton className="mx-auto h-10 w-72 max-w-full" />
          <Skeleton className="mx-auto mt-4 h-4 w-[28rem] max-w-full" />
          <Skeleton className="mx-auto mt-2 h-4 w-[22rem] max-w-full" />
        </div>

        <div className="container">
          <div className="mx-auto mt-8 mb-8 flex w-full justify-center">
            <Skeleton className="h-12 w-[340px] max-w-full rounded-xl" />
          </div>

          <div className="mt-0 grid w-full gap-6 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div
                key={idx}
                className="flex h-full flex-col rounded-xl border border-white/10 bg-black/20 p-6 backdrop-blur-md"
              >
                <Skeleton className="h-4 w-24" />

                <div className="mt-4 flex items-baseline gap-2">
                  <Skeleton className="h-8 w-28" />
                  <Skeleton className="h-6 w-16" />
                </div>

                <div className="mt-4 space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                </div>

                <Skeleton className="mt-6 h-9 w-full" />

                <div className="mt-6 border-t border-dashed border-white/10" />

                <div className="mt-6 space-y-3">
                  <Skeleton className="h-4 w-40" />
                  {Array.from({ length: 4 }).map((__, fidx) => (
                    <div key={fidx} className="flex items-center gap-2">
                      <Skeleton className="size-3 rounded-sm" />
                      <Skeleton className="h-4 w-5/6" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-full px-4 md:max-w-3xl md:px-8">
          <div className="mx-auto max-w-2xl text-center text-balance">
            <Skeleton className="mx-auto h-10 w-64 max-w-full" />
            <Skeleton className="mx-auto mt-4 h-4 w-[28rem] max-w-full" />
            <Skeleton className="mx-auto mt-2 h-4 w-[22rem] max-w-full" />
          </div>

          <div className="mx-auto mt-12 max-w-full">
            <div className="w-full rounded-2xl border border-white/10 bg-black/20 p-1 backdrop-blur-md">
              {Array.from({ length: 5 }).map((_, qidx) => (
                <div
                  key={qidx}
                  className="bg-card/40 mx-1 my-1 rounded-xl px-7 py-4"
                >
                  <Skeleton className="h-4 w-5/6" />
                </div>
              ))}
            </div>

            <div className="mt-6 px-8">
              <Skeleton className="h-4 w-64 max-w-full" />
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-16 md:py-24">
        <div className="container">
          <div className="mx-auto max-w-2xl text-center text-balance">
            <Skeleton className="mx-auto h-10 w-72 max-w-full" />
            <Skeleton className="mx-auto mt-4 h-4 w-[28rem] max-w-full" />
            <Skeleton className="mx-auto mt-2 h-4 w-[22rem] max-w-full" />
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-px">
            {Array.from({ length: 6 }).map((_, tidx) => (
              <div
                key={tidx}
                className="bg-card/25 ring-foreground/[0.07] flex flex-col justify-end gap-6 rounded-(--radius) border border-transparent p-8 ring-1"
              >
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                  <Skeleton className="h-4 w-4/6" />
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <Skeleton className="size-9 rounded-lg" />
                  <div className="space-y-2">
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="h-3.5 w-32" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
