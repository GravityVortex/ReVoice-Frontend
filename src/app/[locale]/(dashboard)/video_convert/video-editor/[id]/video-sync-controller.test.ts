import { describe, expect, it, vi } from 'vitest';

import { createVideoSyncController } from './video-sync-controller';

function createFakeVideoElement() {
  return {
    currentTime: 0,
    paused: true,
    play: vi.fn(async function play(this: { paused: boolean }) {
      this.paused = false;
    }),
    pause: vi.fn(function pause(this: { paused: boolean }) {
      this.paused = true;
    }),
  };
}

describe('video-sync-controller', () => {
  it('applies transport snapshot to a video-like element', async () => {
    const video = createFakeVideoElement();
    const controller = createVideoSyncController(video);

    await controller.apply({
      status: 'playing',
      mode: 'timeline',
      transportTimeSec: 12,
    });

    expect(video.currentTime).toBe(12);
    expect(video.play).toHaveBeenCalledTimes(1);
    expect(video.paused).toBe(false);
  });

  it('pauses and seeks when transport snapshot is paused', async () => {
    const video = createFakeVideoElement();
    video.currentTime = 5;
    video.paused = false;
    const controller = createVideoSyncController(video);

    await controller.apply({
      status: 'paused',
      mode: 'timeline',
      transportTimeSec: 8,
    });

    expect(video.currentTime).toBe(8);
    expect(video.pause).toHaveBeenCalledTimes(1);
    expect(video.paused).toBe(true);
  });

  it('uses optional play and pause delegates as the side-effect boundary', async () => {
    const video = createFakeVideoElement();
    video.currentTime = 2;
    video.paused = false;
    const play = vi.fn(async () => undefined);
    const pause = vi.fn(() => {
      video.paused = true;
    });
    const controller = createVideoSyncController(video, { play, pause });

    await controller.apply({
      status: 'playing',
      mode: 'timeline',
      transportTimeSec: 6,
    });

    expect(play).toHaveBeenCalledTimes(1);
    expect(video.play).not.toHaveBeenCalled();
    expect(video.currentTime).toBe(6);

    await controller.apply({
      status: 'paused',
      mode: 'timeline',
      transportTimeSec: 4,
    });

    expect(pause).toHaveBeenCalledTimes(1);
    expect(video.pause).not.toHaveBeenCalled();
    expect(video.currentTime).toBe(4);
    expect(video.paused).toBe(true);
  });

  it('supports exact seek intents with zero tolerance', async () => {
    const video = createFakeVideoElement();
    video.currentTime = 10;
    const controller = createVideoSyncController(video, { seekToleranceSec: 0 });

    await controller.apply({
      status: 'paused',
      mode: 'timeline',
      transportTimeSec: 10.02,
    });

    expect(video.currentTime).toBe(10.02);
  });
});
