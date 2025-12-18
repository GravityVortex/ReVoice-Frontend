'use client';

import { useRouter, usePathname } from 'next/navigation';
import { Tab } from '@/shared/types/blocks/common';

export function CreditsTabs({ tabs }: { tabs: Tab[] }) {
  const router = useRouter();
  const pathname = usePathname();

  const handleTabClick = (tabName: string | undefined) => {
    if (tabName === 'all') {
      router.push(pathname);
    } else {
      router.push(`${pathname}?type=${tabName}`);
    }
  };

  return (
    <div className="mb-6">
      <div className="flex gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.name}
            onClick={() => handleTabClick(tab.name)}
            className={`px-4 py-2 rounded-md text-sm font-medium ${
              tab.is_active
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {tab.title}
          </button>
        ))}
      </div>
    </div>
  );
}
