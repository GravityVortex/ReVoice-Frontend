'use client';

import { useEffect, useRef } from 'react';
import { useSession } from '@/core/auth/client';

export function SocialCreditsHandler() {
  const { data: session } = useSession();
  const hasGranted = useRef(false);

  useEffect(() => {
    if (session?.user && !hasGranted.current) {
      hasGranted.current = true;
      fetch('/api/user/signup-social-credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).catch((error) => {
        console.error('Failed to grant credits:', error);
      });
    }
  }, [session]);

  return null;
}
