import { describe, expect, it } from 'vitest';

import { resolveSplitTranslatedAudioPath, resolveSourcePlaybackMode } from './split';

describe('resolveSplitTranslatedAudioPath', () => {
  it('returns empty path for explicit missing split rows', () => {
    const path = resolveSplitTranslatedAudioPath({
      id: '00010001_00-00-00-000_00-00-02-000',
      vap_voice_status: 'missing',
      vap_needs_tts: true,
      audio_url: '',
      vap_draft_audio_path: '',
    });

    expect(path).toBe('');
  });

  it('keeps legacy fallback when explicit split status is absent', () => {
    const path = resolveSplitTranslatedAudioPath({
      id: '0001_00-00-00-000_00-00-04-000',
      audio_url: '',
      vap_draft_audio_path: '',
    });

    expect(path).toBe('adj_audio_time/0001_00-00-00-000_00-00-04-000.wav');
  });
});

describe('resolveSourcePlaybackMode', () => {
  it('uses vocal fallback immediately for split rows', () => {
    const mode = resolveSourcePlaybackMode({
      id: '00010001_00-00-00-000_00-00-02-000',
      vap_source_mode: 'fallback_vocal',
      audio_url: '',
    });

    expect(mode).toBe('fallback_vocal');
  });

  it('keeps legacy segment-first mode when explicit source mode is absent', () => {
    const mode = resolveSourcePlaybackMode({
      id: '0001_00-00-00-000_00-00-04-000',
      audio_url: '',
    });

    expect(mode).toBe('segment_first');
  });
});
