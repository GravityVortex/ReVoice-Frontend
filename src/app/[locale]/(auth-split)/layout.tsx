import type { Metadata } from 'next';
import { ReactNode } from 'react';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AuthSplitLayout({ children }: { children: ReactNode }) {
    return (
        <div className="h-screen w-full bg-black text-white">
            {children}
        </div>
    );
}
