export type StructuralEditBlockReason = 'video-updating';

type StructuralSubtitleClip = {
  id: string;
  startTime: number;
  duration: number;
  text?: string;
  type?: string;
  name?: string;
};

export function getStructuralEditBlockReason(args: {
  isGeneratingVideo?: boolean;
  isTaskRunning: boolean;
  isMergeJobActive: boolean;
}): StructuralEditBlockReason | null {
  if (args.isGeneratingVideo || args.isTaskRunning || args.isMergeJobActive) return 'video-updating';
  return null;
}

export function getSubtitleSplitAvailability(args: {
  currentTimeSec: number;
  subtitleTrack: StructuralSubtitleClip[];
  minEdgeGapMs?: number;
}):
  | {
      canSplit: true;
      splitAtMs: number;
      clip: StructuralSubtitleClip;
      reason: null;
    }
  | {
      canSplit: false;
      splitAtMs: number;
      clip: StructuralSubtitleClip | null;
      reason: 'no-clip' | 'too-close';
    } {
  const splitAtMs = Math.round(args.currentTimeSec * 1000);
  const minEdgeGapMs = Math.max(0, args.minEdgeGapMs ?? 200);
  const clip =
    args.subtitleTrack.find((item) => {
      const startMs = Math.round(item.startTime * 1000);
      const endMs = Math.round((item.startTime + item.duration) * 1000);
      return splitAtMs >= startMs && splitAtMs < endMs;
    }) ?? null;

  if (!clip) {
    return {
      canSplit: false,
      splitAtMs,
      clip: null,
      reason: 'no-clip',
    };
  }

  const clipStartMs = Math.round(clip.startTime * 1000);
  const clipEndMs = Math.round((clip.startTime + clip.duration) * 1000);
  if (splitAtMs - clipStartMs < minEdgeGapMs || clipEndMs - splitAtMs < minEdgeGapMs) {
    return {
      canSplit: false,
      splitAtMs,
      clip,
      reason: 'too-close',
    };
  }

  return {
    canSplit: true,
    splitAtMs,
    clip,
    reason: null,
  };
}

type PendingTimingEntry = {
  startMs: number;
  endMs: number;
};

type PendingTimingSnapshotEntry = PendingTimingEntry & {
  id: string;
};

type SubtitleTimingRow = {
  id?: string;
  start?: string;
  end?: string;
};

function parseSrtTimeToMs(value: unknown) {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})$/);
  if (!match) return null;
  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  const seconds = Number.parseInt(match[3], 10);
  const ms = Number.parseInt(match[4], 10);
  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + ms;
}

export function reconcilePendingTimingMap(
  pendingTimingMap: Record<string, PendingTimingEntry>,
  restoredRows: SubtitleTimingRow[]
) {
  const restoredById = new Map<string, SubtitleTimingRow>();

  for (const row of restoredRows) {
    const id = typeof row?.id === 'string' ? row.id : '';
    if (id) restoredById.set(id, row);
  }

  const next: Record<string, PendingTimingEntry> = {};

  for (const [id, entry] of Object.entries(pendingTimingMap)) {
    const restoredRow = restoredById.get(id);
    if (!restoredRow) continue;

    const restoredStartMs = parseSrtTimeToMs(restoredRow.start);
    const restoredEndMs = parseSrtTimeToMs(restoredRow.end);
    if (restoredStartMs == null || restoredEndMs == null) {
      next[id] = entry;
      continue;
    }

    if (restoredStartMs === entry.startMs && restoredEndMs === entry.endMs) continue;
    next[id] = entry;
  }

  return next;
}

export function reconcilePendingTimingAfterPersist(args: {
  currentPendingTimingMap: Record<string, PendingTimingEntry>;
  requestedItems: PendingTimingSnapshotEntry[];
  idMap?: Record<string, string>;
}) {
  const requestedById = new Map<string, PendingTimingEntry>();
  for (const item of args.requestedItems) {
    requestedById.set(item.id, {
      startMs: item.startMs,
      endMs: item.endMs,
    });
  }

  const next: Record<string, PendingTimingEntry> = {};

  for (const [currentId, entry] of Object.entries(args.currentPendingTimingMap)) {
    const requestedEntry = requestedById.get(currentId);
    const remappedId = typeof args.idMap?.[currentId] === 'string' && args.idMap[currentId].trim().length > 0 ? args.idMap[currentId] : currentId;

    if (requestedEntry && requestedEntry.startMs === entry.startMs && requestedEntry.endMs === entry.endMs) {
      continue;
    }

    next[remappedId] = entry;
  }

  return next;
}

export function remapSubtitleIdAfterTimingSave(subtitleId: string, idMap?: Record<string, string>) {
  const remappedId = typeof idMap?.[subtitleId] === 'string' ? idMap[subtitleId].trim() : '';
  return remappedId || subtitleId;
}
