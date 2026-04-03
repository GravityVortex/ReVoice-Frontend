import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { getSubtitleSplitAvailability } from '../../video-editor-structural-edit';

describe('use video editor structural edit helpers', () => {
  const shellSource = readFileSync(new URL('../../video-editor-page-shell.tsx', import.meta.url), 'utf8');

  it('lets the page shell delegate structural-edit owner state to useVideoEditorStructuralEdit', () => {
    const hookSource = readFileSync(new URL('./use-video-editor-structural-edit.ts', import.meta.url), 'utf8');
    const timingSessionSource = readFileSync(new URL('../timing/use-video-editor-timing-session.ts', import.meta.url), 'utf8');

    expect(shellSource).toContain("import { useVideoEditorStructuralEdit } from './runtime/structural/use-video-editor-structural-edit';");
    expect(shellSource).toContain("import { useVideoEditorTimingSession } from './runtime/timing/use-video-editor-timing-session';");
    expect(shellSource).toContain('const timingSession = useVideoEditorTimingSession({');
    expect(shellSource).toContain('} = useVideoEditorStructuralEdit({');
    expect(shellSource).not.toContain('const [isSplittingSubtitle, setIsSplittingSubtitle] = useState(false);');
    expect(shellSource).not.toContain('const [isRollingBack, setIsRollingBack] = useState(false);');
    expect(shellSource).not.toContain('const [hasUndoableOps, setHasUndoableOps] = useState(false);');
    expect(shellSource).not.toContain('const [undoCountdown, setUndoCountdown] = useState(0);');
    expect(shellSource).not.toContain('const handleRollbackLatest = useCallback(() => {');
    expect(shellSource).not.toContain('const handleSubtitleSplit = useCallback(async () => {');
    expect(shellSource).not.toContain('const persistPendingTimingsIfNeeded = useCallback(async () => {');
    expect(shellSource).toContain('timingSession,');

    expect(hookSource).toContain('const [isSplittingSubtitle, setIsSplittingSubtitle] = useState(false);');
    expect(hookSource).toContain('const [isRollingBack, setIsRollingBack] = useState(false);');
    expect(hookSource).toContain('const [hasUndoableOps, setHasUndoableOps] = useState(false);');
    expect(hookSource).toContain('const [undoCountdown, setUndoCountdown] = useState(0);');
    expect(hookSource).not.toContain('const persistPendingTimingsIfNeeded = useCallback(async () => {');
    expect(hookSource).not.toContain('const autoSaveTimingRef = useRef<ReturnType<typeof setTimeout> | null>(null);');
    expect(hookSource).toContain('const handleRollbackLatest = useCallback(() => {');
    expect(hookSource).toContain('const handleSubtitleSplit = useCallback(async () => {');
    expect(hookSource).toContain('const structuralEditBlockReason = useMemo(');
    expect(timingSessionSource).toContain('const persistPendingTimingsIfNeeded = useCallback(');
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

    expect(hookSource).toContain('timingSession.actions.reconcilePendingTimingAfterRollback(back.data?.translate ?? []);');
    expect(hookSource).toContain('isGeneratingVideo,');
    expect(hookSource).toContain('const structuralEditReady = await prepareForStructuralEdit();');
    expect(hookSource).toContain("const timingPersistPromise = timingSession.actions.persistPendingTimingsIfNeeded({ reason: 'split' });");
    // High Fix #6: Updated to async call
    expect(hookSource).toContain('if (pausePlaybackBeforeSplit) await pausePlaybackBeforeSplit();');
    expect(hookSource).toContain('const splitClipId = timingSession.actions.remapSubtitleIdAfterTimingSave(splitAvailability.clip.id);');
    expect(hookSource).toContain('if (firstSplitChildId) {');
    expect(hookSource).toContain('setHasUndoableOps(true);');
    expect(hookSource).toContain('if (structuralEditBlockReason) {');
    expect(hookSource).toContain('clearActiveTimelineClip();');
  });

  it('moves timing persistence timeout and abort cleanup into the timing session so structural edits cannot hang forever on network stalls', () => {
    const hookSource = readFileSync(new URL('./use-video-editor-structural-edit.ts', import.meta.url), 'utf8');
    const timingSessionSource = readFileSync(new URL('../timing/use-video-editor-timing-session.ts', import.meta.url), 'utf8');

    expect(hookSource).toContain("import { fetchWithTimeout, isAbortLikeError } from '../network/fetch-with-timeout';");
    expect(hookSource).not.toContain('const TIMING_SAVE_TIMEOUT_MS = 15_000;');
    expect(hookSource).toContain('const STRUCTURAL_REQUEST_TIMEOUT_MS = 15_000;');
    expect(hookSource).toContain('const OPERATION_HISTORY_TIMEOUT_MS = 10_000;');
    expect(hookSource).not.toContain('const timingSaveAbortRef = useRef<AbortController | null>(null);');
    expect(timingSessionSource).toContain("import { fetchWithTimeout, isAbortLikeError } from '../network/fetch-with-timeout';");
    expect(timingSessionSource).toContain('const TIMING_SAVE_TIMEOUT_MS = 15_000;');
    expect(timingSessionSource).toContain('const timingSaveAbortRef = useRef<AbortController | null>(null);');
    expect(timingSessionSource).toContain('timingSaveAbortRef.current?.abort();');
    expect(timingSessionSource).toContain("const resp = await fetchWithTimeout('/api/video-task/update-subtitle-timings', {");
    expect(timingSessionSource).toContain('timeoutMs: TIMING_SAVE_TIMEOUT_MS,');
    expect(timingSessionSource).toContain('if (!options?.silent && !isAbortLikeError(error)) {');
  });

  it('scopes structural async callbacks to the active task session so stale split, rollback, and timing saves cannot mutate the next task', () => {
    const hookSource = readFileSync(new URL('./use-video-editor-structural-edit.ts', import.meta.url), 'utf8');
    const timingSessionSource = readFileSync(new URL('../timing/use-video-editor-timing-session.ts', import.meta.url), 'utf8');

    expect(hookSource).toContain('const activeTaskIdRef = useRef<string | null>(null);');
    expect(hookSource).toContain('activeTaskIdRef.current = convertId || null;');
    expect(hookSource).toContain('if (activeTaskIdRef.current !== taskId) return;');
    expect(timingSessionSource).toContain('if (activeTaskIdRef.current !== taskId) return false;');
  });

  it('resets transient split state immediately when switching tasks instead of waiting for the previous request to settle', () => {
    const hookSource = readFileSync(new URL('./use-video-editor-structural-edit.ts', import.meta.url), 'utf8');

    expect(hookSource).toContain('handleUndoCancel();');
    expect(hookSource).toContain('setIsSplittingSubtitle(false);');
    expect(hookSource).toContain('setIsRollingBack(false);');
    expect(hookSource).toContain('setHasUndoableOps(false);');
  });
});
