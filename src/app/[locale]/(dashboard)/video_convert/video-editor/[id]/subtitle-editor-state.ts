import type { SubtitleTrackItem } from '@/shared/components/video-editor/types';

import type { SubtitleRowData } from './subtitle-row-item';

export type EditorSubtitleTrackItem = SubtitleTrackItem & {
  sourceId?: string;
};

type PendingTimingEntry = {
  startMs: number;
  endMs: number;
};

type MatchableItem = {
  id?: string;
  sourceId?: string;
};

function buildLookup<T extends MatchableItem>(items: T[]) {
  const byId = new Map<string, T>();
  const bySourceId = new Map<string, T>();

  for (const item of items) {
    const id = typeof item?.id === 'string' ? item.id : '';
    if (id) byId.set(id, item);

    const sourceId = typeof item?.sourceId === 'string' ? item.sourceId : '';
    if (sourceId) bySourceId.set(sourceId, item);
  }

  return { byId, bySourceId };
}

function matchLocalItem<T extends MatchableItem>(lookup: ReturnType<typeof buildLookup<T>>, item: MatchableItem) {
  const id = typeof item?.id === 'string' ? item.id : '';
  if (id && lookup.byId.has(id)) return lookup.byId.get(id);

  const sourceId = typeof item?.sourceId === 'string' ? item.sourceId : '';
  if (sourceId && lookup.bySourceId.has(sourceId)) return lookup.bySourceId.get(sourceId);

  return undefined;
}

function preferLocalString(localValue: string | undefined, loadedValue: string | undefined) {
  return typeof localValue === 'string' ? localValue : loadedValue;
}

function preferLocalBoolean(localValue: boolean | undefined, loadedValue: boolean | undefined) {
  return localValue ?? loadedValue;
}

export function mergeLoadedSubtitleItems(localItems: SubtitleRowData[], loadedItems: SubtitleRowData[]) {
  const lookup = buildLookup(localItems);

  return loadedItems.map((loadedItem) => {
    const localItem = matchLocalItem(lookup, loadedItem);
    if (!localItem) return loadedItem;

    return {
      ...loadedItem,
      text_source: preferLocalString(localItem.text_source, loadedItem.text_source) ?? '',
      text_convert: preferLocalString(localItem.text_convert, loadedItem.text_convert) ?? '',
      persistedText_convert:
        preferLocalString(localItem.persistedText_convert, loadedItem.persistedText_convert) ?? loadedItem.persistedText_convert,
      audioUrl_convert: preferLocalString(localItem.audioUrl_convert, loadedItem.audioUrl_convert) ?? '',
      audioUrl_convert_custom: preferLocalString(localItem.audioUrl_convert_custom, loadedItem.audioUrl_convert_custom),
      voiceStatus: preferLocalString(localItem.voiceStatus, loadedItem.voiceStatus),
      needsTts: preferLocalBoolean(localItem.needsTts, loadedItem.needsTts),
      draftAudioPath: preferLocalString(localItem.draftAudioPath, loadedItem.draftAudioPath),
      newTime: preferLocalString(localItem.newTime, loadedItem.newTime) ?? '',
    };
  });
}

export function mergeLoadedConvertedTrackItems(
  localItems: EditorSubtitleTrackItem[],
  loadedItems: EditorSubtitleTrackItem[],
  options?: {
    pendingTimingMap?: Record<string, PendingTimingEntry>;
  }
) {
  const lookup = buildLookup(localItems);
  const pendingTimingMap = options?.pendingTimingMap;

  return loadedItems.map((loadedItem) => {
    const localItem = matchLocalItem(lookup, loadedItem);
    if (!localItem) return loadedItem;

    const localId = typeof localItem.id === 'string' ? localItem.id : '';
    const loadedId = typeof loadedItem.id === 'string' ? loadedItem.id : '';
    const pendingTimingEntry = (localId && pendingTimingMap?.[localId]) || (loadedId && pendingTimingMap?.[loadedId]);
    const nextStartTime =
      pendingTimingEntry && Number.isFinite(pendingTimingEntry.startMs)
        ? pendingTimingEntry.startMs / 1000
        : loadedItem.startTime;
    const nextDuration =
      pendingTimingEntry && Number.isFinite(pendingTimingEntry.startMs) && Number.isFinite(pendingTimingEntry.endMs)
        ? Math.max(0, (pendingTimingEntry.endMs - pendingTimingEntry.startMs) / 1000)
        : loadedItem.duration;

    return {
      ...loadedItem,
      startTime: nextStartTime,
      duration: nextDuration,
      text: preferLocalString(localItem.text, loadedItem.text) ?? '',
      audioUrl: preferLocalString(localItem.audioUrl, loadedItem.audioUrl),
      previewAudioUrl: preferLocalString(localItem.previewAudioUrl, loadedItem.previewAudioUrl),
    };
  });
}

export function mergeLoadedSourceTrackItems(localItems: EditorSubtitleTrackItem[], loadedItems: EditorSubtitleTrackItem[]) {
  const lookup = buildLookup(localItems);

  return loadedItems.map((loadedItem) => {
    const localItem = matchLocalItem(lookup, loadedItem);
    if (!localItem) return loadedItem;

    return {
      ...loadedItem,
      text: preferLocalString(localItem.text, loadedItem.text) ?? '',
    };
  });
}
