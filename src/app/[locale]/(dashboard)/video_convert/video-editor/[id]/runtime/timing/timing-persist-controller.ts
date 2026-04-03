import {
  reconcilePendingTimingAfterPersist,
  reconcilePendingTimingMap,
  remapSubtitleIdAfterTimingSave,
} from '../../video-editor-structural-edit';

export type PendingTimingMap = Record<string, { startMs: number; endMs: number }>;

export type PendingTimingPersistItem = {
  id: string;
  startMs: number;
  endMs: number;
};

export function buildPendingTimingPersistItems(pendingTimingMap: PendingTimingMap): PendingTimingPersistItem[] {
  return Object.entries(pendingTimingMap).map(([id, value]) => ({
    id,
    startMs: value.startMs,
    endMs: value.endMs,
  }));
}

export function resolveTimingPersistSuccess(args: {
  currentPendingTimingMap: PendingTimingMap;
  requestedItems: PendingTimingPersistItem[];
  response: any;
  convertRows: any[];
  nowMs: number;
}) {
  const nextIdMap = ((args.response?.data?.idMap ?? {}) as Record<string, string>) || {};
  const touchedIds = new Set(args.requestedItems.map((item) => item.id));
  const nextConvertRows = (Array.isArray(args.convertRows) ? args.convertRows : []).map((row) => {
    const id = typeof row?.id === 'string' ? row.id : '';
    if (!id) return row;

    const mapped = nextIdMap[id];
    const nextId = typeof mapped === 'string' && mapped.length > 0 ? mapped : id;
    const shouldMark = touchedIds.has(id);

    if (nextId === id && !shouldMark) return row;

    const nextRow = { ...row };
    if (nextId !== id) nextRow.id = nextId;
    if (shouldMark) nextRow.timing_rev_ms = args.nowMs;
    return nextRow;
  });

  return {
    nextPendingTimingMap: reconcilePendingTimingAfterPersist({
      currentPendingTimingMap: args.currentPendingTimingMap,
      requestedItems: args.requestedItems,
      idMap: nextIdMap,
    }),
    nextConvertRows,
    nextIdMap,
    persistedAtMs: args.nowMs,
  };
}

export function reconcileTimingAfterRollback(args: {
  currentPendingTimingMap: PendingTimingMap;
  restoredRows: Array<{ id?: string; start?: string; end?: string }>;
}) {
  // High Fix #6: Clean up pending timings for deleted rows after rollback
  const restoredIdSet = new Set(
    args.restoredRows
      .map((row) => (typeof row?.id === 'string' ? row.id : ''))
      .filter((id) => id.length > 0)
  );

  const nextMap: PendingTimingMap = {};
  for (const [id, timing] of Object.entries(args.currentPendingTimingMap)) {
    if (restoredIdSet.has(id)) {
      nextMap[id] = timing;
    }
  }

  return reconcilePendingTimingMap(nextMap, args.restoredRows);
}

export function remapTimingSubtitleIdAfterPersist(subtitleId: string, idMap?: Record<string, string>) {
  return remapSubtitleIdAfterTimingSave(subtitleId, idMap);
}
