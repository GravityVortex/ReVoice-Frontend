import type { ConvertObj, SubtitleTrackItem, TrackItem } from '@/shared/components/video-editor/types';
import { collectMissingVoiceIds } from '@/shared/lib/timeline/split';

export type PendingVoiceEntry = {
  id: string;
  updatedAtMs: number;
};

export type PendingTimingEntry = {
  startMs: number;
  endMs: number;
};

export type ServerMergePendingState = {
  audio: Set<string>;
  timing: Set<string>;
  any: Set<string>;
};

export type DocumentPendingState = {
  serverMergePending: ServerMergePendingState;
  explicitMissingVoiceIdSet: Set<string>;
  localPendingVoiceIdSet: Set<string>;
  playbackBlockedVoiceIdSet: Set<string>;
  pendingVoiceIdSet: Set<string>;
  pendingTimingIdSet: Set<string>;
  pendingMergeIdSet: Set<string>;
  pendingTimingCount: number;
  pendingMergeCount: number;
  pendingMergeVoiceCount: number;
  pendingMergeTimingCount: number;
  hasUnsavedChanges: boolean;
};

export type ActiveVideoEditorDocumentState = {
  convertObj: ConvertObj | null;
  videoTrack: TrackItem[];
  bgmTrack: TrackItem[];
  subtitleTrack: SubtitleTrackItem[];
  subtitleTrackOriginal: SubtitleTrackItem[];
  pendingTimingMap: Record<string, PendingTimingEntry>;
  pendingTimingCount: number;
  serverLastMergedAtMs: number;
  documentPendingState: DocumentPendingState;
  documentDuration: number;
};

function parseRevisionMs(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value) : 0;
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function deriveServerMergePending(args: {
  convertRows: any[];
  serverLastMergedAtMs: number;
}): ServerMergePendingState {
  const audio = new Set<string>();
  const timing = new Set<string>();
  const any = new Set<string>();
  const baseline = args.serverLastMergedAtMs;
  const rows = Array.isArray(args.convertRows) ? args.convertRows : [];

  for (const row of rows) {
    const id = typeof row?.id === 'string' ? row.id : '';
    if (!id) continue;

    const audioRevMs = parseRevisionMs(row?.audio_rev_ms);
    const timingRevMs = parseRevisionMs(row?.timing_rev_ms);

    if (audioRevMs > baseline) audio.add(id);
    if (timingRevMs > baseline) timing.add(id);
    if (Math.max(audioRevMs, timingRevMs) > baseline) any.add(id);
  }

  return { audio, timing, any };
}

export function deriveExplicitMissingVoiceIdSet(convertRows: any[]) {
  return new Set(collectMissingVoiceIds(Array.isArray(convertRows) ? convertRows : []));
}

export function deriveLocalPendingVoiceIdSet(args: {
  pendingVoiceEntries: PendingVoiceEntry[];
  serverLastMergedAtMs: number;
}) {
  const out = new Set<string>();
  const entries = Array.isArray(args.pendingVoiceEntries) ? args.pendingVoiceEntries : [];

  for (const entry of entries) {
    const id = typeof entry?.id === 'string' ? entry.id.trim() : '';
    const updatedAtMs = parseRevisionMs(entry?.updatedAtMs);
    if (!id || updatedAtMs <= args.serverLastMergedAtMs) continue;
    out.add(id);
  }

  return out;
}

export function derivePlaybackBlockedVoiceIdSet(playbackBlockedVoiceIds: string[]) {
  const out = new Set<string>();
  const ids = Array.isArray(playbackBlockedVoiceIds) ? playbackBlockedVoiceIds : [];

  for (const id of ids) {
    if (typeof id === 'string' && id.length > 0) out.add(id);
  }

  return out;
}

export function deriveDocumentPendingState(args: {
  pendingVoiceEntries: PendingVoiceEntry[];
  pendingTimingMap: Record<string, PendingTimingEntry>;
  playbackBlockedVoiceIds: string[];
  convertRows: any[];
  workstationDirty: boolean;
  serverLastMergedAtMs: number;
}): DocumentPendingState {
  const serverMergePending = deriveServerMergePending({
    convertRows: args.convertRows,
    serverLastMergedAtMs: args.serverLastMergedAtMs,
  });
  const explicitMissingVoiceIdSet = deriveExplicitMissingVoiceIdSet(args.convertRows);
  const localPendingVoiceIdSet = deriveLocalPendingVoiceIdSet({
    pendingVoiceEntries: args.pendingVoiceEntries,
    serverLastMergedAtMs: args.serverLastMergedAtMs,
  });
  const playbackBlockedVoiceIdSet = derivePlaybackBlockedVoiceIdSet(args.playbackBlockedVoiceIds);

  const pendingVoiceIdSet = new Set<string>();
  for (const id of serverMergePending.audio) pendingVoiceIdSet.add(id);
  for (const id of localPendingVoiceIdSet) pendingVoiceIdSet.add(id);
  for (const id of explicitMissingVoiceIdSet) pendingVoiceIdSet.add(id);

  const pendingTimingIdSet = new Set<string>();
  for (const id of serverMergePending.timing) pendingTimingIdSet.add(id);
  for (const id of Object.keys(args.pendingTimingMap || {})) pendingTimingIdSet.add(id);

  const pendingMergeIdSet = new Set<string>();
  for (const id of pendingVoiceIdSet) pendingMergeIdSet.add(id);
  for (const id of pendingTimingIdSet) pendingMergeIdSet.add(id);

  const pendingTimingCount = Object.keys(args.pendingTimingMap || {}).length;
  const pendingMergeCount = pendingMergeIdSet.size;
  const pendingMergeVoiceCount = pendingVoiceIdSet.size;
  const pendingMergeTimingCount = pendingTimingIdSet.size;

  return {
    serverMergePending,
    explicitMissingVoiceIdSet,
    localPendingVoiceIdSet,
    playbackBlockedVoiceIdSet,
    pendingVoiceIdSet,
    pendingTimingIdSet,
    pendingMergeIdSet,
    pendingTimingCount,
    pendingMergeCount,
    pendingMergeVoiceCount,
    pendingMergeTimingCount,
    hasUnsavedChanges: args.workstationDirty || pendingMergeCount > 0 || pendingTimingCount > 0,
  };
}

export function createEmptyDocumentPendingState(): DocumentPendingState {
  return {
    serverMergePending: {
      audio: new Set<string>(),
      timing: new Set<string>(),
      any: new Set<string>(),
    },
    explicitMissingVoiceIdSet: new Set<string>(),
    localPendingVoiceIdSet: new Set<string>(),
    playbackBlockedVoiceIdSet: new Set<string>(),
    pendingVoiceIdSet: new Set<string>(),
    pendingTimingIdSet: new Set<string>(),
    pendingMergeIdSet: new Set<string>(),
    pendingTimingCount: 0,
    pendingMergeCount: 0,
    pendingMergeVoiceCount: 0,
    pendingMergeTimingCount: 0,
    hasUnsavedChanges: false,
  };
}

export function getActiveVideoEditorDocumentState(args: {
  convertId: string;
  convertObj: ConvertObj | null;
  videoTrack: TrackItem[];
  bgmTrack: TrackItem[];
  subtitleTrack: SubtitleTrackItem[];
  subtitleTrackOriginal: SubtitleTrackItem[];
  pendingTimingMap: Record<string, PendingTimingEntry>;
  pendingTimingCount: number;
  serverLastMergedAtMs: number;
  documentPendingState: DocumentPendingState;
  documentDuration: number;
}): ActiveVideoEditorDocumentState {
  if (typeof args.convertObj?.id !== 'string' || args.convertObj.id !== args.convertId) {
    return {
      convertObj: null,
      videoTrack: [],
      bgmTrack: [],
      subtitleTrack: [],
      subtitleTrackOriginal: [],
      pendingTimingMap: {},
      pendingTimingCount: 0,
      serverLastMergedAtMs: 0,
      documentPendingState: createEmptyDocumentPendingState(),
      documentDuration: 0,
    };
  }

  return {
    convertObj: args.convertObj,
    videoTrack: args.videoTrack,
    bgmTrack: args.bgmTrack,
    subtitleTrack: args.subtitleTrack,
    subtitleTrackOriginal: args.subtitleTrackOriginal,
    pendingTimingMap: args.pendingTimingMap,
    pendingTimingCount: args.pendingTimingCount,
    serverLastMergedAtMs: args.serverLastMergedAtMs,
    documentPendingState: args.documentPendingState,
    documentDuration: args.documentDuration,
  };
}
