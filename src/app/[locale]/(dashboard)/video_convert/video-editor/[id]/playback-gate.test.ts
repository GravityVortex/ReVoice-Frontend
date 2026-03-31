import { describe, expect, it } from 'vitest';

import { evaluateClipConvertAuditionAvailability, evaluateClipVoiceAvailability, evaluateSubtitlePlaybackGate } from './playback-gate';

describe('evaluateSubtitlePlaybackGate', () => {
  it('returns ready when a clip has a playable audio url and no explicit unavailable markers', () => {
    expect(
      evaluateSubtitlePlaybackGate({
        clipIndex: 1,
        subtitleId: 'clip-1',
        audioUrl: 'https://cdn.example.com/clip-1.wav',
        voiceStatus: 'ready',
        needsTts: false,
      })
    ).toEqual({ kind: 'ready' });
  });

  it('treats needsTts segments as voice_unavailable with needs_regen reason', () => {
    expect(
      evaluateSubtitlePlaybackGate({
        clipIndex: 2,
        subtitleId: 'clip-2',
        audioUrl: '',
        voiceStatus: 'ready',
        needsTts: true,
      })
    ).toEqual({
      kind: 'voice_unavailable',
      clipIndex: 2,
      subtitleId: 'clip-2',
      reason: 'needs_regen',
    });
  });

  it('treats failed voice status as server_failed even when no usable audio url is present', () => {
    expect(
      evaluateSubtitlePlaybackGate({
        clipIndex: 3,
        subtitleId: 'clip-3',
        audioUrl: '',
        voiceStatus: 'failed',
        needsTts: false,
      })
    ).toEqual({
      kind: 'voice_unavailable',
      clipIndex: 3,
      subtitleId: 'clip-3',
      reason: 'server_failed',
    });
  });

  it('treats missing voice status as unavailable instead of pretending it is a network error', () => {
    expect(
      evaluateSubtitlePlaybackGate({
        clipIndex: 4,
        subtitleId: 'clip-4',
        audioUrl: '',
        voiceStatus: 'missing',
        needsTts: false,
      })
    ).toEqual({
      kind: 'voice_unavailable',
      clipIndex: 4,
      subtitleId: 'clip-4',
      reason: 'missing',
    });
  });

  it('treats clips without any playable audio url as unavailable even if legacy status markers are absent', () => {
    expect(
      evaluateSubtitlePlaybackGate({
        clipIndex: 5,
        subtitleId: 'clip-5',
        audioUrl: '',
      })
    ).toEqual({
      kind: 'voice_unavailable',
      clipIndex: 5,
      subtitleId: 'clip-5',
      reason: 'missing',
    });
  });

  it('does not treat relative draft paths as ready on the main playback chain', () => {
    expect(
      evaluateSubtitlePlaybackGate({
        clipIndex: 6,
        subtitleId: 'clip-6',
        audioUrl: 'adj_audio_time_temp/clip-6.wav?t=123',
        voiceStatus: 'ready',
      })
    ).toEqual({
      kind: 'voice_unavailable',
      clipIndex: 6,
      subtitleId: 'clip-6',
      reason: 'missing',
    });
  });
});

describe('evaluateClipVoiceAvailability', () => {
  it('treats locally pending voice clips as unavailable even if the last persisted row still looks ready', () => {
    expect(
      evaluateClipVoiceAvailability({
        clipId: 'clip-6',
        row: {
          vap_voice_status: 'ready',
          vap_draft_audio_path: 'https://cdn.example.com/clip-6.wav',
          vap_needs_tts: false,
        },
        pendingVoiceIdSet: new Set(['clip-6']),
        explicitMissingVoiceIdSet: new Set(),
      })
    ).toEqual({
      kind: 'voice_unavailable',
      clipIndex: -1,
      subtitleId: 'clip-6',
      reason: 'needs_regen',
    });
  });

  it('treats explicit missing voice markers as unavailable even before the backend status is updated', () => {
    expect(
      evaluateClipVoiceAvailability({
        clipId: 'clip-7',
        row: {
          vap_voice_status: 'ready',
          vap_draft_audio_path: 'https://cdn.example.com/clip-7.wav',
          vap_needs_tts: false,
        },
        pendingVoiceIdSet: new Set(),
        explicitMissingVoiceIdSet: new Set(['clip-7']),
      })
    ).toEqual({
      kind: 'voice_unavailable',
      clipIndex: -1,
      subtitleId: 'clip-7',
        reason: 'missing',
      });
  });

  it('treats locally blocked rows as unavailable even when the last persisted audio still exists', () => {
    expect(
      evaluateClipVoiceAvailability({
        clipId: 'clip-8',
        row: {
          vap_voice_status: 'ready',
          vap_draft_audio_path: 'https://cdn.example.com/clip-8.wav',
          vap_needs_tts: false,
        },
        pendingVoiceIdSet: new Set(),
        blockingVoiceIdSet: new Set(['clip-8']),
        explicitMissingVoiceIdSet: new Set(),
      })
    ).toEqual({
      kind: 'voice_unavailable',
      clipIndex: -1,
      subtitleId: 'clip-8',
      reason: 'needs_regen',
    });
  });
});

describe('evaluateClipConvertAuditionAvailability', () => {
  it('allows convert audition for freshly generated draft audio even if the persisted row is still marked missing', () => {
    expect(
      evaluateClipConvertAuditionAvailability({
        clipId: 'clip-9',
        row: {
          vap_voice_status: 'missing',
          vap_needs_tts: true,
          audio_url: '',
        },
        audioUrl: 'https://cdn.example.com/draft/clip-9.wav',
        pendingVoiceIdSet: new Set(),
        explicitMissingVoiceIdSet: new Set(['clip-9']),
      })
    ).toEqual({ kind: 'ready' });
  });

  it('still blocks convert audition when the row is locally blocked by stale text or processing state', () => {
    expect(
      evaluateClipConvertAuditionAvailability({
        clipId: 'clip-10',
        row: {
          vap_voice_status: 'missing',
          vap_needs_tts: true,
          audio_url: '',
        },
        audioUrl: 'https://cdn.example.com/draft/clip-10.wav',
        pendingVoiceIdSet: new Set(),
        blockingVoiceIdSet: new Set(['clip-10']),
        explicitMissingVoiceIdSet: new Set(['clip-10']),
      })
    ).toEqual({
      kind: 'voice_unavailable',
      clipIndex: -1,
      subtitleId: 'clip-10',
      reason: 'needs_regen',
    });
  });

  it('allows convert audition for locally applied audio that is waiting for video merge, because the fresh clip audio is already available', () => {
    expect(
      evaluateClipConvertAuditionAvailability({
        clipId: 'clip-11',
        row: {
          vap_voice_status: 'ready',
          vap_needs_tts: false,
          audio_url: 'adj_audio_time/clip-11.wav',
        },
        audioUrl: 'https://cdn.example.com/adj_audio_time/clip-11.wav',
        pendingVoiceIdSet: new Set(['clip-11']),
        explicitMissingVoiceIdSet: new Set(),
      })
    ).toEqual({ kind: 'ready' });
  });
});
