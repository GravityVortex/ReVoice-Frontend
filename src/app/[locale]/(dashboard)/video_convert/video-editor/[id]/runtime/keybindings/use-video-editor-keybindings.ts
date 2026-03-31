'use client';

import { useEffect } from 'react';

type UseVideoEditorKeybindingsArgs = {
  onUndo: () => void;
  onPlayPause: () => void;
};

function shouldIgnoreEditorKeybindingTarget(target: HTMLElement | null) {
  const tag = target?.tagName;
  if (!target) return false;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return true;
  return Boolean(
    target.closest(
      'button, a[href], summary, [role="button"], [role="dialog"], [role="menu"], [role="menuitem"], [data-slot="dialog-content"], [data-slot="dropdown-menu-content"], [data-slot="dropdown-menu-item"]'
    )
  );
}

export function useVideoEditorKeybindings(args: UseVideoEditorKeybindingsArgs) {
  const { onUndo, onPlayPause } = args;

  useEffect(() => {
    const handleEditorKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (shouldIgnoreEditorKeybindingTarget(target)) return;
      if ((e.metaKey || e.ctrlKey) && e.code === 'KeyZ' && !e.shiftKey) {
        e.preventDefault();
        onUndo();
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        onPlayPause();
      }
    };

    window.addEventListener('keydown', handleEditorKeyDown);
    return () => window.removeEventListener('keydown', handleEditorKeyDown);
  }, [onPlayPause, onUndo]);
}
