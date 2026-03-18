export const DEFAULT_VIDEO_ASPECT_RATIO = 16 / 9;
export const VIDEO_FRAME_MAX_HEIGHT = 'min(56vh, 520px)';

export interface VideoFrameViewport {
  width: number;
  height: number;
}

function isPositiveNumber(value?: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function formatCssPixels(value: number) {
  return `${Number(value.toFixed(2))}px`;
}

export function normalizeVideoAspectRatio(width?: number | null, height?: number | null) {
  if (!isPositiveNumber(width) || !isPositiveNumber(height)) {
    return DEFAULT_VIDEO_ASPECT_RATIO;
  }

  return width / height;
}

export function buildResponsiveVideoFrameStyle(aspectRatio?: number | null, viewport?: VideoFrameViewport | null) {
  const resolvedAspectRatio = isPositiveNumber(aspectRatio)
    ? aspectRatio
    : DEFAULT_VIDEO_ASPECT_RATIO;

  if (!viewport || !isPositiveNumber(viewport.width) || !isPositiveNumber(viewport.height)) {
    return {
      aspectRatio: `${resolvedAspectRatio}`,
      width: '100%',
      maxWidth: `min(100%, calc(${VIDEO_FRAME_MAX_HEIGHT} * ${resolvedAspectRatio}))`,
      maxHeight: VIDEO_FRAME_MAX_HEIGHT,
    };
  }

  const fittedWidth = Math.min(viewport.width, viewport.height * resolvedAspectRatio);
  const fittedHeight = fittedWidth / resolvedAspectRatio;

  return {
    aspectRatio: `${resolvedAspectRatio}`,
    width: formatCssPixels(fittedWidth),
    height: formatCssPixels(fittedHeight),
    maxWidth: '100%',
    maxHeight: '100%',
  };
}
