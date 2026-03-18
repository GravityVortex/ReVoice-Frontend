export interface VideoIntrinsicSize {
  width: number;
  height: number;
}

export interface VideoFrameLayout {
  aspectRatio: number;
  width: string;
  maxHeight: string;
}

export const DEFAULT_VIDEO_ASPECT_RATIO = 1.7778;
export const DEFAULT_VIDEO_FRAME_MAX_HEIGHT = 'min(68vh, 620px)';

function isPositiveNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function roundAspectRatio(value: number) {
  return Number(value.toFixed(4));
}

export function getVideoAspectRatio(size?: VideoIntrinsicSize | null) {
  if (!size || !isPositiveNumber(size.width) || !isPositiveNumber(size.height)) {
    return DEFAULT_VIDEO_ASPECT_RATIO;
  }

  return roundAspectRatio(size.width / size.height);
}

export function getVideoFrameLayout(
  size?: VideoIntrinsicSize | null,
  maxHeight = DEFAULT_VIDEO_FRAME_MAX_HEIGHT
): VideoFrameLayout {
  const aspectRatio = getVideoAspectRatio(size);

  return {
    aspectRatio,
    width: `min(100%, calc(${maxHeight} * ${aspectRatio}))`,
    maxHeight,
  };
}
