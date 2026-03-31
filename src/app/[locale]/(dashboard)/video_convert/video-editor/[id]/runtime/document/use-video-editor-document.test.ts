import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import type { ConvertObj } from '@/shared/components/video-editor/types';

import { mapConvertObjToEditorDocument } from './video-editor-document-mappers';
import { deriveDocumentPendingState, getActiveVideoEditorDocumentState } from './video-editor-document-selectors';

describe('use video editor document helpers', () => {
  const shellSource = readFileSync(new URL('../../video-editor-page-shell.tsx', import.meta.url), 'utf8');
  const hookSource = readFileSync(new URL('./use-video-editor-document.ts', import.meta.url), 'utf8');

  it('lets the page shell delegate document owner state to useVideoEditorDocument', () => {
    expect(shellSource).toContain("import { useVideoEditorDocument } from './runtime/document/use-video-editor-document';");
    expect(shellSource).toContain('const {');
    expect(shellSource).toContain('} = useVideoEditorDocument({');
    expect(shellSource).not.toContain('const [convertObj, setConvertObj] = useState<ConvertObj | null>(null);');
    expect(shellSource).not.toContain('const [subtitleTrack, setSubtitleTrack] = useState<SubtitleTrackItem[]>([]);');

    expect(hookSource).toContain('const [convertObj, setConvertObj] = useState<ConvertObj | null>(null);');
    expect(hookSource).toContain('const [subtitleTrack, setSubtitleTrack] = useState<SubtitleTrackItem[]>([]);');
    expect(hookSource).toContain('const documentPendingState = useMemo(');
    expect(hookSource).toContain('const mappedDocument = mapConvertObjToEditorDocument({');
    expect(hookSource).not.toContain('const handleSubtitleTrackChange = useCallback(');
    expect(hookSource).toContain('const handleResetTiming = useCallback(');
  });

  it('derives pending merge sets from server revisions, local voice/timing edits, playback blocks, and missing voice rows', () => {
    const result = deriveDocumentPendingState({
      pendingVoiceEntries: [{ id: 'clip-local-voice', updatedAtMs: 200 }],
      pendingTimingMap: { 'clip-local-timing': { startMs: 1000, endMs: 2000 } },
      playbackBlockedVoiceIds: ['clip-blocked'],
      convertRows: [
        { id: 'clip-server-audio', audio_rev_ms: 300, timing_rev_ms: 0 },
        { id: 'clip-server-timing', audio_rev_ms: 0, timing_rev_ms: 400 },
        { id: 'clip-missing', vap_voice_status: 'missing', vap_needs_tts: false },
      ],
      serverLastMergedAtMs: 100,
      workstationDirty: false,
    });

    expect(result.serverMergePending.audio.has('clip-server-audio')).toBe(true);
    expect(result.serverMergePending.timing.has('clip-server-timing')).toBe(true);
    expect(result.localPendingVoiceIdSet.has('clip-local-voice')).toBe(true);
    expect(result.playbackBlockedVoiceIdSet.has('clip-blocked')).toBe(true);
    expect(result.explicitMissingVoiceIdSet.has('clip-missing')).toBe(true);
    expect(result.pendingVoiceIdSet.has('clip-local-voice')).toBe(true);
    expect(result.pendingVoiceIdSet.has('clip-server-audio')).toBe(true);
    expect(result.pendingVoiceIdSet.has('clip-missing')).toBe(true);
    expect(result.pendingTimingIdSet.has('clip-local-timing')).toBe(true);
    expect(result.pendingTimingIdSet.has('clip-server-timing')).toBe(true);
    expect(result.pendingMergeIdSet.has('clip-local-voice')).toBe(true);
    expect(result.pendingMergeIdSet.has('clip-local-timing')).toBe(true);
    expect(result.pendingMergeCount).toBe(5);
    expect(result.pendingMergeVoiceCount).toBe(3);
    expect(result.pendingMergeTimingCount).toBe(2);
    expect(result.pendingTimingCount).toBe(1);
    expect(result.hasUnsavedChanges).toBe(true);
  });

  it('maps convertObj into unified video, bgm, converted, and source document tracks', () => {
    const result = mapConvertObjToEditorDocument({
      convertObj: {
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
        backgroundAudioUrl: 'https://cdn.example.com/bgm.mp3',
        vocalAudioUrl: 'https://cdn.example.com/vocal.mp3',
        r2preUrl: 'https://cdn.example.com',
        env: 'prod',
        srt_source_arr: [
          { id: 'source-1', start: '00:00:01,000', end: '00:00:02,500', txt: 'source line' },
        ],
        srt_convert_arr: [
          {
            id: 'clip-1',
            start: '00:00:01,000',
            end: '00:00:02,500',
            txt: 'server line',
            vap_draft_txt: 'draft line',
            vap_tts_updated_at_ms: 456,
            vap_draft_audio_path: 'adj_audio_time_temp/clip-1.wav',
          },
        ],
        srt_double_arr: [],
      } satisfies ConvertObj,
      trackLabels: {
        videoTrackName: 'Main Video',
        bgmTrackName: 'BGM',
      },
    });

    expect(result.videoTrack).toEqual([
      {
        id: 'video-main',
        type: 'video',
        name: 'Main Video',
        url: 'https://cdn.example.com/video.mp4',
        startTime: 0,
        duration: 12,
        volume: 100,
      },
    ]);
    expect(result.bgmTrack).toEqual([
      {
        id: 'bgm-main',
        type: 'bgm',
        name: 'BGM',
        url: 'https://cdn.example.com/bgm.mp3',
        startTime: 0,
        duration: 12,
        volume: 80,
      },
    ]);
    expect(result.subtitleTrack).toEqual([
      {
        id: 'clip-1',
        sourceId: 'source-1',
        type: 'video',
        name: 'Sub 1',
        startTime: 1,
        duration: 1.5,
        text: 'draft line',
        fontSize: 16,
        color: '#ffffff',
        audioUrl: 'https://cdn.example.com/prod/user-1/task-1/adj_audio_time_temp/clip-1.wav?t=456',
        previewAudioUrl: 'https://cdn.example.com/prod/user-1/task-1/adj_audio_time_temp/clip-1.wav?t=456',
        splitOperationId: undefined,
      },
    ]);
    expect(result.subtitleTrackOriginal).toEqual([
      {
        id: 'source-1',
        sourceId: 'source-1',
        type: 'audio',
        name: 'Src 1',
        startTime: 1,
        duration: 1.5,
        text: 'source line',
      },
    ]);
    expect(result.totalDuration).toBe(12);
  });

  it('does not synthesize fake translated audio urls when public audio metadata is incomplete', () => {
    const result = mapConvertObjToEditorDocument({
      convertObj: {
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
        backgroundAudioUrl: 'https://cdn.example.com/bgm.mp3',
        vocalAudioUrl: 'https://cdn.example.com/vocal.mp3',
        r2preUrl: '',
        env: '',
        srt_source_arr: [
          { id: 'source-1', start: '00:00:01,000', end: '00:00:02,500', txt: 'source line' },
        ],
        srt_convert_arr: [
          {
            id: 'clip-1',
            start: '00:00:01,000',
            end: '00:00:02,500',
            txt: 'server line',
            vap_draft_txt: 'draft line',
            vap_tts_updated_at_ms: 456,
            vap_draft_audio_path: 'adj_audio_time_temp/clip-1.wav',
          },
        ],
        srt_double_arr: [],
      } satisfies ConvertObj,
      trackLabels: {
        videoTrackName: 'Main Video',
        bgmTrackName: 'BGM',
      },
    });

    expect(result.subtitleTrack[0]?.audioUrl).toBe('');
    expect(result.subtitleTrack[0]?.previewAudioUrl).toBe('adj_audio_time_temp/clip-1.wav?t=456');
  });

  it('does not reuse previous local tracks when a different convert task is loaded', () => {
    const result = mapConvertObjToEditorDocument({
      convertObj: {
        id: 'task-2',
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
        backgroundAudioUrl: 'https://cdn.example.com/bgm.mp3',
        vocalAudioUrl: 'https://cdn.example.com/vocal.mp3',
        r2preUrl: 'https://cdn.example.com',
        env: 'prod',
        srt_source_arr: [
          { id: 'source-1', start: '00:00:01,000', end: '00:00:02,500', txt: 'fresh source line' },
        ],
        srt_convert_arr: [
          {
            id: 'clip-1',
            start: '00:00:01,000',
            end: '00:00:02,500',
            txt: 'fresh server line',
            vap_draft_txt: 'fresh draft line',
            vap_tts_updated_at_ms: 456,
            vap_draft_audio_path: 'adj_audio_time_temp/clip-1.wav',
          },
        ],
        srt_double_arr: [],
      } satisfies ConvertObj,
      previousDocumentId: 'task-1',
      previousSubtitleTrack: [
        {
          id: 'clip-1',
          sourceId: 'source-1',
          type: 'video',
          name: 'Sub 1',
          startTime: 1,
          duration: 1.5,
          text: 'stale local line',
          fontSize: 16,
          color: '#ffffff',
          audioUrl: 'https://cdn.example.com/prod/user-1/task-1/adj_audio_time/clip-1.wav',
        },
      ],
      previousSubtitleTrackOriginal: [
        {
          id: 'source-1',
          sourceId: 'source-1',
          type: 'audio',
          name: 'Src 1',
          startTime: 1,
          duration: 1.5,
          text: 'stale local source',
        },
      ],
      trackLabels: {
        videoTrackName: 'Main Video',
        bgmTrackName: 'BGM',
      },
    });

    expect(result.subtitleTrack[0]?.text).toBe('fresh draft line');
    expect(result.subtitleTrack[0]?.audioUrl).toBe('https://cdn.example.com/prod/user-1/task-2/adj_audio_time_temp/clip-1.wav?t=456');
    expect(result.subtitleTrackOriginal[0]?.text).toBe('fresh source line');
  });

  it('masks stale document owner state when the shell has already switched to another convert task', () => {
    const pendingState = deriveDocumentPendingState({
      pendingVoiceEntries: [{ id: 'clip-1', updatedAtMs: 200 }],
      pendingTimingMap: { 'clip-1': { startMs: 1000, endMs: 2000 } },
      playbackBlockedVoiceIds: ['clip-2'],
      convertRows: [{ id: 'clip-1', audio_rev_ms: 300 }],
      workstationDirty: true,
      serverLastMergedAtMs: 100,
    });

    const result = getActiveVideoEditorDocumentState({
      convertId: 'task-2',
      convertObj: {
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
        srt_source_arr: [],
        srt_convert_arr: [],
        srt_double_arr: [],
      } satisfies ConvertObj,
      videoTrack: [{ id: 'video-main', type: 'video', name: 'Main Video', url: 'video.mp4', startTime: 0, duration: 12 }],
      bgmTrack: [{ id: 'bgm-main', type: 'bgm', name: 'BGM', url: 'bgm.mp3', startTime: 0, duration: 12 }],
      subtitleTrack: [{ id: 'clip-1', type: 'video', name: 'Sub 1', startTime: 1, duration: 1, text: 'stale' }],
      subtitleTrackOriginal: [{ id: 'source-1', type: 'audio', name: 'Src 1', startTime: 1, duration: 1, text: 'stale' }],
      pendingTimingMap: { 'clip-1': { startMs: 1000, endMs: 2000 } },
      pendingTimingCount: 1,
      serverLastMergedAtMs: 300,
      documentPendingState: pendingState,
      documentDuration: 12,
    });

    expect(result.convertObj).toBeNull();
    expect(result.videoTrack).toEqual([]);
    expect(result.bgmTrack).toEqual([]);
    expect(result.subtitleTrack).toEqual([]);
    expect(result.subtitleTrackOriginal).toEqual([]);
    expect(result.pendingTimingMap).toEqual({});
    expect(result.pendingTimingCount).toBe(0);
    expect(result.serverLastMergedAtMs).toBe(0);
    expect(result.documentDuration).toBe(0);
    expect(result.documentPendingState.hasUnsavedChanges).toBe(false);
    expect(result.documentPendingState.pendingMergeCount).toBe(0);
    expect(result.documentPendingState.pendingTimingCount).toBe(0);
  });
});
