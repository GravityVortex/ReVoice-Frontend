import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('use video editor structural timing bridge shell boundary', () => {
  const shellSource = readFileSync(new URL('../../video-editor-page-shell.tsx', import.meta.url), 'utf8');

  it('lets the page shell delegate pending timing bridge actions to useVideoEditorStructuralTimingBridge', () => {
    const hookSource = readFileSync(new URL('./use-video-editor-structural-timing-bridge.ts', import.meta.url), 'utf8');

    expect(shellSource).toContain(
      "import { useVideoEditorStructuralTimingBridge } from './runtime/bridge/use-video-editor-structural-timing-bridge';"
    );
    expect(shellSource).toContain('useLayoutEffect(() => {');
    expect(shellSource).toContain('persistPendingTimingsIfNeeded: persistPendingTimingsForMerge,');
    expect(shellSource).toContain('syncStructuralPersistPendingTimings(persistPendingTimingsIfNeeded);');
    expect(shellSource).not.toContain(
      'const structuralEditActionBridgeRef = useRef<{ persistPendingTimingsIfNeeded: () => Promise<boolean> } | null>(null);'
    );
    expect(shellSource).not.toContain('const structuralEditPersistPendingTimings = useCallback(async () => {');
    expect(shellSource).not.toContain('structuralEditActionBridgeRef.current = {');

    expect(hookSource).toContain(
      'const persistPendingTimingsRef = useRef<(() => Promise<boolean>) | null>(null);'
    );
    expect(hookSource).toContain('const syncStructuralPersistPendingTimings = useCallback((handler?: () => Promise<boolean>) => {');
    expect(hookSource).toContain('const persistPendingTimingsForMerge = useCallback(async () => {');
    expect(hookSource).toContain('persistPendingTimingsRef.current = handler ?? null;');
  });

  it('exposes the timing bridge api consumed by merge while structural owns the implementation', () => {
    const hookSource = readFileSync(new URL('./use-video-editor-structural-timing-bridge.ts', import.meta.url), 'utf8');

    expect(hookSource).toContain('syncStructuralPersistPendingTimings,');
    expect(hookSource).toContain('persistPendingTimingsForMerge,');
  });
});
