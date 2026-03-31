import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { getSubtitleSplitAvailability } from '../../video-editor-structural-edit';

describe('use video editor structural edit helpers', () => {
  const shellSource = readFileSync(new URL('../../video-editor-page-shell.tsx', import.meta.url), 'utf8');

  it('lets the page shell delegate structural-edit owner state to useVideoEditorStructuralEdit', () => {
    const hookSource = readFileSync(new URL('./use-video-editor-structural-edit.ts', import.meta.url), 'utf8');

    expect(shellSource).toContain("import { useVideoEditorStructuralEdit } from './runtime/structural/use-video-editor-structural-edit';");
    expect(shellSource).toContain('} = useVideoEditorStructuralEdit({');
    expect(shellSource).not.toContain('const [isSplittingSubtitle, setIsSplittingSubtitle] = useState(false);');
    expect(shellSource).not.toContain('const [isRollingBack, setIsRollingBack] = useState(false);');
    expect(shellSource).not.toContain('const [hasUndoableOps, setHasUndoableOps] = useState(false);');
    expect(shellSource).not.toContain('const [undoCountdown, setUndoCountdown] = useState(0);');
    expect(shellSource).not.toContain('const handleRollbackLatest = useCallback(() => {');
    expect(shellSource).not.toContain('const handleSubtitleSplit = useCallback(async () => {');
    expect(shellSource).not.toContain('const persistPendingTimingsIfNeeded = useCallback(async () => {');

    expect(hookSource).toContain('const [isSplittingSubtitle, setIsSplittingSubtitle] = useState(false);');
    expect(hookSource).toContain('const [isRollingBack, setIsRollingBack] = useState(false);');
    expect(hookSource).toContain('const [hasUndoableOps, setHasUndoableOps] = useState(false);');
    expect(hookSource).toContain('const [undoCountdown, setUndoCountdown] = useState(0);');
    expect(hookSource).toContain('const persistPendingTimingsIfNeeded = useCallback(async () => {');
    expect(hookSource).toContain('const handleRollbackLatest = useCallback(() => {');
    expect(hookSource).toContain('const handleSubtitleSplit = useCallback(async () => {');
    expect(hookSource).toContain('const structuralEditBlockReason = useMemo(');
  });

  it('derives split availability from the current transport time and keeps the 200ms safety window', () => {
    expect(
      getSubtitleSplitAvailability({
        currentTimeSec: 3,
        subtitleTrack: [
          {
            id: 'clip-1',
            startTime: 1,
            duration: 4,
            type: 'audio',
            name: 'clip-1',
            text: 'hello',
          },
        ],
      })
    ).toMatchObject({
      canSplit: true,
      splitAtMs: 3000,
      clip: {
        id: 'clip-1',
      },
    });

    expect(
      getSubtitleSplitAvailability({
        currentTimeSec: 1.1,
        subtitleTrack: [
          {
            id: 'clip-1',
            startTime: 1,
            duration: 4,
            type: 'audio',
            name: 'clip-1',
            text: 'hello',
          },
        ],
      })
    ).toMatchObject({
      canSplit: false,
      reason: 'too-close',
    });
  });

  it('keeps rollback reconciliation and split side effects inside the structural-edit owner', () => {
    const hookSource = readFileSync(new URL('./use-video-editor-structural-edit.ts', import.meta.url), 'utf8');

    expect(hookSource).toContain('setPendingTimingMap((prev) => reconcilePendingTimingMap(prev, back.data?.translate ?? []));');
    expect(hookSource).toContain('const structuralEditReady = await prepareForStructuralEdit();');
    expect(hookSource).toContain('const okTiming = await persistPendingTimingsIfNeeded();');
    expect(hookSource).toContain('if (pausePlaybackBeforeSplit) pausePlaybackBeforeSplit();');
    expect(hookSource).toContain('if (firstSplitChildId) {');
    expect(hookSource).toContain('setHasUndoableOps(true);');
    expect(hookSource).toContain('if (structuralEditBlockReason) {');
    expect(hookSource).toContain('clearActiveTimelineClip();');
  });

  it('gives timing persistence a finite timeout and abort cleanup so structural edits cannot hang forever on network stalls', () => {
    const hookSource = readFileSync(new URL('./use-video-editor-structural-edit.ts', import.meta.url), 'utf8');

    expect(hookSource).toContain("import { fetchWithTimeout, isAbortLikeError } from '../network/fetch-with-timeout';");
    expect(hookSource).toContain('const TIMING_SAVE_TIMEOUT_MS = 15_000;');
    expect(hookSource).toContain('const STRUCTURAL_REQUEST_TIMEOUT_MS = 15_000;');
    expect(hookSource).toContain('const OPERATION_HISTORY_TIMEOUT_MS = 10_000;');
    expect(hookSource).toContain('const timingSaveAbortRef = useRef<AbortController | null>(null);');
    expect(hookSource).toContain('timingSaveAbortRef.current?.abort();');
    expect(hookSource).toContain("const resp = await fetchWithTimeout('/api/video-task/update-subtitle-timings', {");
    expect(hookSource).toContain('timeoutMs: TIMING_SAVE_TIMEOUT_MS,');
    expect(hookSource).toContain("const resp = await fetchWithTimeout('/api/video-task/rollback-operation', {");
    expect(hookSource).toContain("const resp = await fetchWithTimeout('/api/video-task/split-subtitle', {");
    expect(hookSource).toContain("const resp = await fetchWithTimeout(`/api/video-task/operation-history?taskId=${convertId}`, {");
    expect(hookSource).toContain('timeoutMs: STRUCTURAL_REQUEST_TIMEOUT_MS,');
    expect(hookSource).toContain('timeoutMs: OPERATION_HISTORY_TIMEOUT_MS,');
    expect(hookSource).toContain('if (!options?.silent && !isAbortLikeError(error)) {');
  });

  it('scopes structural async callbacks to the active task session so stale split, rollback, and timing saves cannot mutate the next task', () => {
    const hookSource = readFileSync(new URL('./use-video-editor-structural-edit.ts', import.meta.url), 'utf8');

    expect(hookSource).toContain('const activeTaskIdRef = useRef<string | null>(null);');
    expect(hookSource).toContain('activeTaskIdRef.current = convertId || null;');
    expect(hookSource).toContain('if (activeTaskIdRef.current !== taskId) return;');
    expect(hookSource).toContain('if (activeTaskIdRef.current !== taskId) return false;');
  });

  it('resets transient split state immediately when switching tasks instead of waiting for the previous request to settle', () => {
    const hookSource = readFileSync(new URL('./use-video-editor-structural-edit.ts', import.meta.url), 'utf8');

    expect(hookSource).toContain('handleUndoCancel();');
    expect(hookSource).toContain('setIsSplittingSubtitle(false);');
    expect(hookSource).toContain('setIsRollingBack(false);');
    expect(hookSource).toContain('setHasUndoableOps(false);');
  });
});
