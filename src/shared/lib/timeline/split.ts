const LEGACY_ID_RE = /^(\d+)_([0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{3})_([0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{3})$/;

type SplitChildIdsInput = {
  id: string;
  leftStartMs: number;
  leftEndMs: number;
  rightStartMs: number;
  rightEndMs: number;
};

type SplitSubtitlePayloadInput = {
  clipId: string;
  splitAtMs: number;
  translate: any[];
  source: any[];
  effectiveConvertText: string;
  splitOperationId: string;
  nowMs: number;
  sourceAudioSplit?: {
    leftPath: string;
    leftDuration: number;
    rightPath: string;
    rightDuration: number;
  } | null;
};

type SplitSubtitlePayloadOutput = {
  translate: any[];
  source: any[];
  splitIndex: number;
  newIds: {
    leftTranslateId: string;
    rightTranslateId: string;
    leftSourceId: string;
    rightSourceId: string;
  };
  pendingVoiceIds: string[];
};

type AudioSplitChildInfo = { audioPath: string; duration: number };

function msToLegacyIdTime(msInput: number) {
  const msSafe = Number.isFinite(msInput) ? Math.max(0, Math.round(msInput)) : 0;
  const ms = msSafe % 1000;
  const totalSec = (msSafe - ms) / 1000;
  const sec = totalSec % 60;
  const totalMin = (totalSec - sec) / 60;
  const min = totalMin % 60;
  const h = (totalMin - min) / 60;
  return `${String(h).padStart(2, '0')}-${String(min).padStart(2, '0')}-${String(sec).padStart(2, '0')}-${String(ms).padStart(3, '0')}`;
}

function msToSrtTime(msInput: number) {
  const msSafe = Number.isFinite(msInput) ? Math.max(0, Math.round(msInput)) : 0;
  const ms = msSafe % 1000;
  const totalSec = (msSafe - ms) / 1000;
  const sec = totalSec % 60;
  const totalMin = (totalSec - sec) / 60;
  const min = totalMin % 60;
  const h = (totalMin - min) / 60;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function reindexSeqInPlace(rows: any[]) {
  rows.forEach((row, index) => {
    if (row && typeof row === 'object') row.seq = String(index + 1);
  });
}

function makeTranslateChild(
  base: any,
  nextId: string,
  startMs: number,
  endMs: number,
  effectiveConvertText: string,
  splitOperationId: string,
  nowMs: number,
  translateParentId: string,
  ttsReferenceSubtitleId: string,
) {
  return {
    ...base,
    id: nextId,
    start: msToSrtTime(startMs),
    end: msToSrtTime(endMs),
    txt: effectiveConvertText,
    timing_rev_ms: nowMs,
    audio_url: '',
    vap_draft_audio_path: '',
    vap_draft_txt: effectiveConvertText,
    vap_tts_job_id: '',
    vap_tts_request_key: '',
    vap_tr_job_id: '',
    vap_tr_request_key: '',
    vap_tr_updated_at_ms: undefined,
    vap_voice_status: 'missing',
    vap_needs_tts: true,
    vap_split_parent_id: translateParentId,
    vap_tts_reference_subtitle_id: ttsReferenceSubtitleId,
    vap_split_operation_id: splitOperationId,
    audio_rev_ms: undefined,
    vap_draft_duration: undefined,
    vap_tts_updated_at_ms: undefined,
  };
}

function makeSourceChild(base: any, nextId: string, startMs: number, endMs: number, splitOperationId: string, parentId: string, audioSplit?: AudioSplitChildInfo) {
  return {
    ...base,
    id: nextId,
    start: msToSrtTime(startMs),
    end: msToSrtTime(endMs),
    audio_url: audioSplit?.audioPath || '',
    vap_source_mode: audioSplit?.audioPath ? 'segment_first' : 'fallback_vocal',
    vap_source_segment_missing: !audioSplit?.audioPath,
    vap_source_split_parent_id: parentId,
    vap_split_operation_id: splitOperationId,
  };
}

export function buildSplitChildIds(input: SplitChildIdsInput) {
  const match = input.id.match(LEGACY_ID_RE);
  if (!match) {
    throw new Error(`unsupported subtitle id: ${input.id}`);
  }
  const prefix = match[1];
  return {
    left: `${prefix}0001_${msToLegacyIdTime(input.leftStartMs)}_${msToLegacyIdTime(input.leftEndMs)}`,
    right: `${prefix}0002_${msToLegacyIdTime(input.rightStartMs)}_${msToLegacyIdTime(input.rightEndMs)}`,
  };
}

export function splitSubtitlePayload(input: SplitSubtitlePayloadInput): SplitSubtitlePayloadOutput {
  const splitIndex = input.translate.findIndex((row) => row?.id === input.clipId);
  if (splitIndex < 0) {
    throw new Error(`clip not found: ${input.clipId}`);
  }
  const translateTarget = input.translate[splitIndex];
  const sourceTarget = input.source[splitIndex];
  if (!translateTarget || !sourceTarget) {
    throw new Error('split source/translate rows are misaligned');
  }

  const startMs = Math.max(0, Math.round(Number(String(translateTarget.start).split(':').join('').replace(',', ''))));
  void startMs;
  const leftStartMs = timeToMs(translateTarget.start);
  const leftEndMs = input.splitAtMs;
  const rightStartMs = input.splitAtMs;
  const rightEndMs = timeToMs(translateTarget.end);

  const translateIds = buildSplitChildIds({
    id: translateTarget.id,
    leftStartMs,
    leftEndMs,
    rightStartMs,
    rightEndMs,
  });
  const sourceIds = buildSplitChildIds({
    id: sourceTarget.id,
    leftStartMs,
    leftEndMs,
    rightStartMs,
    rightEndMs,
  });

  const leftSourceAudio = input.sourceAudioSplit
    ? { audioPath: input.sourceAudioSplit.leftPath, duration: input.sourceAudioSplit.leftDuration }
    : undefined;
  const rightSourceAudio = input.sourceAudioSplit
    ? { audioPath: input.sourceAudioSplit.rightPath, duration: input.sourceAudioSplit.rightDuration }
    : undefined;

  const leftTtsRef = input.sourceAudioSplit ? sourceIds.left : sourceTarget.id;
  const rightTtsRef = input.sourceAudioSplit ? sourceIds.right : sourceTarget.id;

  const translateNext = input.translate.slice();
  translateNext.splice(
    splitIndex,
    1,
    makeTranslateChild(
      translateTarget,
      translateIds.left,
      leftStartMs,
      leftEndMs,
      input.effectiveConvertText,
      input.splitOperationId,
      input.nowMs,
      translateTarget.id,
      leftTtsRef,
    ),
    makeTranslateChild(
      translateTarget,
      translateIds.right,
      rightStartMs,
      rightEndMs,
      input.effectiveConvertText,
      input.splitOperationId,
      input.nowMs,
      translateTarget.id,
      rightTtsRef,
    ),
  );

  const sourceNext = input.source.slice();
  sourceNext.splice(
    splitIndex,
    1,
    makeSourceChild(sourceTarget, sourceIds.left, leftStartMs, leftEndMs, input.splitOperationId, sourceTarget.id, leftSourceAudio),
    makeSourceChild(sourceTarget, sourceIds.right, rightStartMs, rightEndMs, input.splitOperationId, sourceTarget.id, rightSourceAudio),
  );

  reindexSeqInPlace(translateNext);
  reindexSeqInPlace(sourceNext);

  return {
    translate: translateNext,
    source: sourceNext,
    splitIndex,
    newIds: {
      leftTranslateId: translateIds.left,
      rightTranslateId: translateIds.right,
      leftSourceId: sourceIds.left,
      rightSourceId: sourceIds.right,
    },
    pendingVoiceIds: [translateIds.left, translateIds.right],
  };
}

export function collectMissingVoiceIds(rows: any[]) {
  const out: string[] = [];
  for (const row of rows) {
    const id = row?.id;
    if (typeof id !== 'string' || !id) continue;
    const hasExplicitStatus = typeof row?.vap_voice_status === 'string' || typeof row?.vap_needs_tts === 'boolean';
    if (!hasExplicitStatus) continue;
    const status = String(row?.vap_voice_status || '');
    if (row?.vap_needs_tts === true || status === 'missing' || status === 'failed') {
      out.push(id);
    }
  }
  return out;
}

function timeToMs(srt: string) {
  const [hms, msStr] = String(srt || '00:00:00,000').split(',');
  const [h, m, s] = hms.split(':').map((part) => Number(part || 0));
  return (((h * 60 + m) * 60 + s) * 1000) + Number(msStr || 0);
}


export function resolveSplitTranslatedAudioPath(row: any) {
  const draftPath = typeof row?.vap_draft_audio_path === 'string' ? row.vap_draft_audio_path.trim() : '';
  if (draftPath) return draftPath;

  const explicitStatus = typeof row?.vap_voice_status === 'string' ? row.vap_voice_status : '';
  if (explicitStatus === 'missing' || explicitStatus === 'failed' || row?.vap_needs_tts === true) {
    return '';
  }

  const persistedPath = typeof row?.audio_url === 'string' ? row.audio_url.trim() : '';
  if (persistedPath) return persistedPath;

  const id = typeof row?.id === 'string' ? row.id : '';
  return id ? `adj_audio_time/${id}.wav` : '';
}

export function resolveSourcePlaybackMode(row: any) {
  const explicitMode = typeof row?.vap_source_mode === 'string' ? row.vap_source_mode : '';
  if (explicitMode) return explicitMode;
  return 'segment_first';
}
