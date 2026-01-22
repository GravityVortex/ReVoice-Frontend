'use client';

import { useEffect, useRef } from 'react';
import { useAppContext } from '@/shared/contexts/app';

export function SocialCreditsHandler() {
  // Avoid another /api/auth/get-session subscription; AppContextProvider already owns it.
  const { user } = useAppContext();
  const hasGranted = useRef(false);

  useEffect(() => {
    if (user && !hasGranted.current) {
      hasGranted.current = true;
      fetch('/api/user/signup-social-credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).catch((error) => {
        console.error('Failed to grant credits:', error);
      });
    }
  }, [user]);

  return null;
}
