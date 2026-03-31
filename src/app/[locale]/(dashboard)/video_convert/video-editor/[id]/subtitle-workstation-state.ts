import type { SubtitleVoiceUiState } from '@/shared/lib/subtitle-voice-state';

type LinkedSubtitleIdentity = {
  id?: string;
  sourceId?: string;
};

type SourceEditableSubtitleIdentity = LinkedSubtitleIdentity & {
  text_source?: string;
};

type SubtitleAsyncResultInput = {
  currentText: string;
  requestTextSnapshot: string;
};

function readTrimmedId(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export function resolveLinkedSourceId(item: LinkedSubtitleIdentity | null | undefined) {
  return readTrimmedId(item?.sourceId) || readTrimmedId(item?.id);
}

export function getPendingSourceSaveEntries(
  items: SourceEditableSubtitleIdentity[],
  pendingSourceSaveMap: Record<string, number>
) {
  const itemBySourceId = new Map<string, SourceEditableSubtitleIdentity>();

  for (const item of items) {
    const sourceId = resolveLinkedSourceId(item);
    if (sourceId) itemBySourceId.set(sourceId, item);
  }

  return Object.entries(pendingSourceSaveMap).flatMap(([sourceId, editedAtMsRaw]) => {
    const editedAtMs =
      typeof editedAtMsRaw === 'number' ? editedAtMsRaw : Number.parseInt(String(editedAtMsRaw || ''), 10);
    if (!Number.isFinite(editedAtMs) || editedAtMs <= 0) return [];

    const item = itemBySourceId.get(sourceId);
    if (!item) return [];

    return [
      {
        sourceId,
        text: typeof item.text_source === 'string' ? item.text_source : '',
        editedAtMs,
      },
    ];
  });
}

function buildTranslatedIdRemap(previousItems: LinkedSubtitleIdentity[], nextItems: LinkedSubtitleIdentity[]) {
  const nextIdBySourceId = new Map<string, string>();
  const nextIdById = new Map<string, string>();

  for (const item of nextItems) {
    const nextId = readTrimmedId(item?.id);
    if (!nextId) continue;
    nextIdById.set(nextId, nextId);
    const nextSourceId = resolveLinkedSourceId(item);
    if (nextSourceId) nextIdBySourceId.set(nextSourceId, nextId);
  }

  const idMap = new Map<string, string>();

  for (const item of previousItems) {
    const previousId = readTrimmedId(item?.id);
    if (!previousId) continue;

    if (nextIdById.has(previousId)) {
      idMap.set(previousId, previousId);
      continue;
    }

    const sourceId = resolveLinkedSourceId(item);
    const remappedId = sourceId ? nextIdBySourceId.get(sourceId) : undefined;
    if (remappedId) {
      idMap.set(previousId, remappedId);
    }
  }

  return idMap;
}

export function remapSubtitleIdSetBySourceId(
  ids: Set<string>,
  previousItems: LinkedSubtitleIdentity[],
  nextItems: LinkedSubtitleIdentity[]
) {
  const idMap = buildTranslatedIdRemap(previousItems, nextItems);
  const next = new Set<string>();

  ids.forEach((id) => {
    const remappedId = idMap.get(id);
    if (remappedId) next.add(remappedId);
  });

  return next;
}

export function remapSubtitleIdRecordBySourceId<T>(
  record: Record<string, T>,
  previousItems: LinkedSubtitleIdentity[],
  nextItems: LinkedSubtitleIdentity[]
) {
  const idMap = buildTranslatedIdRemap(previousItems, nextItems);
  const next: Record<string, T> = {};

  for (const [id, value] of Object.entries(record)) {
    const remappedId = idMap.get(id);
    if (remappedId) next[remappedId] = value;
  }

  return next;
}

export function shouldApplySubtitleAsyncResult(args: SubtitleAsyncResultInput) {
  return args.currentText === args.requestTextSnapshot;
}

export function hasSubtitleWorkstationDirtyState(args: {
  rowVoiceStates: SubtitleVoiceUiState[];
  pendingAppliedVoiceCount: number;
  pendingSourceSaveCount: number;
}) {
  const hasPendingVoiceWork = args.rowVoiceStates.some((state) => {
    return state === 'stale' || state === 'text_ready' || state === 'audio_ready' || state === 'processing';
  });

  return hasPendingVoiceWork || args.pendingAppliedVoiceCount > 0 || args.pendingSourceSaveCount > 0;
}
