import { resolveSourcePlaybackMode } from '@/shared/lib/timeline/split';

import { buildEditorStorageStreamUrl } from './audio-url-utils';

const AUDIO_RESOLVER_LOG_PREFIX = '[AudioResolver]';

type ConvertLike = {
  userId?: string;
  id?: string;
  r2preUrl?: string;
  env?: string;
  vocalAudioUrl?: string;
};

type SourceEntryLike = {
  id?: string;
  start?: string;
  end?: string;
  audio_url?: string;
  vap_source_mode?: string;
};

type ResolvedAudioCandidate = {
  url: string;
  source: 'source_segment' | 'vocal_fallback';
};

type ResolveSourceAuditionArgs = {
  convertObj: ConvertLike | null | undefined;
  sourceEntry: SourceEntryLike | null | undefined;
  index?: number;
};

type ResolveEditorPublicAudioUrlArgs = {
  convertObj: ConvertLike | null | undefined;
  pathName: string;
  cacheBust?: string | number | null | undefined;
};

type ResolveSourceAuditionResult = {
  primary: ResolvedAudioCandidate | null;
  fallback: ResolvedAudioCandidate | null;
  stopAtSec: number | null;
};

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

function appendCacheBust(url: string, cacheBust?: string | number | null | undefined) {
  const cacheValue = String(cacheBust ?? '').trim();
  if (!url || !cacheValue) return url;
  return `${url}${url.includes('?') ? '&' : '?'}t=${encodeURIComponent(cacheValue)}`;
}

function splitQuery(pathName: string) {
  const [base = '', query = ''] = String(pathName || '').split('?');
  return {
    base: base.trim(),
    query: query.trim(),
  };
}

function logAudioResolver(event: string, meta: Record<string, unknown>) {
  if (process.env.NODE_ENV === 'test') return;
  console.debug(AUDIO_RESOLVER_LOG_PREFIX, event, meta);
}

function toSeconds(srt: string) {
  const raw = trimString(srt);
  if (!raw) return null;
  const [hms, ms = '0'] = raw.split(',');
  const [h = '0', m = '0', sec = '0'] = hms.split(':');
  const hh = Number.parseInt(h, 10);
  const mm = Number.parseInt(m, 10);
  const ss = Number.parseInt(sec, 10);
  const mss = Number.parseInt(ms, 10);
  if ([hh, mm, ss, mss].some((part) => Number.isNaN(part))) return null;
  return hh * 3600 + mm * 60 + ss + mss / 1000;
}

export function resolveEditorPublicAudioUrl(args: ResolveEditorPublicAudioUrlArgs) {
  const { base, query } = splitQuery(args.pathName);
  if (!base) return '';

  if (/^https?:\/\//i.test(base)) {
    return appendCacheBust(base + (query ? `?${query}` : ''), args.cacheBust);
  }

  const userId = trimString(args.convertObj?.userId);
  const taskId = trimString(args.convertObj?.id);
  const publicBase = trimTrailingSlash(trimString(args.convertObj?.r2preUrl));
  const env = trimString(args.convertObj?.env);

  if (!publicBase || !env || !userId || !taskId) {
    const streamUrl = buildEditorStorageStreamUrl({
      userId,
      taskId,
      pathName: base + (query ? `?${query}` : ''),
      cacheBust: args.cacheBust,
    });
    logAudioResolver('public-url-fallback', {
      pathName: base,
      hasPublicBase: Boolean(publicBase),
      hasEnv: Boolean(env),
      hasUserId: Boolean(userId),
      hasTaskId: Boolean(taskId),
      usesStreamFallback: Boolean(streamUrl),
    });
    return streamUrl;
  }

  const joined = `${publicBase}/${env}/${userId}/${taskId}/${base}`;
  const withQuery = query ? `${joined}?${query}` : joined;
  return appendCacheBust(withQuery, args.cacheBust);
}

export function resolveSourceAuditionAudio(args: ResolveSourceAuditionArgs): ResolveSourceAuditionResult {
  const convertObj = args.convertObj;
  const sourceEntry = args.sourceEntry;
  const sourceId = trimString(sourceEntry?.id) || String((args.index ?? 0) + 1);
  const sourceMode = resolveSourcePlaybackMode(sourceEntry);
  const stopAtSec = toSeconds(trimString(sourceEntry?.end)) ?? null;
  const vocalAudioUrl = trimString(convertObj?.vocalAudioUrl);

  const sourcePath =
    trimString(sourceEntry?.audio_url) ||
    (sourceId ? `split_audio/audio/${sourceId}.wav` : '');
  const sourceSegmentUrl = resolveEditorPublicAudioUrl({
    convertObj,
    pathName: sourcePath,
  });

  const sourceCandidate = sourceSegmentUrl
    ? { url: sourceSegmentUrl, source: 'source_segment' as const }
    : null;
  const fallbackCandidate = vocalAudioUrl
    ? { url: vocalAudioUrl, source: 'vocal_fallback' as const }
    : null;

  if (sourceMode === 'fallback_vocal') {
    const result = {
      primary: fallbackCandidate,
      fallback: sourceCandidate,
      stopAtSec,
    };
    logAudioResolver('resolve-source-audition', {
      clipId: sourceId,
      mode: sourceMode,
      primary: result.primary?.source ?? null,
      fallback: result.fallback?.source ?? null,
    });
    return result;
  }

  const result = {
    primary: sourceCandidate,
    fallback: fallbackCandidate,
    stopAtSec,
  };
  logAudioResolver('resolve-source-audition', {
    clipId: sourceId,
    mode: sourceMode,
    primary: result.primary?.source ?? null,
    fallback: result.fallback?.source ?? null,
  });
  return result;
}
