import { ReactNode } from 'react';
import { notFound } from 'next/navigation';

export default function SecurityLayout({ children }: { children: ReactNode }) {
  // Disabled until the security UX is truly implemented (password reset, account deletion, etc.).
  void children;
  notFound();
}

