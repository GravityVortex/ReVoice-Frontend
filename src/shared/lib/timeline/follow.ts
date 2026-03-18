export type TimelineAutoFollowInput = {
  currentTime: number;
  prevTime: number;
  pxPerSec: number;
  scrollLeft: number;
  viewportWidth: number;
  contentWidth: number;
  isDragging: boolean;
};

export type TimelineAutoFollowTarget = {
  mode: 'snap' | 'ease';
  targetLeft: number;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function getTimelineAutoFollowTarget(input: TimelineAutoFollowInput): TimelineAutoFollowTarget | null {
  if (input.isDragging) return null;
  if (!Number.isFinite(input.currentTime) || !Number.isFinite(input.pxPerSec)) return null;

  const playheadPx = input.currentTime * input.pxPerSec;
  const maxScroll = Math.max(0, input.contentWidth - input.viewportWidth);
  const delta = Math.abs(input.currentTime - input.prevTime);

  if (delta > 1.25) {
    return {
      mode: 'snap',
      targetLeft: clamp(Math.round(playheadPx - input.viewportWidth * 0.35), 0, maxScroll),
    };
  }

  const leftTrigger = input.scrollLeft + input.viewportWidth * 0.14;
  const rightTrigger = input.scrollLeft + input.viewportWidth * 0.72;

  if (playheadPx < leftTrigger) {
    return {
      mode: 'ease',
      targetLeft: clamp(Math.round(playheadPx - input.viewportWidth * 0.2), 0, maxScroll),
    };
  }

  if (playheadPx > rightTrigger) {
    return {
      mode: 'ease',
      targetLeft: clamp(Math.round(playheadPx - input.viewportWidth * 0.32), 0, maxScroll),
    };
  }

  return null;
}
