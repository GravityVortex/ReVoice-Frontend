export type TaskProgressStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | (string & {});

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function parseNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(n)) return null;
  return n;
}

function normalizeStep(step: unknown) {
  return String(step || '').trim().toLowerCase();
}

// Our pipeline is mostly fixed. We use this order to estimate a friendly percentage
// when backend progress is missing or unreliable.
const APPROX_STEP_ORDER = [
  'upload_complete',
  'split_audio_video',
  'split_vocal_bkground',
  'gen_srt',
  'translate_srt',
  'split_audio',
  'tts',
  'adj_audio_time',
  'merge_audios',
  'merge_audio_video',
] as const;

function stepIndex(step: string) {
  if (!step) return -1;
  return APPROX_STEP_ORDER.findIndex((k) => step === k || step.includes(k));
}

export function estimateTaskPercent({
  status,
  progress,
  currentStep,
}: {
  status?: TaskProgressStatus | null;
  progress?: unknown;
  currentStep?: unknown;
}) {
  const s = String(status || 'pending').toLowerCase();

  if (s === 'completed') return 100;

  const rawProgress = parseNumber(progress);
  if (rawProgress != null) {
    const p = clamp(rawProgress, 0, 100);
    if (s === 'processing') return Math.round(clamp(p, 5, 99));
    if (s === 'pending') return Math.round(clamp(p, 0, 20));
    if (s === 'failed' || s === 'cancelled') return Math.round(clamp(p, 0, 99));
    return Math.round(p);
  }

  const step = normalizeStep(currentStep);
  const idx = stepIndex(step);
  if (idx >= 0) {
    // Keep a buffer so we don't claim "100%" before we actually finish.
    const total = Math.max(1, APPROX_STEP_ORDER.length);
    const p = clamp(Math.round((idx / total) * 100), 0, 95);
    if (s === 'pending') return clamp(p, 0, 20);
    if (s === 'processing') return clamp(p, 5, 95);
    if (s === 'failed' || s === 'cancelled') return clamp(p, 0, 95);
    return p;
  }

  if (s === 'processing') return 60;
  if (s === 'pending') return 6;
  return 0;
}
