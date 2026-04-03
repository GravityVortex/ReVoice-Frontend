const REMOTE_AUDIO_URL_RE = /^https?:\/\//i;
const STORAGE_STREAM_AUDIO_URL_RE = /^\/api\/storage\/stream\?key=/i;
const STORAGE_PROXY_AUDIO_URL_RE = /^\/api\/storage\/proxy\?src=/i;

function appendCacheBust(url: string, cacheBust?: string | number | null | undefined) {
  const cacheValue = String(cacheBust ?? '').trim();
  if (!url || !cacheValue) return url;
  return `${url}${url.includes('?') ? '&' : '?'}t=${encodeURIComponent(cacheValue)}`;
}

export function isPlayableEditorAudioUrl(url: string | null | undefined) {
  if (typeof url !== 'string') return false;
  const normalized = url.trim();
  return (
    REMOTE_AUDIO_URL_RE.test(normalized) ||
    STORAGE_STREAM_AUDIO_URL_RE.test(normalized) ||
    STORAGE_PROXY_AUDIO_URL_RE.test(normalized)
  );
}

export function isPlayableRemoteAudioUrl(url: string | null | undefined) {
  return isPlayableEditorAudioUrl(url);
}

export function buildEditorStorageStreamUrl(args: {
  userId?: string | null | undefined;
  taskId?: string | null | undefined;
  pathName: string;
  cacheBust?: string | number | null | undefined;
}) {
  const userId = String(args.userId || '').trim();
  const taskId = String(args.taskId || '').trim();
  const basePath = String(args.pathName || '').split('?')[0].trim();

  if (!userId || !taskId || !basePath || basePath.startsWith('/')) return '';

  const key = encodeURIComponent(`${userId}/${taskId}/${basePath}`);
  return appendCacheBust(`/api/storage/stream?key=${key}`, args.cacheBust);
}

export function resolvePlayableAuditionUrl(args: { previewAudioUrl?: string; audioUrl?: string }) {
  const previewAudioUrl = String(args.previewAudioUrl || '').trim();
  if (isPlayableEditorAudioUrl(previewAudioUrl)) return previewAudioUrl;

  const audioUrl = String(args.audioUrl || '').trim();
  if (isPlayableEditorAudioUrl(audioUrl)) return audioUrl;

  return '';
}
