import { describe, expect, it } from 'vitest';

import { collectMissingVoiceIds } from './split';

describe('collectMissingVoiceIds', () => {
  it('treats explicit split rows as missing voice', () => {
    const rows = [
      { id: 'a', vap_voice_status: 'missing', vap_needs_tts: true },
      { id: 'b', vap_voice_status: 'ready', vap_needs_tts: false, audio_url: 'adj_audio_time/b.wav' },
    ];

    expect(collectMissingVoiceIds(rows)).toEqual(['a']);
  });

  it('keeps legacy rows compatible when explicit status is absent', () => {
    const rows = [
      { id: 'legacy-1', audio_url: '' },
      { id: 'legacy-2', vap_draft_audio_path: 'adj_audio_time_temp/legacy-2.wav' },
    ];

    expect(collectMissingVoiceIds(rows)).toEqual([]);
  });
});
