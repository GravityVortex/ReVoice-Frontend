'use client';

import { useEffect, useRef, useCallback, useState } from 'react';

/**
 * Prevents accidental navigation away from a page with unsaved changes.
 *
 * Covers three layers:
 * 1. `beforeunload` — browser refresh / close / address-bar navigation
 * 2. `history.pushState` monkey-patch — Next.js App Router SPA navigations (Link, router.push)
 * 3. `popstate` — browser back/forward buttons
 */
export function useUnsavedChangesGuard(enabled: boolean) {
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const pendingNavRef = useRef<{ args: Parameters<typeof history.pushState> } | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  // Stable reference to the original pushState (captured once).
  const originalPushStateRef = useRef<typeof history.pushState | null>(null);

  useEffect(() => {
    if (!enabled) return;

    // --- Layer 1: beforeunload ---
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!enabledRef.current) return;
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    // --- Layer 2: history.pushState monkey-patch ---
    if (!originalPushStateRef.current) {
      originalPushStateRef.current = history.pushState.bind(history);
    }
    const origPush = originalPushStateRef.current!;

    history.pushState = function (...args: Parameters<typeof history.pushState>) {
      if (!enabledRef.current) {
        origPush(...args);
        return;
      }
      pendingNavRef.current = { args };
      setShowLeaveDialog(true);
    };

    // --- Layer 3: popstate (browser back/forward) ---
    const handlePopState = () => {
      if (!enabledRef.current) return;
      // Push a dummy state to "cancel" the back navigation, then show dialog.
      origPush(null, '', window.location.href);
      pendingNavRef.current = null;
      setShowLeaveDialog(true);
    };
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
      // Restore original pushState only if we're the one who patched it.
      if (history.pushState !== origPush) {
        history.pushState = origPush;
      }
    };
  }, [enabled]);

  const confirmLeave = useCallback(() => {
    setShowLeaveDialog(false);
    enabledRef.current = false;
    const orig = originalPushStateRef.current ?? history.pushState.bind(history);
    const pending = pendingNavRef.current;
    pendingNavRef.current = null;

    if (pending) {
      orig(...pending.args);
      // Trigger the popstate so Next.js router picks up the URL change.
      window.dispatchEvent(new PopStateEvent('popstate'));
    } else {
      // popstate-triggered (browser back) — just go back.
      history.back();
    }
  }, []);

  const cancelLeave = useCallback(() => {
    setShowLeaveDialog(false);
    pendingNavRef.current = null;
  }, []);

  return { showLeaveDialog, setShowLeaveDialog, confirmLeave, cancelLeave };
}
