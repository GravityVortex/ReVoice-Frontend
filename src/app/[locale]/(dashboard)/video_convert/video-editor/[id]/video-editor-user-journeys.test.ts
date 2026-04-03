import { describe, expect, it } from 'vitest';

import type { ConvertObj } from '@/shared/components/video-editor/types';
import { deriveSubtitleVoiceUiState } from '@/shared/lib/subtitle-voice-state';
import { splitSubtitlePayload } from '@/shared/lib/timeline/split';

import { resolveSourceAuditionAudio } from './audio-source-resolver';
import { getHeaderDownloadState } from './header-download-actions';
import { evaluateClipConvertAuditionAvailability, evaluateClipVoiceAvailability } from './playback-gate';
import {
  createVideoEditorBootstrapState,
  resolveVideoEditorBootstrapFailure,
  resolveVideoEditorBootstrapSuccess,
  selectVisibleVideoEditorBootstrapState,
  startVideoEditorBootstrapRequest,
} from './runtime/bootstrap/video-editor-bootstrap-state';
import { mapConvertObjToEditorDocument } from './runtime/document/video-editor-document-mappers';
import { deriveDocumentPendingState } from './runtime/document/video-editor-document-selectors';
import {
  getStructuralEditBlockReason,
  getSubtitleSplitAvailability,
  remapSubtitleIdAfterTimingSave,
  reconcilePendingTimingAfterPersist,
  reconcilePendingTimingMap,
} from './video-editor-structural-edit';
import {
  getNextMergeStatusPollState,
  getVideoMergePrimaryActionState,
  hydrateVideoMergeMetadataState,
  resolveVideoMergeStatusResponse,
  shouldPollActiveVideoMergeStatus,
} from './video-merge-state';

function makeSourceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '10000001_00-00-05-200_00-00-07-257',
    seq: '1',
    start: '00:00:05,200',
    end: '00:00:07,257',
    txt: 'source line',
    audio_url: 'split_audio/audio/source-1.wav',
    ...overrides,
  };
}

function makeConvertRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '20000001_00-00-05-200_00-00-07-257',
    seq: '1',
    start: '00:00:05,200',
    end: '00:00:07,257',
    txt: 'server line',
    audio_url: '',
    vap_draft_txt: 'server line',
    vap_draft_audio_path: '',
    vap_tts_updated_at_ms: undefined,
    vap_voice_status: 'ready',
    vap_needs_tts: false,
    ...overrides,
  };
}

function makeConvertObj(overrides: Partial<ConvertObj> = {}) {
  return {
    id: 'task-1',
    userId: 'user-1',
    originalFileId: 'file-1',
    status: 'completed',
    priority: 'normal',
    progress: '100',
    currentStep: '',
    sourceLanguage: 'en',
    targetLanguage: 'zh',
    speakerCount: '1',
    processDurationSeconds: 12,
    startedAt: '',
    completedAt: '',
    metadata: '',
    noSoundVideoUrl: 'https://cdn.example.com/video.mp4',
    backgroundAudioUrl: '',
    vocalAudioUrl: '',
    r2preUrl: 'https://cdn.example.com',
    env: 'prod',
    srt_source_arr: [makeSourceRow()],
    srt_convert_arr: [makeConvertRow()],
    srt_double_arr: [],
    ...overrides,
  } satisfies ConvertObj;
}

describe('video editor user journeys', () => {
  it('进入页面时已有草稿配音，页面 owner 应直接恢复可试听状态', () => {
    const convertObj = makeConvertObj({
      srt_convert_arr: [
        makeConvertRow({
          vap_draft_txt: 'draft line',
          vap_draft_audio_path: 'adj_audio_time_temp/clip-1.wav',
          vap_tts_updated_at_ms: 456,
        }),
      ],
    });

    const document = mapConvertObjToEditorDocument({ convertObj });
    const pendingState = deriveDocumentPendingState({
      pendingVoiceEntries: [],
      pendingTimingMap: {},
      playbackBlockedVoiceIds: [],
      convertRows: convertObj.srt_convert_arr,
      workstationDirty: false,
      serverLastMergedAtMs: 0,
    });
    const gate = evaluateClipConvertAuditionAvailability({
      clipId: '20000001_00-00-05-200_00-00-07-257',
      row: convertObj.srt_convert_arr[0],
      audioUrl: document.subtitleTrack[0]?.previewAudioUrl || '',
      pendingVoiceIdSet: pendingState.pendingVoiceIdSet,
      explicitMissingVoiceIdSet: pendingState.explicitMissingVoiceIdSet,
    });

    expect(document.subtitleTrack[0]?.audioUrl).toBe(
      'https://cdn.example.com/prod/user-1/task-1/adj_audio_time_temp/clip-1.wav?t=456'
    );
    expect(document.subtitleTrack[0]?.previewAudioUrl).toBe(
      'https://cdn.example.com/prod/user-1/task-1/adj_audio_time_temp/clip-1.wav?t=456'
    );
    expect(gate).toEqual({ kind: 'ready' });
    expect(pendingState.pendingMergeCount).toBe(0);
  });

  it('重翻译文本后，必须重新配音且试听入口应被明确阻断', () => {
    const convertObj = makeConvertObj({
      srt_convert_arr: [
        makeConvertRow({
          txt: 'old line',
          vap_draft_txt: 'new line',
          audio_url: 'https://cdn.example.com/prod/user-1/task-1/adj_audio_time/clip-2.wav',
          vap_voice_status: 'missing',
          vap_needs_tts: true,
        }),
      ],
    });

    const document = mapConvertObjToEditorDocument({ convertObj });
    const pendingState = deriveDocumentPendingState({
      pendingVoiceEntries: [],
      pendingTimingMap: {},
      playbackBlockedVoiceIds: [],
      convertRows: convertObj.srt_convert_arr,
      workstationDirty: false,
      serverLastMergedAtMs: 0,
    });
    const voiceUiState = deriveSubtitleVoiceUiState({
      persistedText: 'old line',
      effectiveText: 'new line',
      persistedAudioPath: 'https://cdn.example.com/prod/user-1/task-1/adj_audio_time/clip-2.wav',
      voiceStatus: 'missing',
      needsTts: true,
    });
    const gate = evaluateClipConvertAuditionAvailability({
      clipId: '20000001_00-00-05-200_00-00-07-257',
      row: convertObj.srt_convert_arr[0],
      audioUrl: document.subtitleTrack[0]?.previewAudioUrl || '',
      pendingVoiceIdSet: pendingState.pendingVoiceIdSet,
      explicitMissingVoiceIdSet: pendingState.explicitMissingVoiceIdSet,
    });

    expect(voiceUiState).toBe('text_ready');
    expect(document.subtitleTrack[0]?.audioUrl).toBe('');
    expect(pendingState.explicitMissingVoiceIdSet.has('20000001_00-00-05-200_00-00-07-257')).toBe(true);
    expect(gate).toEqual({
      kind: 'voice_unavailable',
      clipIndex: -1,
      subtitleId: '20000001_00-00-05-200_00-00-07-257',
      reason: 'needs_regen',
    });
  });

  it('重新生成配音成功但未保存时，工作台可试听但页面仍保留未保存态', () => {
    const pendingState = deriveDocumentPendingState({
      pendingVoiceEntries: [],
      pendingTimingMap: {},
      playbackBlockedVoiceIds: [],
      convertRows: [
        makeConvertRow({
          vap_voice_status: 'ready',
          vap_needs_tts: false,
        }),
      ],
      workstationDirty: true,
      serverLastMergedAtMs: 0,
    });
    const voiceUiState = deriveSubtitleVoiceUiState({
      persistedText: 'new line',
      effectiveText: 'new line',
      persistedAudioPath: '',
      voiceStatus: 'ready',
      needsTts: false,
      draftAudioPath: 'adj_audio_time_temp/clip-3.wav',
    });
    const gate = evaluateClipConvertAuditionAvailability({
      clipId: '20000001_00-00-05-200_00-00-07-257',
      row: makeConvertRow({
        vap_voice_status: 'ready',
        vap_needs_tts: false,
      }),
      audioUrl: 'https://cdn.example.com/prod/user-1/task-1/adj_audio_time_temp/clip-3.wav?t=789',
      pendingVoiceIdSet: pendingState.pendingVoiceIdSet,
      explicitMissingVoiceIdSet: pendingState.explicitMissingVoiceIdSet,
    });

    expect(voiceUiState).toBe('audio_ready');
    expect(gate).toEqual({ kind: 'ready' });
    expect(pendingState.hasUnsavedChanges).toBe(true);
    expect(pendingState.pendingMergeCount).toBe(0);
  });

  it('切割后新子段默认进入待配音状态，两个子段都不能直接试听译音', () => {
    const splitResult = splitSubtitlePayload({
      clipId: '20000001_00-00-05-200_00-00-07-257',
      splitAtMs: 6200,
      translate: [
        makeConvertRow({
          txt: 'origin line',
          vap_draft_txt: 'origin line',
          audio_url: 'https://cdn.example.com/prod/user-1/task-1/adj_audio_time/clip-4.wav',
        }),
      ],
      source: [
        makeSourceRow({
          id: '10000001_00-00-05-200_00-00-07-257',
        }),
      ],
      effectiveConvertText: 'split translated line',
      splitOperationId: 'split-op-1',
      nowMs: 987654,
      sourceAudioSplit: {
        leftPath: 'split_audio/audio/100000010001_00-00-05-200_00-00-06-200.wav',
        leftDuration: 1,
        rightPath: 'split_audio/audio/100000010002_00-00-06-200_00-00-07-257.wav',
        rightDuration: 1.057,
      },
    });
    const convertObj = makeConvertObj({
      srt_source_arr: splitResult.source,
      srt_convert_arr: splitResult.translate,
    });
    const document = mapConvertObjToEditorDocument({ convertObj });
    const pendingState = deriveDocumentPendingState({
      pendingVoiceEntries: [],
      pendingTimingMap: {},
      playbackBlockedVoiceIds: [],
      convertRows: splitResult.translate,
      workstationDirty: false,
      serverLastMergedAtMs: 0,
    });
    const leftId = splitResult.newIds.leftTranslateId;
    const rightId = splitResult.newIds.rightTranslateId;
    const leftTrack = document.subtitleTrack.find((item) => item.id === leftId);
    const rightTrack = document.subtitleTrack.find((item) => item.id === rightId);
    const leftSourceEntry = splitResult.source[0];
    const rightSourceEntry = splitResult.source[1];
    const leftSourceAudio = resolveSourceAuditionAudio({
      convertObj,
      sourceEntry: leftSourceEntry,
    });
    const rightSourceAudio = resolveSourceAuditionAudio({
      convertObj,
      sourceEntry: rightSourceEntry,
    });
    const leftGate = evaluateClipConvertAuditionAvailability({
      clipId: leftId,
      row: splitResult.translate[0],
      audioUrl: leftTrack?.previewAudioUrl || '',
      pendingVoiceIdSet: pendingState.pendingVoiceIdSet,
      explicitMissingVoiceIdSet: pendingState.explicitMissingVoiceIdSet,
    });
    const rightGate = evaluateClipConvertAuditionAvailability({
      clipId: rightId,
      row: splitResult.translate[1],
      audioUrl: rightTrack?.previewAudioUrl || '',
      pendingVoiceIdSet: pendingState.pendingVoiceIdSet,
      explicitMissingVoiceIdSet: pendingState.explicitMissingVoiceIdSet,
    });
    const leftPageGate = evaluateClipVoiceAvailability({
      clipId: leftId,
      row: splitResult.translate[0],
      audioUrl: leftTrack?.audioUrl || '',
      pendingVoiceIdSet: pendingState.pendingVoiceIdSet,
      explicitMissingVoiceIdSet: pendingState.explicitMissingVoiceIdSet,
    });
    const rightPageGate = evaluateClipVoiceAvailability({
      clipId: rightId,
      row: splitResult.translate[1],
      audioUrl: rightTrack?.audioUrl || '',
      pendingVoiceIdSet: pendingState.pendingVoiceIdSet,
      explicitMissingVoiceIdSet: pendingState.explicitMissingVoiceIdSet,
    });

    expect(splitResult.translate[0]?.vap_voice_status).toBe('missing');
    expect(splitResult.translate[0]?.vap_needs_tts).toBe(true);
    expect(splitResult.translate[1]?.vap_voice_status).toBe('missing');
    expect(splitResult.translate[1]?.vap_needs_tts).toBe(true);
    expect(splitResult.translate[0]?.vap_draft_txt).toBe('split translated line');
    expect(splitResult.translate[1]?.vap_draft_txt).toBe('split translated line');
    expect(leftSourceAudio.primary?.source).toBe('source_segment');
    expect(leftSourceAudio.primary?.url).toContain(`/${leftSourceEntry.id}.wav`);
    expect(rightSourceAudio.primary?.source).toBe('source_segment');
    expect(rightSourceAudio.primary?.url).toContain(`/${rightSourceEntry.id}.wav`);
    expect(pendingState.explicitMissingVoiceIdSet.has(leftId)).toBe(true);
    expect(pendingState.explicitMissingVoiceIdSet.has(rightId)).toBe(true);
    expect(leftGate).toEqual({
      kind: 'voice_unavailable',
      clipIndex: -1,
      subtitleId: leftId,
      reason: 'needs_regen',
    });
    expect(rightGate).toEqual({
      kind: 'voice_unavailable',
      clipIndex: -1,
      subtitleId: rightId,
      reason: 'needs_regen',
    });
    expect(leftPageGate).toEqual({
      kind: 'voice_unavailable',
      clipIndex: -1,
      subtitleId: leftId,
      reason: 'needs_regen',
    });
    expect(rightPageGate).toEqual({
      kind: 'voice_unavailable',
      clipIndex: -1,
      subtitleId: rightId,
      reason: 'needs_regen',
    });
  });

  it('刷新进入页面时，如已有上一版成功结果且 metadata 标记 active merge，应恢复轮询并暂时保留旧下载入口', () => {
    const hydrated = hydrateVideoMergeMetadataState({
      previousLastMergedAtMs: 1700000000000,
      metadata: {
        videoMerge: {
          lastSuccess: {
            mergedAtMs: 1700000000000,
          },
          active: {
            jobId: 'merge-job-1',
            createdAtMs: 1700000001234,
            state: 'pending',
          },
        },
      },
    });
    const downloadState = getHeaderDownloadState({
      taskStatus: 'processing',
      serverLastMergedAtMs: hydrated.lastMergedAtMs,
      isTaskRunning: true,
      isMergeJobActive: true,
    });
    const primaryAction = getVideoMergePrimaryActionState({
      isGeneratingVideo: false,
      isTaskRunning: true,
      isMergeJobActive: true,
      mergeStatusRequiresManualRetry: false,
      hasUnsavedChanges: false,
    });

    expect(hydrated.activeJob).toEqual({
      jobId: 'merge-job-1',
      createdAtMs: 1700000001234,
    });
    expect(shouldPollActiveVideoMergeStatus(hydrated.activeJob, false)).toBe(true);
    expect(downloadState).toEqual({
      isVisible: true,
      isDisabled: true,
      tooltipKey: 'downloadUpdatingHint',
    });
    expect(primaryAction).toEqual({
      mode: 'generate-video',
      disabled: true,
    });
  });

  it('刷新恢复中的合成连续网络失败后，应进入手动重试；点击重试后恢复轮询', () => {
    const activeJob = {
      jobId: 'merge-job-2',
      createdAtMs: 1700000002234,
    };
    const firstFailure = getNextMergeStatusPollState(0);
    const secondFailure = getNextMergeStatusPollState(firstFailure.failureCount);
    const thirdFailure = getNextMergeStatusPollState(secondFailure.failureCount);
    const fourthFailure = getNextMergeStatusPollState(thirdFailure.failureCount);
    const fifthFailure = getNextMergeStatusPollState(fourthFailure.failureCount);
    const blockedPollingAction = getVideoMergePrimaryActionState({
      isGeneratingVideo: false,
      isTaskRunning: true,
      isMergeJobActive: true,
      mergeStatusRequiresManualRetry: fifthFailure.requiresManualRetry,
      hasUnsavedChanges: false,
    });
    const downloadStateWhileRetrying = getHeaderDownloadState({
      taskStatus: 'processing',
      serverLastMergedAtMs: 1700000000000,
      isTaskRunning: true,
      isMergeJobActive: true,
    });
    const resumedPollingAction = getVideoMergePrimaryActionState({
      isGeneratingVideo: false,
      isTaskRunning: true,
      isMergeJobActive: true,
      mergeStatusRequiresManualRetry: false,
      hasUnsavedChanges: false,
    });

    expect(fifthFailure).toEqual({
      failureCount: 5,
      requiresManualRetry: true,
    });
    expect(shouldPollActiveVideoMergeStatus(activeJob, fifthFailure.requiresManualRetry)).toBe(false);
    expect(blockedPollingAction).toEqual({
      mode: 'retry-status',
      disabled: false,
    });
    expect(downloadStateWhileRetrying).toEqual({
      isVisible: true,
      isDisabled: true,
      tooltipKey: 'downloadUpdatingHint',
    });
    expect(shouldPollActiveVideoMergeStatus(activeJob, false)).toBe(true);
    expect(resumedPollingAction).toEqual({
      mode: 'generate-video',
      disabled: true,
    });
  });

  it('首次更新视频还没有任何成功产物时，即便刷新恢复到 active merge，也不应暴露下载入口', () => {
    const hydrated = hydrateVideoMergeMetadataState({
      previousLastMergedAtMs: 0,
      metadata: {
        videoMerge: {
          active: {
            jobId: 'merge-job-3',
            createdAtMs: 1700000003234,
            state: 'pending',
          },
        },
      },
    });
    const downloadState = getHeaderDownloadState({
      taskStatus: 'processing',
      serverLastMergedAtMs: hydrated.lastMergedAtMs,
      isTaskRunning: true,
      isMergeJobActive: true,
    });

    expect(hydrated.activeJob).toEqual({
      jobId: 'merge-job-3',
      createdAtMs: 1700000003234,
    });
    expect(downloadState).toEqual({
      isVisible: false,
      isDisabled: true,
      tooltipKey: null,
    });
  });

  it('刷新恢复中的 active merge 若状态接口返回非 0，应清锁失败并恢复上一版下载入口', () => {
    const resolution = resolveVideoMergeStatusResponse({
      response: {
        code: 404,
        message: 'job missing',
      },
      baselineMergedAtMs: 1700000001234,
      previousLastMergedAtMs: 1700000000000,
      fallbackFailureMessage: 'merge failed',
    });
    const downloadState = getHeaderDownloadState({
      taskStatus: resolution.taskState?.taskStatus || 'failed',
      serverLastMergedAtMs: resolution.serverLastMergedAtMs,
      isTaskRunning: false,
      isMergeJobActive: false,
    });

    expect(resolution.clearActiveJob).toBe(true);
    expect(resolution.taskState).toEqual({
      taskStatus: 'failed',
      taskErrorMessage: 'job missing',
      taskProgress: null,
      taskCurrentStep: '',
    });
    expect(resolution.serverLastMergedAtMs).toBe(1700000000000);
    expect(downloadState).toEqual({
      isVisible: true,
      isDisabled: false,
      tooltipKey: null,
    });
  });

  it('手动重试后如状态返回 success，应停止轮询并开放最新下载入口', () => {
    const resolution = resolveVideoMergeStatusResponse({
      response: {
        code: 0,
        data: {
          status: 'success',
        },
      },
      baselineMergedAtMs: 1700000005234,
      previousLastMergedAtMs: 1700000000000,
      fallbackFailureMessage: 'merge failed',
    });
    const downloadState = getHeaderDownloadState({
      taskStatus: resolution.taskState?.taskStatus || 'completed',
      serverLastMergedAtMs: resolution.serverLastMergedAtMs,
      isTaskRunning: false,
      isMergeJobActive: false,
    });

    expect(resolution.clearActiveJob).toBe(true);
    expect(resolution.taskState).toEqual({
      taskStatus: 'completed',
      taskErrorMessage: '',
      taskProgress: 100,
      taskCurrentStep: '',
    });
    expect(resolution.serverLastMergedAtMs).toBe(1700000005234);
    expect(downloadState).toEqual({
      isVisible: true,
      isDisabled: false,
      tooltipKey: null,
    });
  });

  it('工作台静默刷新失败时，应继续保留当前 detail，而不是把页面打空', () => {
    const initial = {
      ...createVideoEditorBootstrapState('task-1'),
      isLoading: false,
      videoSource: { fileName: 'demo.mp4' },
      loadedTaskMainItem: { status: 'completed', progress: 100 },
    };
    const background = startVideoEditorBootstrapRequest(initial, {
      requestId: 1,
      convertId: 'task-1',
      mode: 'background',
    });
    const failed = resolveVideoEditorBootstrapFailure(background, {
      requestId: 1,
      convertId: 'task-1',
      error: 'network down',
    });
    const visible = selectVisibleVideoEditorBootstrapState(failed, 'task-1');

    expect(visible).toEqual({
      isLoading: false,
      error: null,
      videoSource: { fileName: 'demo.mp4' },
      loadedTaskMainItem: { status: 'completed', progress: 100 },
    });
  });

  it('用户切到新任务后，旧任务迟到的详情回包不应污染当前页面可见状态', () => {
    const started = startVideoEditorBootstrapRequest(createVideoEditorBootstrapState('task-1'), {
      requestId: 1,
      convertId: 'task-1',
      mode: 'blocking',
    });
    const staleSuccess = resolveVideoEditorBootstrapSuccess(started, {
      requestId: 1,
      convertId: 'task-1',
      videoSource: { fileName: 'task-1.mp4' },
      loadedTaskMainItem: { status: 'completed', progress: 100 },
    });
    const visible = selectVisibleVideoEditorBootstrapState(staleSuccess, 'task-2');

    expect(visible).toEqual({
      isLoading: true,
      error: null,
      videoSource: null,
      loadedTaskMainItem: null,
    });
  });

  it('切割子段走 fallback_vocal 时，源音试听应优先 vocal 并保留 source segment 兜底', () => {
    const splitResult = splitSubtitlePayload({
      clipId: '20000001_00-00-05-200_00-00-07-257',
      splitAtMs: 6200,
      translate: [makeConvertRow()],
      source: [makeSourceRow()],
      effectiveConvertText: 'split translated line',
      splitOperationId: 'split-op-fallback',
      nowMs: 444444,
      sourceAudioSplit: {
        leftPath: 'split_audio/audio/fallback-left.wav',
        leftDuration: 1,
        rightPath: 'split_audio/audio/fallback-right.wav',
        rightDuration: 1.057,
      },
    });
    const convertObj = makeConvertObj({
      vocalAudioUrl: 'https://cdn.example.com/prod/user-1/task-1/vocal.wav',
      srt_source_arr: splitResult.source,
      srt_convert_arr: splitResult.translate,
    });
    const leftSourceAudio = resolveSourceAuditionAudio({
      convertObj,
      sourceEntry: {
        ...splitResult.source[0],
        vap_source_mode: 'fallback_vocal',
      },
    });

    expect(leftSourceAudio.primary).toEqual({
      source: 'vocal_fallback',
      url: 'https://cdn.example.com/prod/user-1/task-1/vocal.wav',
    });
    expect(leftSourceAudio.fallback?.source).toBe('source_segment');
    expect(leftSourceAudio.fallback?.url).toBe('https://cdn.example.com/prod/user-1/task-1/split_audio/audio/fallback-left.wav');
  });

  it('用户点击更新视频后，在 merge job 还未回写 active 前，结构编辑也应立即进入阻断态', () => {
    const blockReason = getStructuralEditBlockReason({
      isGeneratingVideo: true,
      isTaskRunning: false,
      isMergeJobActive: false,
    } as any);
    const mergePrimaryAction = getVideoMergePrimaryActionState({
      isGeneratingVideo: true,
      isTaskRunning: false,
      isMergeJobActive: false,
      mergeStatusRequiresManualRetry: false,
      hasUnsavedChanges: true,
    });

    expect(mergePrimaryAction).toEqual({
      mode: 'generate-video',
      disabled: true,
    });
    expect(blockReason).toBe('video-updating');
  });

  it('拖动时间轴保存后如服务端重命名字幕 id，后续切割应命中新 id 而不是旧 id', () => {
    const oldId = '20000001_00-00-05-200_00-00-07-257';
    const remappedId = '20000001_00-00-05-100_00-00-07-300';
    const nextPendingTimingMap = reconcilePendingTimingAfterPersist({
      currentPendingTimingMap: {
        [oldId]: { startMs: 5100, endMs: 7300 },
      },
      requestedItems: [
        {
          id: oldId,
          startMs: 5100,
          endMs: 7300,
        },
      ],
      idMap: {
        [oldId]: remappedId,
      },
    });
    const splitTargetId = remapSubtitleIdAfterTimingSave(oldId, {
      [oldId]: remappedId,
    });
    const splitResult = splitSubtitlePayload({
      clipId: splitTargetId,
      splitAtMs: 6200,
      translate: [
        makeConvertRow({
          id: remappedId,
          start: '00:00:05,100',
          end: '00:00:07,300',
        }),
      ],
      source: [
        makeSourceRow({
          id: '10000001_00-00-05-100_00-00-07-300',
          start: '00:00:05,100',
          end: '00:00:07,300',
        }),
      ],
      effectiveConvertText: 'remapped split line',
      splitOperationId: 'split-op-remap',
      nowMs: 1710000000000,
    });

    expect(nextPendingTimingMap).toEqual({});
    expect(splitTargetId).toBe(remappedId);
    expect(splitResult.newIds.leftTranslateId).toContain('00-00-05-100');
    expect(splitResult.newIds.rightTranslateId).toContain('00-00-06-200');
  });

  it('rollback 恢复后应清掉已回滚的 pending timing，并让页面 dirty 状态同步收敛', () => {
    const nextPendingTimingMap = reconcilePendingTimingMap(
      {
        'clip-restored': { startMs: 1000, endMs: 2000 },
      },
      [
        {
          id: 'clip-restored',
          start: '00:00:01,000',
          end: '00:00:02,000',
        },
      ]
    );
    const pendingState = deriveDocumentPendingState({
      pendingVoiceEntries: [],
      pendingTimingMap: nextPendingTimingMap,
      playbackBlockedVoiceIds: [],
      convertRows: [
        makeConvertRow({
          id: 'clip-restored',
          start: '00:00:01,000',
          end: '00:00:02,000',
          audio_url: 'https://cdn.example.com/prod/user-1/task-1/adj_audio_time/clip-restored.wav',
          vap_voice_status: 'ready',
          vap_needs_tts: false,
        }),
      ],
      workstationDirty: false,
      serverLastMergedAtMs: 0,
    });

    expect(nextPendingTimingMap).toEqual({});
    expect(pendingState.pendingTimingCount).toBe(0);
    expect(pendingState.pendingMergeCount).toBe(0);
    expect(pendingState.hasUnsavedChanges).toBe(false);
  });

  it('当前时间不在字幕内或离边界过近时，切割应保持不可用', () => {
    const noClip = getSubtitleSplitAvailability({
      currentTimeSec: 9,
      subtitleTrack: [
        {
          id: 'clip-1',
          startTime: 1,
          duration: 2,
          text: 'line',
        },
      ],
    });
    const tooClose = getSubtitleSplitAvailability({
      currentTimeSec: 1.05,
      subtitleTrack: [
        {
          id: 'clip-1',
          startTime: 1,
          duration: 2,
          text: 'line',
        },
      ],
    });

    expect(noClip).toMatchObject({
      canSplit: false,
      reason: 'no-clip',
      clip: null,
    });
    expect(tooClose).toMatchObject({
      canSplit: false,
      reason: 'too-close',
      clip: { id: 'clip-1' },
    });
  });
});
