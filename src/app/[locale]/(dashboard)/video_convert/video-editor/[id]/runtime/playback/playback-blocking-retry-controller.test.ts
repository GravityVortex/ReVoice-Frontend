import { describe, expect, it } from 'vitest';

import { createNetworkFailedBlockingState, resolveRetryablePlaybackContext } from './playback-blocking-retry-controller';

describe('playback blocking retry controller helpers', () => {
  it('creates a network_failed blocking state with a default retry count', () => {
    expect(createNetworkFailedBlockingState(2, 'clip-2')).toEqual({
      kind: 'network_failed',
      clipIndex: 2,
      subtitleId: 'clip-2',
      retryCount: 1,
    });
  });

  it('resolves retry context from preferred clip, subtitle id, current time, then next clip', () => {
    const track = [
      { id: 'clip-0', startTime: 0, duration: 1 },
      { id: 'clip-1', startTime: 3, duration: 1 },
      { id: 'clip-2', startTime: 8, duration: 1 },
    ] as Array<{ id: string; startTime: number; duration: number }>;

    expect(resolveRetryablePlaybackContext(track, 4.2, 1, undefined)).toEqual({
      clipIndex: 1,
      subtitleId: 'clip-1',
    });

    expect(resolveRetryablePlaybackContext(track, 4.2, 99, 'clip-2')).toEqual({
      clipIndex: 2,
      subtitleId: 'clip-2',
    });

    expect(resolveRetryablePlaybackContext(track, 3.1, 99, undefined)).toEqual({
      clipIndex: 1,
      subtitleId: 'clip-1',
    });

    expect(resolveRetryablePlaybackContext(track, 6.5, 99, undefined)).toEqual({
      clipIndex: 2,
      subtitleId: 'clip-2',
    });
  });
});
