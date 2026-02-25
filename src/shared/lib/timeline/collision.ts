export type TimelineClip = {
  id: string;
  startTime: number; // seconds
  duration: number; // seconds
};

export type MoveMode = 'clamp' | 'ripple';

export type MoveResult = {
  clips: TimelineClip[];
  changedIds: string[];
  clamped: boolean;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function safeNumber(n: number) {
  return Number.isFinite(n) ? n : 0;
}

/**
 * Move a clip in a single track while keeping "same-track no overlap".
 *
 * Notes:
 * - `clips` is treated as chronological; we still sort defensively.
 * - Ripple only pushes clips AFTER the moved one; it never crosses/mutates previous clips.
 */
export function moveClipNoOverlap(opts: {
  clips: TimelineClip[];
  clipId: string;
  candidateStartTime: number;
  mode: MoveMode;
  minStartTime?: number; // default 0
}): MoveResult {
  const minStartTime = safeNumber(opts.minStartTime ?? 0);
  const ordered = [...opts.clips].sort((a, b) => safeNumber(a.startTime) - safeNumber(b.startTime));
  const idx = ordered.findIndex((c) => c.id === opts.clipId);
  if (idx === -1) return { clips: ordered, changedIds: [], clamped: false };

  const changed = new Set<string>();

  const original = ordered[idx];
  const duration = Math.max(0, safeNumber(original.duration));
  const prev = idx > 0 ? ordered[idx - 1] : null;

  const prevEnd = prev ? safeNumber(prev.startTime) + Math.max(0, safeNumber(prev.duration)) : minStartTime;
  const unclampedStart = safeNumber(opts.candidateStartTime);
  let nextStart = Math.max(minStartTime, unclampedStart);
  nextStart = Math.max(nextStart, prevEnd);

  if (opts.mode === 'clamp') {
    const next = idx + 1 < ordered.length ? ordered[idx + 1] : null;
    const maxStart = next ? safeNumber(next.startTime) - duration : Number.POSITIVE_INFINITY;
    nextStart = clamp(nextStart, prevEnd, maxStart);
  }

  if (nextStart !== safeNumber(original.startTime)) {
    ordered[idx] = { ...original, startTime: nextStart };
    changed.add(original.id);
  }

  if (opts.mode === 'ripple') {
    let cursor = nextStart + duration;
    for (let i = idx + 1; i < ordered.length; i++) {
      const clip = ordered[i];
      const s = safeNumber(clip.startTime);
      const d = Math.max(0, safeNumber(clip.duration));
      if (s < cursor) {
        ordered[i] = { ...clip, startTime: cursor };
        changed.add(clip.id);
      }
      cursor = safeNumber(ordered[i].startTime) + d;
    }
  }

  return { clips: ordered, changedIds: [...changed], clamped: nextStart !== unclampedStart };
}

