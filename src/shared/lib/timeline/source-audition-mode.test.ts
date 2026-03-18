import { describe, expect, it } from 'vitest';

import { resolveSourcePlaybackMode } from './split';

describe('resolveSourcePlaybackMode for split rows', () => {
  it('returns fallback_vocal immediately for split rows', () => {
    expect(resolveSourcePlaybackMode({
      id: '00010001_00-00-00-000_00-00-02-000',
      vap_source_mode: 'fallback_vocal',
      vap_source_segment_missing: true,
    })).toBe('fallback_vocal');
  });

  it('keeps legacy segment_first when explicit mode is absent', () => {
    expect(resolveSourcePlaybackMode({
      id: '0001_00-00-00-000_00-00-04-000',
      audio_url: '',
    })).toBe('segment_first');
  });
});
