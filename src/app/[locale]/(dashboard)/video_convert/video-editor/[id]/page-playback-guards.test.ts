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
  const mergeHookSource = readFileSync(new URL('./runtime/merge/use-video-editor-merge.ts', import.meta.url), 'utf8');
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
  const playbackSessionOwnerSource = readFileSync(
    new URL('./runtime/playback/playback-session-owner.ts', import.meta.url),
    'utf8'
  );
  const playbackAuditionRuntimeSource = readFileSync(
    new URL('./runtime/playback/playback-audition-runtime.ts', import.meta.url),
    'utf8'
  );
  const structuralStateSource = readFileSync(new URL('./video-editor-structural-edit.ts', import.meta.url), 'utf8');

  it('feeds locally blocked rows back into the main playback gate', () => {
    expect(source).toContain("import { useVideoEditorDocument } from './runtime/document/use-video-editor-document';");
    expect(source).toContain("import { useVideoEditorPlayback } from './runtime/playback/use-video-editor-playback';");
    expect(documentHookSource).toContain('const [playbackBlockedVoiceIds, setPlaybackBlockedVoiceIds] = useState<string[]>([]);');
    expect(playbackHookSource).toContain('blockingVoiceIdSet: playbackBlockedVoiceIdSetRef.current');
    expect(source).toContain('onPlaybackBlockedVoiceIdsChange={handlePlaybackBlockedVoiceIdsChange}');
  });

  it('pauses media-backend playback when subtitle audio fails instead of silently looping retries', () => {
    expect(playbackHookSource).toContain('const pausePlaybackForMediaFailure = useCallback');
    expect(playbackTimeLoopSource).toContain('args.pausePlaybackForMediaFailure(currentSubtitleIndex, subtitle);');
  });

  it('retries network failures through the transport restart path when media mode or missing clip leaves no buffer-first recovery route', () => {
    expect(playbackHookSource).toContain("import { createPlaybackTransportOwner } from './playback-transport-owner';");
    expect(playbackHookSource).toContain('createPlaybackTransportOwner({');
    expect(playbackTransportOwnerSource).toContain("if (blockingState.kind === 'network_failed') {");
    expect(playbackTransportOwnerSource).toContain("if (args.refs.subtitleBackendRef.current === 'media' || !resolved) {");
    expect(playbackTransportOwnerSource).toContain('const retryContext = args.resolveRetryablePlaybackContext(');
    expect(playbackTransportOwnerSource).toContain("playReason: 'blocked-retry'");
    expect(playbackTransportOwnerSource).toContain("args.dispatchTransport(nextMode === 'timeline' ? playTimeline() : markAuditionReady())");
  });

  it('clears audition context when cancelling blocked playback', () => {
    expect(playbackTransportOwnerSource).toContain('const hadActiveAudition =');
    expect(playbackTransportOwnerSource).toContain('args.refs.auditionRestoreRef.current = null;');
    expect(playbackTransportOwnerSource).toContain('args.dispatchTransport(hadActiveAudition ? stopTransportAudition() : pauseTimeline())');
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
    expect(mergeHookSource).toContain('if (activeConvertIdRef.current !== taskId || !readyForMerge) return;');
    expect(mergeHookSource).toContain('const mergePrimaryAction = useMemo(');
    expect(headerSource).toContain('disabled={props.mergePrimaryAction.disabled}');
    expect(source).not.toContain('if (explicitMissingVoiceIdSet.size > 0) {');
  });

  it('unlocks the page when merge status polling returns a non-zero response', () => {
    expect(mergeStateSource).toContain('if (response?.code !== 0) {');
    expect(mergeStateSource).toContain("const message = response?.message || fallbackFailureMessage;");
    expect(mergeStateSource).toContain("taskStatus: 'failed'");
    expect(mergeStateSource).toContain('clearActiveJob: true');
    expect(mergeHookSource).toContain("if (resolution.toastKind === 'error' && resolution.toastMessage) {");
    expect(mergeHookSource).toContain('setServerActiveMergeJob(null);');
  });

  it('hydrates merge metadata only from metadata changes and pauses polling into a manual retry state after repeated network failures', () => {
    expect(mergeHookSource).toContain('const [mergeStatusRequiresManualRetry, setMergeStatusRequiresManualRetry] = useState(false);');
    expect(mergeHookSource).toContain('const mergeStatusPollFailureCountRef = useRef(0);');
    expect(mergeHookSource).toContain('const hydrated = hydrateVideoMergeMetadataState({');
    expect(mergeHookSource).toContain('if (!shouldPollActiveVideoMergeStatus(serverActiveMergeJob, mergeStatusRequiresManualRetry)) return;');
    expect(mergeHookSource).toContain('const nextPollState = getNextMergeStatusPollState(mergeStatusPollFailureCountRef.current);');
    expect(mergeHookSource).toContain('if (nextPollState.requiresManualRetry) {');
    expect(headerSource).toContain("props.mergePrimaryAction.mode === 'retry-status'");
    expect(headerSource).toContain(
      "onClick={props.mergePrimaryAction.mode === 'retry-status' ? props.onRetryMergeStatus : props.onGenerateVideo}"
    );
    expect(headerSource).toContain('disabled={props.mergePrimaryAction.disabled}');
    expect(workspaceSource).toContain('lastMergedAtMs={props.serverLastMergedAtMs}');
    expect(mergeHookSource).toContain('}, [convertId, convertMetadata, setServerLastMergedAtMs]);');
  });

  it('keeps the header busy progress shimmer aligned with active merge jobs', () => {
    expect(headerSource).toContain('{props.isTaskRunning || props.isMergeJobActive ? (');
  });

  it('reconciles merge terminal states back into the page-level task status owner', () => {
    expect(mergeStateSource).toContain("if (status === 'success') {");
    expect(mergeStateSource).toContain("taskStatus: 'completed'");
    expect(mergeStateSource).toContain("if (status === 'failed') {");
    expect(mergeStateSource).toContain("taskStatus: 'failed'");
    expect(mergeHookSource).toContain('applyTaskState(resolution.taskState);');
  });

  it('blocks structural edits during active video updates and reconciles pending timing after rollback restore', () => {
    expect(source).toContain("import { useVideoEditorStructuralEdit } from './runtime/structural/use-video-editor-structural-edit';");
    expect(source).toContain('persistPendingTimingsIfNeeded: persistPendingTimingsForMerge,');
    expect(structuralTimingBridgeSource).toContain('const persistPendingTimingsForMerge = useCallback(async () => {');
    expect(workstationBridgeSource).toContain(
      'const prepareForStructuralEdit = useCallback(async () => workstationRef.current?.prepareForStructuralEdit(), []);'
    );
    expect(structuralHookSource).toContain('const structuralEditBlockReason = useMemo(');
    expect(structuralHookSource).toContain('const structuralEditReady = await prepareForStructuralEdit();');
    expect(structuralHookSource).toContain("setPendingTimingMap((prev) => reconcilePendingTimingMap(prev, back.data?.translate ?? []));");
    expect(structuralHookSource).toContain("if (structuralEditBlockReason) {");
    expect(structuralHookSource).toContain('autoSaveTimingRef.current = setTimeout(async () => {');
    expect(structuralStateSource).toContain('export function getSubtitleSplitAvailability(args: {');
    expect(source).toContain('undoDisabled={undoDisabled}');
  });

  it('keeps locally applied voice pending state only for saves newer than the last successful merge baseline', () => {
    expect(documentHookSource).toContain('const [pendingVoiceEntries, setPendingVoiceEntries] = useState<Array<{ id: string; updatedAtMs: number }>>([]);');
    expect(documentHookSource).toContain("import { deriveDocumentPendingState } from './video-editor-document-selectors';");
    expect(documentHookSource).toContain('const documentPendingState = useMemo(');
    expect(documentSelectorSource).toContain('for (const entry of entries) {');
    expect(documentSelectorSource).toContain('if (!id || updatedAtMs <= args.serverLastMergedAtMs) continue;');
  });

  it('merges convertObj reloads back into the unified local timeline state instead of overwriting in-flight edits', () => {
    expect(documentHookSource).toContain(
      "import {\n  mapConvertObjToEditorDocument,\n  type VideoEditorDocumentTrackLabels,\n} from './video-editor-document-mappers';"
    );
    expect(documentHookSource).toContain('const mappedDocument = mapConvertObjToEditorDocument({');
    expect(documentHookSource).toContain('pendingTimingMap,');
    expect(documentHookSource).toContain('previousSubtitleTrack: subtitleTrackRef.current as EditorSubtitleTrackItem[],');
    expect(documentHookSource).toContain('previousSubtitleTrackOriginal: subtitleTrackOriginalRef.current as EditorSubtitleTrackItem[],');
    expect(documentHookSource).toContain('setSubtitleTrack(mappedDocument.subtitleTrack);');
    expect(documentHookSource).toContain('setSubtitleTrackOriginal(mappedDocument.subtitleTrackOriginal);');
    expect(documentMapperSource).toContain('mergeLoadedConvertedTrackItems(previousSubtitleTrack, mappedSubtitleTrack, { pendingTimingMap })');
    expect(documentMapperSource).toContain(
      'mergeLoadedSourceTrackItems(previousSubtitleTrackOriginal, mappedSubtitleTrackOriginal)'
    );
    expect(source).not.toContain("const nextArr = arr.map((row) => (row?.id === id ? { ...row, txt: text } : row));");
  });
});
