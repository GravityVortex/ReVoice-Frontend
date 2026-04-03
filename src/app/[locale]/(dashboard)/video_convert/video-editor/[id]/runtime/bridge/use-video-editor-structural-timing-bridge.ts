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
    if (!persistPendingTimingsRef.current) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[StructuralTimingBridge] persistPendingTimingsForMerge called but no handler registered');
      }
      return false;
    }
    return await persistPendingTimingsRef.current();
  }, []);

  return {
    syncStructuralPersistPendingTimings,
    persistPendingTimingsForMerge,
  };
}
