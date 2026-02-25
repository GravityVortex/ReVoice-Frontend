export type TimeRangesLike = {
  length: number;
  start(index: number): number;
  end(index: number): number;
};

/**
 * Returns the end time of the buffered range that contains `time`.
 * If `time` is in a gap (not currently buffered), returns `null`.
 */
export function getBufferedEndForTime(
  buffered: TimeRangesLike | null | undefined,
  time: number,
  epsilonSeconds: number = 0.05
): number | null {
  if (!buffered || buffered.length <= 0 || !Number.isFinite(time)) return null;

  const t = Math.max(0, time);
  const eps = Math.max(0, epsilonSeconds);

  for (let i = 0; i < buffered.length; i += 1) {
    const start = buffered.start(i);
    const end = buffered.end(i);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;

    // Inclusive-with-epsilon: media clocks and ranges are floating point.
    if (t + eps >= start && t - eps <= end) {
      return end;
    }
  }

  return null;
}

export function getBufferedAheadSeconds(
  buffered: TimeRangesLike | null | undefined,
  time: number,
  epsilonSeconds: number = 0.05
): number {
  const end = getBufferedEndForTime(buffered, time, epsilonSeconds);
  if (end == null) return 0;
  return Math.max(0, end - Math.max(0, time));
}

