import { describe, expect, it } from 'vitest';

import { resolveVideoSyncMode, resolveVideoTransportTimeSec } from './playback-video-sync';

describe('playback video sync helpers', () => {
  it('prefers the active audition mode over the transport fallback mode', () => {
    expect(resolveVideoSyncMode('source', 'timeline')).toBe('audition_source');
    expect(resolveVideoSyncMode('convert', 'timeline')).toBe('audition_convert');
    expect(resolveVideoSyncMode(null, 'timeline')).toBe('timeline');
  });

  it('falls back from video current time to transport time and explicit fallback time', () => {
    expect(resolveVideoTransportTimeSec({ videoCurrentTime: 12, transportTimeSec: 8, fallbackTimeSec: 3 })).toBe(12);
    expect(resolveVideoTransportTimeSec({ videoCurrentTime: Number.NaN, transportTimeSec: 8, fallbackTimeSec: 3 })).toBe(8);
    expect(resolveVideoTransportTimeSec({ videoCurrentTime: Number.NaN, transportTimeSec: Number.NaN, fallbackTimeSec: 3 })).toBe(3);
  });
});
