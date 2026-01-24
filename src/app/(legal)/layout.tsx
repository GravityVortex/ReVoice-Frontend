import { ReactNode } from 'react';
import Link from 'next/link';

import '@/config/style/docs.css';

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <main className="py-24 md:py-32">
      <div className="mx-auto w-full max-w-4xl px-6 md:px-8">
        <div className="mb-8">
          <Link
            href="/"
            className="text-muted-foreground hover:text-primary text-sm underline"
          >
            SoulDub.ai
          </Link>
        </div>

        <div className="ring-foreground/5 rounded-3xl border border-transparent px-4 shadow ring-1 md:px-8">
          <article className="docs text-foreground text-md my-8 space-y-4 font-normal *:leading-relaxed">
            {children}
          </article>
        </div>
      </div>
    </main>
  );
}

