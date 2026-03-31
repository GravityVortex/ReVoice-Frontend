import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('SubtitleWorkstation merge finalization flow', () => {
  const source = readFileSync(new URL('./subtitle-workstation.tsx', import.meta.url), 'utf8');

  it('tracks stale and processing rows as dirty merge blockers', () => {
    expect(source).toContain('hasSubtitleWorkstationDirtyState({');
    expect(source).toContain('rowVoiceStates: subtitleItems.map((item) => deriveRowVoiceUiState(item)),');
    expect(source).toContain('pendingAppliedVoiceCount: Object.keys(pendingAppliedVoiceMap).length,');
  });

  it('prunes pending applied voice ids when the loaded subtitle ids change', () => {
    expect(source).toContain('for (const [id, updatedAtMs] of Object.entries(prev)) {');
    expect(source).toContain('return remapSubtitleIdRecordBySourceId(prev, previousItems, items);');
    expect(source).toContain('return remapSubtitleIdSetBySourceId(prev, previousItems, items);');
  });

  it('resets workstation-local rows when a different task is loaded instead of blindly merging by subtitle id', () => {
    expect(source).toContain('const localStateTaskIdRef = useRef<string | null>(null);');
    expect(source).toContain('const currentTaskId = convertObj.id;');
    expect(source).toContain('const shouldReuseLocalState = localStateTaskIdRef.current === currentTaskId;');
    expect(source).toContain('setSubtitleItems((prev) => (shouldReuseLocalState ? mergeLoadedSubtitleItems(prev, items) : items));');
    expect(source).toContain('if (!shouldReuseLocalState) {');
    expect(source).not.toContain('setSubtitleItems((prev) => mergeLoadedSubtitleItems(prev, items));');
  });

  it('scopes workstation async callbacks to the active task session so stale jobs cannot mutate the next task', () => {
    expect(source).toContain('const activeTaskIdRef = useRef<string | null>(null);');
    expect(source).toContain('activeTaskIdRef.current = convertObj?.id ?? null;');
    expect(source).toContain('const resumeKey = `${taskId}:${job.type}:${job.jobId}`;');
    expect(source).toContain('if (activeTaskIdRef.current !== taskId) return;');
    expect(source).toContain('if (activeTaskIdRef.current !== taskId) return false;');
  });

  it('binds delayed scroll-to-row callbacks to the current task session so stale timers cannot scroll the next task', () => {
    expect(source).toContain('const scrollToItemTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);');
    expect(source).toContain('const subtitleItemsRef = useRef<SubtitleRowData[]>([]);');
    expect(source).toContain('subtitleItemsRef.current = subtitleItems;');
    expect(source).toContain('if (scrollToItemTimerRef.current) {');
    expect(source).toContain('clearTimeout(scrollToItemTimerRef.current);');
    expect(source).toContain('const taskId = activeTaskIdRef.current;');
    expect(source).toContain('if (!taskId || activeTaskIdRef.current !== taskId) return;');
    expect(source).toContain('const idx = subtitleItemsRef.current.findIndex((itm) => itm.id === id);');
    expect(source).not.toContain('setSubtitleItems((items) => {');
  });

  it('cancels playback-follow RAF callbacks when rows or task sessions change so stale frames cannot yank the new list', () => {
    expect(source).toContain('const scrollIntoViewRafRef = useRef<number | null>(null);');
    expect(source).toContain('if (scrollIntoViewRafRef.current != null) {');
    expect(source).toContain('cancelAnimationFrame(scrollIntoViewRafRef.current);');
    expect(source).toContain('scrollIntoViewRafRef.current = requestAnimationFrame(() => {');
  });

  it('exposes prepareForVideoMerge and auto-applies audio_ready rows before final merge', () => {
    expect(source).toContain('const prepareForVideoMerge = async () => {');
    expect(source).toContain("const audioReadyItems = subtitleItems.filter((item) => deriveRowVoiceUiState(item) === 'audio_ready');");
    expect(source).toContain("const blockedItem = subtitleItems.find((item) => {");
    expect(source).toContain("return state === 'stale' || state === 'text_ready' || state === 'processing';");
    expect(source).toContain('const pendingSourceEntries = getPendingSourceSaveEntries(subtitleItems, pendingSourceSaveMap);');
    expect(source).toContain('const ok = await persistSourceTextNow(entry.sourceId, entry.text, entry.editedAtMs, false);');
    expect(source).toContain('focusPendingSourceSaveItem(entry.sourceId);');
    expect(source).toContain("const ok = await handleSave(item, 'translate_srt');");
    expect(source).toContain('useImperativeHandle(ref, () => ({');
    expect(source).toContain('onVideoSaveClick,');
    expect(source).toContain('prepareForVideoMerge,');
    expect(source).toContain('prepareForStructuralEdit,');
    expect(source).toContain('scrollToItem,');
  });

  it('treats the page as the single merge-status owner after merge starts', () => {
    expect(source).toContain('lastMergedAtMs?: number;');
    expect(source).toContain('setPendingAppliedVoiceMap((prev) => {');
    expect(source).toContain('onVideoMergeStarted?.({ jobId, createdAtMs: mergeTriggeredAtMs });');
    expect(source).not.toContain("toast.success(t('toast.videoSaveCompleted'))");
    expect(source).not.toContain('onVideoMergeCompleted?.({ mergedAtMs: mergeTriggeredAtMs });');
    expect(source).not.toContain('onVideoMergeFailed?.();');
  });

  it('tracks applied voice entries with timestamps so merge success only prunes older saves', () => {
    expect(source).toContain('const [pendingAppliedVoiceMap, setPendingAppliedVoiceMap] = useState<Record<string, number>>({});');
    expect(source).toContain('Object.entries(pendingAppliedVoiceMap).map(([id, updatedAtMs]) => ({ id, updatedAtMs }))');
    expect(source).toContain('if (ts > normalizedMergedAt) next[id] = ts;');
    expect(source).toContain('setPendingAppliedVoiceMap((prev) => ({ ...prev, [item.id]: savedAt }));');
  });

  it('pushes local source and translated text edits to the page owner immediately instead of waiting for autosave debounce', () => {
    expect(source).toContain('const applySubtitleItemUpdate = useCallback(');
    expect(source).toContain('onSubtitleTextChange?.(nextItem.id, nextItem.text_convert);');
    expect(source).toContain('const sourceId = resolveLinkedSourceId(nextItem);');
    expect(source).toContain('onSourceSubtitleTextChange?.(sourceId, nextItem.text_source);');
    expect(source).not.toContain('debouncedTextChange(itm.id, itm.text_convert);');
  });

  it('keeps source-only edits in the dirty state until autosave really succeeds', () => {
    expect(source).toContain('const [pendingSourceSaveMap, setPendingSourceSaveMap] = useState<Record<string, number>>({});');
    expect(source).toContain('pendingSourceSaveCount: Object.keys(pendingSourceSaveMap).length,');
    expect(source).toContain('if (prev[subtitleId] !== editedAtMs) return prev;');
  });

  it('only pushes publicly playable audio into the unified timeline while preserving row-level draft preview urls', () => {
    expect(source).toContain('const buildPublicAudioUrl = useCallback(');
    expect(source).toContain('const resolvedUrl = resolveEditorPublicAudioUrl({');
    expect(source).toContain("if (!resolvedUrl || !/^https?:\\/\\//i.test(resolvedUrl)) return '';");
    expect(source).toContain('onUpdateSubtitleAudioUrl(job.subtitleId, resolvedPublicAudioUrl, buildDraftPreviewUrl(resolvedData.path_name, newTime));');
    expect(source).toContain('onUpdateSubtitleAudioUrl(item.id, resolvedPublicAudioUrl, buildDraftPreviewUrl(resolvedData.path_name, newTime));');
    expect(source).toContain('onUpdateSubtitleAudioUrl(item.id, buildPublicAudioUrl(savedAudioPath, savedAt));');
  });

  it('exposes a dedicated structural-edit preparation hook that flushes pending source saves by sourceId', () => {
    expect(source).toContain("import { fetchWithTimeout, isAbortLikeError } from './runtime/network/fetch-with-timeout';");
    expect(source).toContain('const prepareForStructuralEdit = async () => {');
    expect(source).toContain("const blockedItem = subtitleItems.find((item) => {");
    expect(source).toContain("return state === 'processing' || state === 'audio_ready';");
    expect(source).toContain("toast.error(blockedState === 'processing' ? t('toast.mergeBlockedProcessing') : t('toast.mergeBlockedVoice'));");
    expect(source).toContain('const pendingSourceEntries = getPendingSourceSaveEntries(subtitleItems, pendingSourceSaveMap);');
    expect(source).toContain('const ok = await persistSourceTextNow(entry.sourceId, entry.text, entry.editedAtMs, false);');
    expect(source).toContain('const SOURCE_TEXT_SAVE_TIMEOUT_MS = 15_000;');
    expect(source).toContain("fetchWithTimeout('/api/video-task/auto-save-source-text', {");
    expect(source).toContain('timeoutMs: SOURCE_TEXT_SAVE_TIMEOUT_MS,');
    expect(source).toContain('const currentAbortController = sourceSaveAbortRef.current[subtitleId];');
    expect(source).toContain('currentAbortController?.abort();');
    expect(source).toContain('if (!silent && !isAbortLikeError(error)) {');
    expect(source).toContain('useImperativeHandle(ref, () => ({');
    expect(source).toContain('onVideoSaveClick,');
    expect(source).toContain('prepareForVideoMerge,');
    expect(source).toContain('prepareForStructuralEdit,');
    expect(source).toContain('scrollToItem,');
  });

  it('gives save/apply and generate-video requests finite timeouts so row saving and header merge states cannot hang forever on stalled networks', () => {
    expect(source).toContain('const WORKSTATION_REQUEST_TIMEOUT_MS = 15_000;');
    expect(source).toContain("const resp = await fetchWithTimeout('/api/video-task/update-subtitle-item', {");
    expect(source).toContain("const resp = await fetchWithTimeout('/api/video-task/generate-video', {");
    expect(source).toContain('timeoutMs: WORKSTATION_REQUEST_TIMEOUT_MS,');
  });

  it('lets failed resume polling jobs be resumed again after a transient fetch error', () => {
    expect(source).toContain('const resumeKey = `${taskId}:${job.type}:${job.jobId}`;');
    expect(source).toContain('resumedJobsRef.current.add(resumeKey);');
    expect(source).toContain('resumedJobsRef.current.delete(resumeKey);');
  });

  it('reruns tts prewarm/keepalive wiring for each task session instead of only the first mounted task', () => {
    expect(source).toContain('const ttsWarmupTaskIdRef = useRef<string | null>(null);');
    expect(source).toContain('if (ttsWarmupTaskIdRef.current === convertObj.id) return;');
    expect(source).toContain('ttsWarmupTaskIdRef.current = convertObj.id;');
    expect(source).not.toContain('const ttsWarmupStartedRef = useRef(false);');
  });

  it('routes the workstation refresh button through the injected detail reload callback instead of only rebuilding local rows', () => {
    expect(source).toContain("import type { VideoEditorBoundDetailReloadAction } from './video-editor-reload-contract';");
    expect(source).toContain('onReloadFromServer?: VideoEditorBoundDetailReloadAction;');
    expect(source).toContain('const result = await onReloadFromServer();');
    expect(source).toContain('onClick={() => void handleRefreshClick()}');
    expect(source).not.toContain('onClick={loadSrtFiles}');
  });

  it('exposes a preview-text commit handle so preview edits reuse the workstation owner chain', () => {
    expect(source).toContain('commitPreviewSubtitleText: (id: string, text: string) => boolean;');
    expect(source).toContain('const commitPreviewSubtitleText = useCallback(');
    expect(source).toContain('commitPreviewSubtitleText,');
  });
});
