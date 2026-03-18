import { describe, expect, it } from 'vitest';

import {
  buildResponsiveVideoFrameStyle,
  DEFAULT_VIDEO_ASPECT_RATIO,
  normalizeVideoAspectRatio,
  VIDEO_FRAME_MAX_HEIGHT,
} from './video-frame';

describe('normalizeVideoAspectRatio', () => {
  it('falls back to 16:9 when metadata is missing', () => {
    expect(normalizeVideoAspectRatio(undefined, 1080)).toBe(DEFAULT_VIDEO_ASPECT_RATIO);
    expect(normalizeVideoAspectRatio(1920, undefined)).toBe(DEFAULT_VIDEO_ASPECT_RATIO);
    expect(normalizeVideoAspectRatio(0, 1080)).toBe(DEFAULT_VIDEO_ASPECT_RATIO);
  });

  it('returns the intrinsic ratio when width and height are available', () => {
    expect(normalizeVideoAspectRatio(1080, 1920)).toBeCloseTo(1080 / 1920);
    expect(normalizeVideoAspectRatio(3840, 2160)).toBeCloseTo(3840 / 2160);
  });
});

describe('buildResponsiveVideoFrameStyle', () => {
  it('uses a roomier desktop fallback cap so wide videos do not leave large side gutters', () => {
    expect(VIDEO_FRAME_MAX_HEIGHT).toBe('min(56vh, 520px)');
  });

  it('keeps the CSS fallback when no slot size is available', () => {
    const portraitRatio = 1080 / 1920;

    expect(buildResponsiveVideoFrameStyle(portraitRatio)).toEqual({
      aspectRatio: `${portraitRatio}`,
      width: '100%',
      maxWidth: `min(100%, calc(${VIDEO_FRAME_MAX_HEIGHT} * ${portraitRatio}))`,
      maxHeight: VIDEO_FRAME_MAX_HEIGHT,
    });
  });

  it('shrinks the frame to stay inside the measured preview slot', () => {
    expect(buildResponsiveVideoFrameStyle(DEFAULT_VIDEO_ASPECT_RATIO, { width: 280, height: 120 })).toEqual({
      aspectRatio: `${DEFAULT_VIDEO_ASPECT_RATIO}`,
      width: '213.33px',
      height: '120px',
      maxWidth: '100%',
      maxHeight: '100%',
    });
  });

  it('uses the fallback ratio when the incoming aspect value is invalid', () => {
    expect(buildResponsiveVideoFrameStyle(Number.NaN, { width: 320, height: 180 })).toEqual({
      aspectRatio: `${DEFAULT_VIDEO_ASPECT_RATIO}`,
      width: '320px',
      height: '180px',
      maxWidth: '100%',
      maxHeight: '100%',
    });
  });
});
