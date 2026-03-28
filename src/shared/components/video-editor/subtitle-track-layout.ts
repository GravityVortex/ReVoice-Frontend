import type { SubtitleTrackItem } from './types';

export type SubtitleTrackVisualMode = 'normal' | 'compact' | 'dense';

export type SubtitleTrackLayoutEntry = {
  item: SubtitleTrackItem;
  originalIndex: number;
  leftPct: number;
  widthPct: number;
  leftPx: number;
  widthPx: number;
  endTime: number;
  hitboxLeftPct: number;
  hitboxWidthPct: number;
  hitboxWidthPx: number;
  hitboxInsetPx: number;
  isNarrow: boolean;
  visualMode: SubtitleTrackVisualMode;
  standaloneMode: Exclude<SubtitleTrackVisualMode, 'dense'>;
  runId: string;
};

export type SubtitleTrackDenseBoundary = {
  itemId: string;
  originalIndex: number;
  startTime: number;
  endTime: number;
  leftPct: number;
  widthPct: number;
  leftPx: number;
  widthPx: number;
  splitOperationId?: string;
};

export type SubtitleTrackLayoutRun = {
  id: string;
  mode: SubtitleTrackVisualMode;
  itemIds: string[];
  startTime: number;
  endTime: number;
  leftPct: number;
  widthPct: number;
  leftPx: number;
  widthPx: number;
  boundaries: SubtitleTrackDenseBoundary[];
};

export type SubtitleTrackLayoutResult = {
  entries: SubtitleTrackLayoutEntry[];
  runs: SubtitleTrackLayoutRun[];
};

type DraftEntry = Omit<SubtitleTrackLayoutEntry, 'visualMode' | 'runId'>;

function toBoundary(entry: SubtitleTrackLayoutEntry | DraftEntry): SubtitleTrackDenseBoundary {
  return {
    itemId: entry.item.id,
    originalIndex: entry.originalIndex,
    startTime: entry.item.startTime,
    endTime: entry.endTime,
    leftPct: entry.leftPct,
    widthPct: entry.widthPct,
    leftPx: entry.leftPx,
    widthPx: entry.widthPx,
    splitOperationId: entry.item.splitOperationId,
  };
}

function buildSingleRun(entry: SubtitleTrackLayoutEntry): SubtitleTrackLayoutRun {
  return {
    id: entry.runId,
    mode: entry.visualMode,
    itemIds: [entry.item.id],
    startTime: entry.item.startTime,
    endTime: entry.endTime,
    leftPct: entry.leftPct,
    widthPct: entry.widthPct,
    leftPx: entry.leftPx,
    widthPx: entry.widthPx,
    boundaries: [toBoundary(entry)],
  };
}

function buildDenseRun(entries: SubtitleTrackLayoutEntry[], pxPerSec: number): SubtitleTrackLayoutRun {
  const first = entries[0];
  const last = entries[entries.length - 1];
  const startTime = first.item.startTime;
  const endTime = last.endTime;

  return {
    id: `dense:${first.item.id}:${last.item.id}`,
    mode: 'dense',
    itemIds: entries.map((entry) => entry.item.id),
    startTime,
    endTime,
    leftPct: first.leftPct,
    widthPct: last.leftPct + last.widthPct - first.leftPct,
    leftPx: first.leftPx,
    widthPx: Math.max(0, endTime - startTime) * pxPerSec,
    boundaries: entries.map((entry) => toBoundary(entry)),
  };
}

function shouldLinkDenseRun(
  current: DraftEntry,
  next: DraftEntry,
  opts: {
    compactMinPx: number;
    denseMaxGapPx: number;
    denseBoundaryPitchPx: number;
  }
) {
  if (current.standaloneMode === 'normal' || next.standaloneMode === 'normal') {
    return false;
  }

  const currentRightPx = current.leftPx + current.widthPx;
  const gapPx = Math.max(0, next.leftPx - currentRightPx);
  if (gapPx > opts.denseMaxGapPx) {
    return false;
  }

  const startPitchPx = next.leftPx - current.leftPx;
  return (
    current.widthPx < opts.compactMinPx ||
    next.widthPx < opts.compactMinPx ||
    startPitchPx <= opts.denseBoundaryPitchPx
  );
}

export function buildSubtitleTrackLayout(opts: {
  items: SubtitleTrackItem[];
  totalDuration: number;
  pxPerSec?: number;
  zoom?: number;
  basePxPerSec?: number;
  compactMinPx?: number;
  normalMinPx?: number;
  microHitboxPx?: number;
  narrowPx?: number;
  denseMaxGapPx?: number;
  denseBoundaryPitchPx?: number;
}): SubtitleTrackLayoutResult {
  const safeTotalDuration = Math.max(0.001, opts.totalDuration);
  const safeZoom = Math.max(0.01, opts.zoom || 1);
  const basePxPerSec = opts.basePxPerSec ?? 40;
  const pxPerSec = Math.max(1, opts.pxPerSec ?? basePxPerSec * safeZoom);
  const compactMinPx = opts.compactMinPx ?? 8;
  const normalMinPx = opts.normalMinPx ?? 24;
  const microHitboxPx = opts.microHitboxPx ?? 14;
  const narrowPx = opts.narrowPx ?? 24;
  const denseMaxGapPx = opts.denseMaxGapPx ?? 2;
  const denseBoundaryPitchPx = opts.denseBoundaryPitchPx ?? 6;
  const narrowThresholdPct = (narrowPx / pxPerSec / safeTotalDuration) * 100;

  const ordered = opts.items
    .map((item, originalIndex) => ({ item, originalIndex }))
    .sort((a, b) => {
      if (a.item.startTime !== b.item.startTime) {
        return a.item.startTime - b.item.startTime;
      }
      return a.originalIndex - b.originalIndex;
    });

  const drafts: DraftEntry[] = ordered.map(({ item, originalIndex }) => {
    const safeStart = Math.max(0, item.startTime);
    const safeDuration = Math.max(0, item.duration);
    const safeEnd = safeStart + safeDuration;
    const leftPct = (safeStart / safeTotalDuration) * 100;
    const widthPct = (safeDuration / safeTotalDuration) * 100;
    const leftPx = safeStart * pxPerSec;
    const widthPx = safeDuration * pxPerSec;
    const standaloneMode: Exclude<SubtitleTrackVisualMode, 'dense'> =
      widthPx >= normalMinPx ? 'normal' : 'compact';

    const hitboxWidthPx =
      standaloneMode === 'normal' ? widthPx : Math.max(widthPx, microHitboxPx);
    const hitboxWidthPct = (hitboxWidthPx / pxPerSec / safeTotalDuration) * 100;
    const widthGapPct = Math.max(0, hitboxWidthPct - widthPct);
    const hitboxLeftPct = Math.max(0, leftPct - widthGapPct / 2);
    const hitboxInsetPx = Math.max(0, (hitboxWidthPx - widthPx) / 2);

    return {
      item,
      originalIndex,
      leftPct,
      widthPct,
      leftPx,
      widthPx,
      endTime: safeEnd,
      hitboxLeftPct,
      hitboxWidthPct,
      hitboxWidthPx,
      hitboxInsetPx,
      isNarrow: widthPct < narrowThresholdPct,
      standaloneMode,
    };
  });

  const entries: SubtitleTrackLayoutEntry[] = drafts.map((draft) => ({
    ...draft,
    visualMode: draft.standaloneMode,
    runId: draft.item.id,
  }));

  const runs: SubtitleTrackLayoutRun[] = [];

  for (let startIndex = 0; startIndex < drafts.length;) {
    let endIndex = startIndex;

    while (
      endIndex + 1 < drafts.length &&
      shouldLinkDenseRun(drafts[endIndex], drafts[endIndex + 1], {
        compactMinPx,
        denseMaxGapPx,
        denseBoundaryPitchPx,
      })
    ) {
      endIndex += 1;
    }

    if (endIndex > startIndex) {
      const denseEntries = entries.slice(startIndex, endIndex + 1);
      const runId = `dense:${denseEntries[0].item.id}:${denseEntries[denseEntries.length - 1].item.id}`;

      denseEntries.forEach((entry) => {
        entry.visualMode = 'dense';
        entry.runId = runId;
      });

      runs.push(buildDenseRun(denseEntries, pxPerSec));
      startIndex = endIndex + 1;
      continue;
    }

    const entry = entries[startIndex];
    runs.push(buildSingleRun(entry));
    startIndex += 1;
  }

  return {
    entries,
    runs,
  };
}
