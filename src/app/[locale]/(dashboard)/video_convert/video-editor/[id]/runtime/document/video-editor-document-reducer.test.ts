import { describe, expect, it } from 'vitest';

import type { ConvertObj } from '@/shared/components/video-editor/types';

import {
  createInitialVideoEditorDocumentState,
  videoEditorDocumentReducer,
} from './video-editor-document-reducer';

const trackLabels = {
  videoTrackName: 'Main Video',
  bgmTrackName: 'BGM',
};

function buildConvertObj(overrides?: Partial<ConvertObj>): ConvertObj {
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
    ...overrides,
  };
}

describe('video editor document reducer', () => {
  it('remaps convert reloads through a unified reducer while preserving local converted edits', () => {
    const initialState = createInitialVideoEditorDocumentState();
    const loadedState = videoEditorDocumentReducer(initialState, {
      type: 'set_convert_obj',
      update: buildConvertObj(),
      trackLabels,
    });

    const locallyEditedState = videoEditorDocumentReducer(loadedState, {
      type: 'update_subtitle_text',
      id: 'clip-1',
      text: 'local edit',
    });

    const reloadedState = videoEditorDocumentReducer(locallyEditedState, {
      type: 'set_convert_obj',
      update: buildConvertObj({
        srt_convert_arr: [
          {
            id: 'clip-1',
            start: '00:00:01,000',
            end: '00:00:02,500',
            txt: 'server refresh',
            vap_draft_txt: 'fresh draft',
            vap_tts_updated_at_ms: 789,
            vap_draft_audio_path: 'adj_audio_time_temp/clip-1-new.wav',
          },
        ],
      }),
      trackLabels,
    });

    expect(reloadedState.subtitleTrack[0]?.text).toBe('local edit');
    expect(reloadedState.subtitleTrack[0]?.previewAudioUrl).toBe(
      'https://cdn.example.com/prod/user-1/task-1/adj_audio_time_temp/clip-1.wav?t=456'
    );
    expect((reloadedState.convertObj?.srt_convert_arr?.[0] as any)?.vap_draft_audio_path).toBe(
      'adj_audio_time_temp/clip-1-new.wav'
    );
    expect(reloadedState.mappedDocumentId).toBe('task-1');
  });

  it('reconciles pending timing through remap without dropping local subtitle edits', () => {
    const loadedState = videoEditorDocumentReducer(createInitialVideoEditorDocumentState(), {
      type: 'set_convert_obj',
      update: buildConvertObj(),
      trackLabels,
    });
    const locallyEditedState = videoEditorDocumentReducer(loadedState, {
      type: 'update_subtitle_text',
      id: 'clip-1',
      text: 'keep local text',
    });

    const nextState = videoEditorDocumentReducer(locallyEditedState, {
      type: 'set_pending_timing_map',
      update: {
        'clip-1': { startMs: 1500, endMs: 3000 },
      },
      trackLabels,
    });

    expect(nextState.pendingTimingMap).toEqual({
      'clip-1': { startMs: 1500, endMs: 3000 },
    });
    expect(nextState.subtitleTrack[0]?.text).toBe('keep local text');
    expect(nextState.subtitleTrack[0]?.startTime).toBe(1.5);
    expect(nextState.subtitleTrack[0]?.duration).toBe(1.5);
  });

  it('updates source subtitle text in both source track and convert payload', () => {
    const loadedState = videoEditorDocumentReducer(createInitialVideoEditorDocumentState(), {
      type: 'set_convert_obj',
      update: buildConvertObj(),
      trackLabels,
    });

    const nextState = videoEditorDocumentReducer(loadedState, {
      type: 'update_source_subtitle_text',
      sourceId: 'source-1',
      text: 'new source line',
    });

    expect(nextState.subtitleTrackOriginal[0]?.text).toBe('new source line');
    expect((nextState.convertObj?.srt_source_arr?.[0] as any)?.txt).toBe('new source line');
  });

  it('resets timing by staging the new timing locally while keeping convert rows aligned to source rows', () => {
    const loadedState = videoEditorDocumentReducer(createInitialVideoEditorDocumentState(), {
      type: 'set_convert_obj',
      update: buildConvertObj(),
      trackLabels,
    });

    const nextState = videoEditorDocumentReducer(loadedState, {
      type: 'reset_timing',
      id: 'clip-1',
      sourceId: 'source-1',
      startMs: 3000,
      endMs: 4500,
    });

    expect(nextState.pendingTimingMap).toEqual({
      'clip-1': { startMs: 3000, endMs: 4500 },
    });
    expect(nextState.subtitleTrack[0]?.startTime).toBe(3);
    expect(nextState.subtitleTrack[0]?.duration).toBe(1.5);
    expect((nextState.convertObj?.srt_convert_arr?.[0] as any)?.start).toBe('00:00:01,000');
    expect((nextState.convertObj?.srt_convert_arr?.[0] as any)?.end).toBe('00:00:02,500');
  });

  it('clears session-only state without dropping the current document payload', () => {
    const loadedState = videoEditorDocumentReducer(createInitialVideoEditorDocumentState(), {
      type: 'set_convert_obj',
      update: buildConvertObj(),
      trackLabels,
    });
    const pendingVoiceState = videoEditorDocumentReducer(loadedState, {
      type: 'set_pending_voice_entries',
      update: [{ id: 'clip-1', updatedAtMs: 999 }],
    });
    const blockedState = videoEditorDocumentReducer(pendingVoiceState, {
      type: 'set_playback_blocked_voice_ids',
      update: ['clip-1'],
    });
    const timingState = videoEditorDocumentReducer(blockedState, {
      type: 'set_pending_timing_map',
      update: { 'clip-1': { startMs: 1500, endMs: 3000 } },
      trackLabels,
    });
    const mergedState = videoEditorDocumentReducer(timingState, {
      type: 'set_server_last_merged_at_ms',
      update: 321,
    });
    const dirtyState = videoEditorDocumentReducer(mergedState, {
      type: 'set_workstation_dirty',
      update: true,
    });

    const nextState = videoEditorDocumentReducer(dirtyState, {
      type: 'reset_document_session_state',
    });

    expect(nextState.convertObj?.id).toBe('task-1');
    expect(nextState.subtitleTrack).toHaveLength(1);
    expect(nextState.pendingVoiceEntries).toEqual([]);
    expect(nextState.playbackBlockedVoiceIds).toEqual([]);
    expect(nextState.pendingTimingMap).toEqual({});
    expect(nextState.serverLastMergedAtMs).toBe(0);
    expect(nextState.workstationDirty).toBe(false);
  });
});
