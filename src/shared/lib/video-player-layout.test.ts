import { describe, expect, it } from 'vitest';

import {
  DEFAULT_VIDEO_ASPECT_RATIO,
  DEFAULT_VIDEO_FRAME_MAX_HEIGHT,
  getVideoFrameLayout,
} from './video-player-layout';

describe('video-player-layout', () => {
  it('uses intrinsic landscape metadata to size the preview frame', () => {
    expect(getVideoFrameLayout({ width: 1920, height: 1080 })).toEqual({
      aspectRatio: 1.7778,
      width: 'min(100%, calc(min(68vh, 620px) * 1.7778))',
      maxHeight: DEFAULT_VIDEO_FRAME_MAX_HEIGHT,
    });
  });

  it('uses intrinsic portrait metadata to avoid oversized side gutters', () => {
    expect(getVideoFrameLayout({ width: 1080, height: 1920 })).toEqual({
      aspectRatio: 0.5625,
      width: 'min(100%, calc(min(68vh, 620px) * 0.5625))',
      maxHeight: DEFAULT_VIDEO_FRAME_MAX_HEIGHT,
    });
  });

  it('falls back to the default 16:9 frame when metadata is unavailable', () => {
    expect(getVideoFrameLayout(null)).toEqual({
      aspectRatio: DEFAULT_VIDEO_ASPECT_RATIO,
      width: `min(100%, calc(${DEFAULT_VIDEO_FRAME_MAX_HEIGHT} * ${DEFAULT_VIDEO_ASPECT_RATIO}))`,
      maxHeight: DEFAULT_VIDEO_FRAME_MAX_HEIGHT,
    });
  });
});
