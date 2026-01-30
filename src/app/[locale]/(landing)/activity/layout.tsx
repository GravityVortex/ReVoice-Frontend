import { ReactNode } from 'react';
import { notFound } from 'next/navigation';

export default function ActivityLayout({ children }: { children: ReactNode }) {
  // Activity is not part of the public product UX. Keep it fully disabled until it is
  // intentionally reintroduced (navigation + permissions + product surface).
  void children;
  notFound();
}

