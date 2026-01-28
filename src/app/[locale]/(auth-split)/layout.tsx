import { ReactNode } from 'react';

export default function AuthSplitLayout({ children }: { children: ReactNode }) {
    return (
        <div className="h-screen w-full bg-black text-white">
            {children}
        </div>
    );
}
