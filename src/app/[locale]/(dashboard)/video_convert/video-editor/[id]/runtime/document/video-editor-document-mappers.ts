import type { ConvertObj, TrackItem } from '@/shared/components/video-editor/types';
import { resolveSplitTranslatedAudioPath } from '@/shared/lib/timeline/split';

import { resolveEditorPublicAudioUrl } from '../../audio-source-resolver';
import {
  mergeLoadedConvertedTrackItems,
  mergeLoadedSourceTrackItems,
  type EditorSubtitleTrackItem,
} from '../../subtitle-editor-state';

export type VideoEditorTrackLabels = {
  mainVideo: string;
  bgm: string;
};

export type VideoEditorDocumentTrackLabels = {
  videoTrackName: string;
  bgmTrackName: string;
};

export function parseSrtTimeToSeconds(value: unknown) {
  if (typeof value !== 'string' || value.length === 0) return 0;

  const parts = value.split(':');
  if (parts.length !== 3) return 0;

  const [hours, minutes, secondPart] = parts;
  const [seconds, milliseconds] = (secondPart || '0').split(/[.,]/);
  const hh = Number.parseInt(hours || '0', 10) || 0;
  const mm = Number.parseInt(minutes || '0', 10) || 0;
  const ss = Number.parseInt(seconds || '0', 10) || 0;
  const ms = Number.parseInt(milliseconds || '0', 10) || 0;

  return hh * 3600 + mm * 60 + ss + ms / 1000;
}

export function formatSecondsToSrtTime(seconds: number) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const totalMs = Math.round(safeSeconds * 1000);
  const ms = totalMs % 1000;
  const totalSec = (totalMs - ms) / 1000;
  const sec = totalSec % 60;
  const totalMin = (totalSec - sec) / 60;
  const min = totalMin % 60;
  const hour = (totalMin - min) / 60;

  return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function buildResolvedTrackLabels(args: {
  trackLabels?: VideoEditorDocumentTrackLabels;
  labels?: VideoEditorTrackLabels;
}): VideoEditorTrackLabels {
  if (args.labels) return args.labels;

  return {
    mainVideo: args.trackLabels?.videoTrackName ?? 'Main Video',
    bgm: args.trackLabels?.bgmTrackName ?? 'BGM',
  };
}

function buildDraftPreviewUrl(pathName: string, cacheBust?: string) {
  const base = typeof pathName === 'string' ? pathName.split('?')[0].trim() : '';
  if (!base) return '';
  return cacheBust ? `${base}?t=${encodeURIComponent(cacheBust)}` : base;
}

function buildTranslatedAudioUrls(convertObj: (ConvertObj & { r2preUrl?: string; env?: string }), entry: any) {
  const draftPathRaw =
    typeof entry?.vap_draft_audio_path === 'string' ? String(entry?.vap_draft_audio_path || '').trim() : '';
  const draftPath = draftPathRaw ? draftPathRaw.split('?')[0] : '';
  const pathName = resolveSplitTranslatedAudioPath({ ...entry, vap_draft_audio_path: draftPath });

  const updatedAtMsRaw = entry?.vap_tts_updated_at_ms;
  const updatedAtMs = typeof updatedAtMsRaw === 'number' ? updatedAtMsRaw : Number.parseInt(String(updatedAtMsRaw || ''), 10);
  const cacheBuster = Number.isFinite(updatedAtMs) && updatedAtMs > 0 ? String(updatedAtMs) : '';
  const normalizedPath = typeof pathName === 'string' ? pathName.trim() : '';
  if (!normalizedPath) {
    return {
      audioUrl: '',
      previewAudioUrl: '',
    };
  }

  const previewAudioUrl = buildDraftPreviewUrl(normalizedPath, cacheBuster);

  if (/^https?:\/\//i.test(normalizedPath)) {
    const resolvedUrl = resolveEditorPublicAudioUrl({
      convertObj,
      pathName: normalizedPath,
      cacheBust: cacheBuster,
    });
    return {
      audioUrl: resolvedUrl,
      previewAudioUrl: resolvedUrl,
    };
  }

  const publicBase = typeof convertObj.r2preUrl === 'string' ? convertObj.r2preUrl.trim() : '';
  const env = typeof convertObj.env === 'string' ? convertObj.env.trim() : '';
  const userId = typeof convertObj.userId === 'string' ? convertObj.userId.trim() : '';
  const taskId = typeof convertObj.id === 'string' ? convertObj.id.trim() : '';

  if (!publicBase || !env || !userId || !taskId) {
    return {
      audioUrl: '',
      previewAudioUrl,
    };
  }

  const resolvedUrl = resolveEditorPublicAudioUrl({
    convertObj,
    pathName: normalizedPath,
    cacheBust: cacheBuster,
  });

  return {
    audioUrl: resolvedUrl,
    previewAudioUrl: resolvedUrl || previewAudioUrl,
  };
}

export function mapConvertObjToEditorDocument(args: {
  convertObj: (ConvertObj & { r2preUrl?: string; env?: string }) | null;
  previousDocumentId?: string | null;
  trackLabels?: VideoEditorDocumentTrackLabels;
  labels?: VideoEditorTrackLabels;
  previousSubtitleTrack?: EditorSubtitleTrackItem[];
  previousSubtitleTrackOriginal?: EditorSubtitleTrackItem[];
  pendingTimingMap?: Record<string, { startMs: number; endMs: number }>;
}) {
  const { convertObj, previousDocumentId, previousSubtitleTrack, previousSubtitleTrackOriginal, pendingTimingMap } = args;
  const resolvedTrackLabels = buildResolvedTrackLabels(args);

  if (!convertObj) {
    return {
      videoTrack: [] as TrackItem[],
      bgmTrack: [] as TrackItem[],
      subtitleTrack: [] as EditorSubtitleTrackItem[],
      subtitleTrackOriginal: [] as EditorSubtitleTrackItem[],
      totalDuration: 0,
    };
  }

  const videoTrack: TrackItem[] = convertObj.noSoundVideoUrl
    ? [
        {
          id: 'video-main',
          type: 'video',
          name: resolvedTrackLabels.mainVideo,
          url: convertObj.noSoundVideoUrl,
          startTime: 0,
          duration: convertObj.processDurationSeconds,
          volume: 100,
        },
      ]
    : [];

  const bgmTrack: TrackItem[] = convertObj.backgroundAudioUrl
    ? [
        {
          id: 'bgm-main',
          type: 'bgm',
          name: resolvedTrackLabels.bgm,
          url: convertObj.backgroundAudioUrl,
          startTime: 0,
          duration: convertObj.processDurationSeconds,
          volume: 80,
        },
      ]
    : [];

  const mappedSubtitleTrack: EditorSubtitleTrackItem[] = (convertObj.srt_convert_arr || []).map((entry, index) => {
    const start = parseSrtTimeToSeconds(entry.start);
    const end = parseSrtTimeToSeconds(entry.end);
    const sourceEntry = convertObj.srt_source_arr?.[index];
    const draftText = typeof entry?.vap_draft_txt === 'string' ? String(entry?.vap_draft_txt || '') : '';
    const splitOperationId =
      typeof entry?.vap_split_operation_id === 'string' && entry?.vap_split_operation_id
        ? String(entry?.vap_split_operation_id)
        : undefined;
    const translatedAudioUrls = buildTranslatedAudioUrls(convertObj, entry);

    return {
      id: entry.id,
      sourceId: sourceEntry?.id,
      type: 'video',
      name: `Sub ${index + 1}`,
      startTime: start,
      duration: Math.max(0, end - start),
      text: draftText || entry.txt,
      fontSize: 16,
      color: '#ffffff',
      audioUrl: translatedAudioUrls.audioUrl,
      previewAudioUrl: translatedAudioUrls.previewAudioUrl,
      splitOperationId,
    };
  });

  const canReusePreviousTracks = Boolean(previousDocumentId) && previousDocumentId === convertObj.id;
  const subtitleTrack = previousSubtitleTrack
    && canReusePreviousTracks
    ? mergeLoadedConvertedTrackItems(previousSubtitleTrack, mappedSubtitleTrack, { pendingTimingMap })
    : mappedSubtitleTrack;

  const mappedSubtitleTrackOriginal: EditorSubtitleTrackItem[] = (convertObj.srt_source_arr || []).map((entry, index) => {
    const start = parseSrtTimeToSeconds(entry.start);
    const end = parseSrtTimeToSeconds(entry.end);

    return {
      id: entry.id,
      sourceId: entry.id,
      type: 'audio',
      name: `Src ${index + 1}`,
      startTime: start,
      duration: Math.max(0, end - start),
      text: entry.txt || '',
    };
  });

  const subtitleTrackOriginal = previousSubtitleTrackOriginal
    && canReusePreviousTracks
    ? mergeLoadedSourceTrackItems(previousSubtitleTrackOriginal, mappedSubtitleTrackOriginal)
    : mappedSubtitleTrackOriginal;

  return {
    videoTrack,
    bgmTrack,
    subtitleTrack,
    subtitleTrackOriginal,
    totalDuration: convertObj.processDurationSeconds,
  };
}
