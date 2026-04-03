import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('VideoEditorPage playback guards', () => {
  const source = readFileSync(new URL('./video-editor-page-shell.tsx', import.meta.url), 'utf8');
  const headerSource = readFileSync(new URL('./video-editor-header.tsx', import.meta.url), 'utf8');
  const workspaceSource = readFileSync(new URL('./video-editor-workspace.tsx', import.meta.url), 'utf8');
  const workstationBridgeSource = readFileSync(
    new URL('./runtime/bridge/use-video-editor-workstation-bridge.ts', import.meta.url),
    'utf8'
  );
  const structuralTimingBridgeSource = readFileSync(
    new URL('./runtime/bridge/use-video-editor-structural-timing-bridge.ts', import.meta.url),
    'utf8'
  );
  const documentSelectorSource = readFileSync(
    new URL('./runtime/document/video-editor-document-selectors.ts', import.meta.url),
    'utf8'
  );
  const documentMapperSource = readFileSync(
    new URL('./runtime/document/video-editor-document-mappers.ts', import.meta.url),
    'utf8'
  );
  const documentHookSource = readFileSync(new URL('./runtime/document/use-video-editor-document.ts', import.meta.url), 'utf8');
  const documentReducerSource = readFileSync(new URL('./runtime/document/video-editor-document-reducer.ts', import.meta.url), 'utf8');
  const timingSessionSource = readFileSync(new URL('./runtime/timing/use-video-editor-timing-session.ts', import.meta.url), 'utf8');
  const timingPersistControllerSource = readFileSync(new URL('./runtime/timing/timing-persist-controller.ts', import.meta.url), 'utf8');
  const mergeHookSource = readFileSync(new URL('./runtime/merge/use-video-editor-merge.ts', import.meta.url), 'utf8');
  const pageGateSource = readFileSync(new URL('./runtime/orchestration/video-editor-page-gates.ts', import.meta.url), 'utf8');
  const mergeStateSource = readFileSync(new URL('./video-merge-state.ts', import.meta.url), 'utf8');
  const structuralHookSource = readFileSync(
    new URL('./runtime/structural/use-video-editor-structural-edit.ts', import.meta.url),
    'utf8'
  );
  const playbackHookSource = readFileSync(
    new URL('./runtime/playback/use-video-editor-playback.ts', import.meta.url),
    'utf8'
  );
  const playbackTimeLoopSource = readFileSync(
    new URL('./runtime/playback/playback-time-loop.ts', import.meta.url),
    'utf8'
  );
  const playbackSeekOwnerSource = readFileSync(
    new URL('./runtime/playback/playback-seek-owner.ts', import.meta.url),
    'utf8'
  );
  const playbackTransportOwnerSource = readFileSync(
    new URL('./runtime/playback/playback-transport-owner.ts', import.meta.url),
    'utf8'
  );
  const playbackBlockingOwnerSource = readFileSync(
    new URL('./runtime/playback/playback-blocking-owner.ts', import.meta.url),
    'utf8'
  );
  const playbackBlockingRetryControllerSource = readFileSync(
    new URL('./runtime/playback/playback-blocking-retry-controller.ts', import.meta.url),
    'utf8'
  );
  const playbackSessionOwnerSource = readFileSync(
    new URL('./runtime/playback/playback-session-owner.ts', import.meta.url),
    'utf8'
  );
  const playbackAuditionRuntimeSource = readFileSync(
    new URL('./runtime/playback/playback-audition-runtime.ts', import.meta.url),
    'utf8'
  );
  const structuralStateSource = readFileSync(new URL('./video-editor-structural-edit.ts', import.meta.url), 'utf8');
  const workspaceCapabilitySource = readFileSync(new URL('./video-editor-workspace-capabilities.ts', import.meta.url), 'utf8');
  const timelineSessionSource = readFileSync(new URL('./video-editor-timeline-session.ts', import.meta.url), 'utf8');

  it('feeds locally blocked rows back into the main playback gate', () => {
    expect(source).toContain("import { useVideoEditorDocument } from './runtime/document/use-video-editor-document';");
    expect(source).toContain("import { useVideoEditorPlayback } from './runtime/playback/use-video-editor-playback';");
    expect(documentHookSource).toContain(
      'const [state, dispatch] = useReducer(videoEditorDocumentReducer, undefined, createInitialVideoEditorDocumentState);'
    );
    expect(documentReducerSource).toContain("case 'set_playback_blocked_voice_ids':");
    expect(playbackHookSource).toContain('blockingVoiceIdSet: playbackBlockedVoiceIdSetRef.current');
    expect(source).toContain('workspaceCapabilities={workspaceCapabilities}');
    expect(workspaceCapabilitySource).toContain('onPlaybackBlockedVoiceIdsChange: (ids: string[]) => void;');
  });

  it('pauses media-backend playback when subtitle audio fails instead of silently looping retries', () => {
    expect(playbackHookSource).toContain('const pausePlaybackForMediaFailure = useCallback');
    expect(playbackTimeLoopSource).toContain('args.pausePlaybackForMediaFailure(currentSubtitleIndex, subtitle);');
  });

  it('retries network failures through the transport restart path when media mode or missing clip leaves no buffer-first recovery route', () => {
    expect(playbackHookSource).toContain("import { createPlaybackTransportOwner } from './playback-transport-owner';");
    expect(playbackHookSource).toContain("import { createPlaybackBlockingOwner } from './playback-blocking-owner';");
    expect(playbackHookSource).toContain('createPlaybackTransportOwner({');
    expect(playbackTransportOwnerSource).toContain("if (blockingState?.kind === 'network_failed') {");
    expect(playbackTransportOwnerSource).toContain('args.handleRetryBlockedPlayback();');
    expect(playbackBlockingRetryControllerSource).toContain("if (args.getSubtitleBackend() === 'media' || !resolved) {");
    expect(playbackBlockingRetryControllerSource).toContain('const retryContext = resolveRetryablePlaybackContext(');
    expect(playbackBlockingRetryControllerSource).toContain("playReason: 'blocked-retry'");
    expect(playbackBlockingRetryControllerSource).toContain(
      "args.dispatchTransport(nextMode === 'timeline' ? playTimeline() : markAuditionReady())"
    );
  });

  it('clears audition context when cancelling blocked playback', () => {
    expect(playbackBlockingOwnerSource).toContain('const hadActiveAudition =');
    expect(playbackBlockingOwnerSource).toContain('args.refs.auditionRestoreRef.current = null;');
    expect(playbackBlockingOwnerSource).toContain(
      'args.dispatchTransport(hadActiveAudition ? stopTransportAudition() : pauseTimeline())'
    );
  });

  it('cancels buffered audition ownership before timeline dragging takes over', () => {
    expect(playbackHookSource).toContain("import { createPlaybackSeekOwner } from './playback-seek-owner';");
    expect(playbackHookSource).toContain('createPlaybackSeekOwner({');
    expect(playbackSeekOwnerSource).toMatch(
      /if \(hadActiveAudition\) \{[\s\S]*?args\.refs\.auditionTokenRef\.current \+= 1;[\s\S]*?args\.refs\.handleAuditionStopRef\.current\(false\);[\s\S]*?\} else if \(args\.isPlaying \|\| \(videoEl && !videoEl\.paused\)\) \{/
    );
    expect(playbackSeekOwnerSource).toContain('if (wasDragging) {');
  });

  it('clears natural-end and drag RAF leftovers when playback owner resets or unmounts', () => {
    expect(playbackHookSource).toContain('const auditionNaturalStopTimerRef = useRef<number | null>(null);');
    expect(playbackHookSource).toContain('const activeConvertIdRef = useRef(convertId);');
    expect(playbackHookSource).toContain('usePlaybackSessionOwner({');
    expect(playbackSessionOwnerSource).toContain('args.refs.activeConvertIdRef.current = args.convertId;');
    expect(playbackAuditionRuntimeSource).toContain('args.handleAuditionStopRef.current = args.handleAuditionStop;');
    expect(playbackTimeLoopSource).toContain('refs.auditionNaturalStopTimerRef.current = window.setTimeout(() => {');
    expect(playbackTimeLoopSource).toContain('if (refs.activeConvertIdRef.current !== taskId) return;');
    expect(playbackSessionOwnerSource).toContain('if (args.refs.seekDragRafRef.current != null) {');
    expect(playbackSessionOwnerSource).toContain('cancelAnimationFrame(args.refs.seekDragRafRef.current);');
  });

  it('prepares workstation voice state before starting video merge and keeps the button available for unresolved dirty rows', () => {
    expect(workstationBridgeSource).toContain('const prepareForVideoMerge = useCallback(async () => workstationRef.current?.prepareForVideoMerge(), []);');
    expect(mergeHookSource).toContain('const readyForMerge = await prepareForVideoMerge();');
    expect(mergeHookSource).toContain('if (activeConvertIdRef.current !== taskId) return;');
    expect(mergeHookSource).toContain('if (!readyForMerge) {');
    expect(mergeHookSource).toContain("dispatchMerge({ type: 'generate_cancelled' });");
    expect(pageGateSource).toContain('getVideoMergePrimaryActionState({');
    expect(source).toContain('headerSession={headerSession}');
    expect(headerSource).toContain('disabled={props.headerSession.view.headerCapabilities.mergePrimaryAction.disabled}');
    expect(source).not.toContain('if (explicitMissingVoiceIdSet.size > 0) {');
  });

  it('unlocks the page when merge status polling returns a non-zero response', () => {
    expect(mergeStateSource).toContain('if (response?.code !== 0) {');
    expect(mergeStateSource).toContain("const message = response?.message || fallbackFailureMessage;");
    expect(mergeStateSource).toContain("taskStatus: 'failed'");
    expect(mergeStateSource).toContain('clearActiveJob: true');
    expect(mergeHookSource).toContain("if (resolution.toastKind === 'error' && resolution.toastMessage) {");
    expect(mergeHookSource).toContain("type: 'task_state_hydrated'");
  });

  it('hydrates merge metadata only from metadata changes and pauses polling into a manual retry state after repeated network failures', () => {
    expect(mergeHookSource).toContain("import { createInitialMergeSessionState, mergeSessionReducer } from './merge-session-owner';");
    expect(mergeHookSource).toContain('const [mergeState, dispatchMerge] = useReducer(');
    expect(mergeHookSource).toContain('const mergeStatusPollFailureCountRef = useRef(0);');
    expect(mergeHookSource).toContain('const hydrated = hydrateVideoMergeMetadataState({');
    expect(mergeHookSource).toContain('if (!shouldPollActiveVideoMergeStatus(serverActiveMergeJob, mergeStatusRequiresManualRetry)) return;');
    expect(mergeHookSource).toContain('const nextPollState = getNextMergeStatusPollState(mergeStatusPollFailureCountRef.current);');
    expect(mergeHookSource).toContain('if (nextPollState.requiresManualRetry) {');
    expect(pageGateSource).not.toContain('getHeaderDownloadState({');
    expect(source).toContain('getHeaderDownloadState({');
    expect(source).toContain('downloadGuardRef.current = downloadGuardState');
    expect(source).toContain('headerDownloadTooltipKey: pageGateState.header.downloadState.tooltipKey,');
    expect(headerSource).toContain("props.headerSession.view.headerCapabilities.mergePrimaryAction.mode === 'retry-status'");
    expect(headerSource).toContain(
      "onClick={props.headerSession.view.headerCapabilities.mergePrimaryAction.mode === 'retry-status' ? props.headerSession.actions.onRetryMergeStatus : props.headerSession.actions.onGenerateVideo}"
    );
    expect(headerSource).toContain('disabled={props.headerSession.view.headerCapabilities.mergePrimaryAction.disabled}');
    expect(workspaceSource).toContain('lastMergedAtMs={props.workspaceCapabilities.workstation.lastMergedAtMs}');
    expect(mergeHookSource).toContain('}, [convertId, convertMetadata, setServerLastMergedAtMs]);');
  });

  it('keeps the header busy progress shimmer aligned with active merge jobs', () => {
    expect(headerSource).toContain('{props.headerSession.view.isTaskRunning || props.headerSession.view.isMergeJobActive ? (');
  });

  it('reconciles merge terminal states back into the page-level task status owner', () => {
    expect(mergeStateSource).toContain("if (status === 'success') {");
    expect(mergeStateSource).toContain("taskStatus: 'completed'");
    expect(mergeStateSource).toContain("if (status === 'failed') {");
    expect(mergeStateSource).toContain("taskStatus: 'failed'");
    expect(mergeHookSource).toContain('taskStatus: resolution.taskState.taskStatus,');
    expect(mergeHookSource).toContain('taskErrorMessage: resolution.taskState.taskErrorMessage,');
  });

  it('blocks structural edits during active video updates and reconciles pending timing after rollback restore', () => {
    expect(source).toContain("import { useVideoEditorStructuralEdit } from './runtime/structural/use-video-editor-structural-edit';");
    expect(source).toContain("import { useVideoEditorTimingSession } from './runtime/timing/use-video-editor-timing-session';");
    expect(source).toContain('persistPendingTimingsIfNeeded: persistPendingTimingsForMerge,');
    expect(structuralTimingBridgeSource).toContain('const persistPendingTimingsForMerge = useCallback(async () => {');
    expect(workstationBridgeSource).toContain(
      'const prepareForStructuralEdit = useCallback(async () => workstationRef.current?.prepareForStructuralEdit(), []);'
    );
    expect(structuralHookSource).toContain('const structuralEditBlockReason = useMemo(');
    expect(structuralHookSource).toContain('const structuralEditReady = await prepareForStructuralEdit();');
    expect(structuralHookSource).toContain('timingSession.actions.reconcilePendingTimingAfterRollback(back.data?.translate ?? []);');
    expect(structuralHookSource).toContain("if (structuralEditBlockReason) {");
    expect(structuralHookSource).not.toContain('autoSaveTimingRef.current = setTimeout(async () => {');
    expect(timingSessionSource).toContain('autoSaveTimingRef.current = setTimeout(async () => {');
    expect(timingPersistControllerSource).toContain('export function resolveTimingPersistSuccess');
    expect(timingPersistControllerSource).toContain('export function reconcileTimingAfterRollback');
    expect(structuralStateSource).toContain('export function getSubtitleSplitAvailability(args: {');
    expect(source).toContain('timelineSession={timelineSession}');
    expect(timelineSessionSource).toContain('structuralCapabilities: VideoEditorStructuralCapabilities;');
  });

  it('keeps locally applied voice pending state only for saves newer than the last successful merge baseline', () => {
    expect(documentReducerSource).toContain("case 'set_pending_voice_entries':");
    expect(documentHookSource).toContain("import { deriveDocumentPendingState } from './video-editor-document-selectors';");
    expect(documentHookSource).toContain('const documentPendingState = useMemo(');
    expect(documentSelectorSource).toContain('for (const entry of entries) {');
    expect(documentSelectorSource).toContain('if (!id || updatedAtMs <= args.serverLastMergedAtMs) continue;');
  });

  it('merges convertObj reloads back into the unified local timeline state instead of overwriting in-flight edits', () => {
    expect(documentHookSource).toContain(
      "import {\n  createInitialVideoEditorDocumentState,\n  videoEditorDocumentReducer,\n} from './video-editor-document-reducer';"
    );
    expect(documentReducerSource).toContain('const mappedDocument = mapConvertObjToEditorDocument({');
    expect(documentReducerSource).toContain('pendingTimingMap: nextPendingTimingMap,');
    expect(documentReducerSource).toContain('previousSubtitleTrack: state.subtitleTrack as EditorSubtitleTrackItem[],');
    expect(documentReducerSource).toContain(
      'previousSubtitleTrackOriginal: state.subtitleTrackOriginal as EditorSubtitleTrackItem[],'
    );
    expect(documentMapperSource).toContain('mergeLoadedConvertedTrackItems(previousSubtitleTrack, mappedSubtitleTrack, { pendingTimingMap })');
    expect(documentMapperSource).toContain(
      'mergeLoadedSourceTrackItems(previousSubtitleTrackOriginal, mappedSubtitleTrackOriginal)'
    );
    expect(source).not.toContain("const nextArr = arr.map((row) => (row?.id === id ? { ...row, txt: text } : row));");
  });
});
