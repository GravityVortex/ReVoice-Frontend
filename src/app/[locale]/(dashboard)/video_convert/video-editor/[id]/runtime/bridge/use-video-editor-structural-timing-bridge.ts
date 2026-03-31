'use client';

import { useCallback, useEffect, useRef } from 'react';

export function useVideoEditorStructuralTimingBridge() {
  const persistPendingTimingsRef = useRef<(() => Promise<boolean>) | null>(null);

  const syncStructuralPersistPendingTimings = useCallback((handler?: () => Promise<boolean>) => {
    persistPendingTimingsRef.current = handler ?? null;
  }, []);

  useEffect(() => {
    return () => {
      persistPendingTimingsRef.current = null;
    };
  }, []);

  const persistPendingTimingsForMerge = useCallback(async () => {
    return (await persistPendingTimingsRef.current?.()) ?? true;
  }, []);

  return {
    syncStructuralPersistPendingTimings,
    persistPendingTimingsForMerge,
  };
}
