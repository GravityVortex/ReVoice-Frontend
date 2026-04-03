import { isPlayableEditorAudioUrl } from './audio-url-utils';

export type PlaybackGateUnavailableReason = 'missing' | 'needs_regen' | 'server_failed';

export type SubtitlePlaybackGateState =
  | { kind: 'ready' }
  | {
      kind: 'voice_unavailable';
      clipIndex: number;
      subtitleId: string;
      reason: PlaybackGateUnavailableReason;
    };

type EvaluateSubtitlePlaybackGateArgs = {
  clipIndex: number;
  subtitleId: string;
  audioUrl: string;
  voiceStatus?: string;
  needsTts?: boolean;
};

function readTrimmedString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function hasPlayableAudioPath(audioUrl: string) {
  return isPlayableEditorAudioUrl(readTrimmedString(audioUrl));
}

function hasAuditionPreviewAudioPath(audioUrl: string) {
  return hasPlayableAudioPath(audioUrl);
}

export function evaluateSubtitlePlaybackGate(
  args: EvaluateSubtitlePlaybackGateArgs
): SubtitlePlaybackGateState {
  const { clipIndex, subtitleId, audioUrl, voiceStatus: rawVoiceStatus, needsTts = false } = args;
  const voiceStatus = readTrimmedString(rawVoiceStatus);

  if (needsTts) {
    return {
      kind: 'voice_unavailable',
      clipIndex,
      subtitleId,
      reason: 'needs_regen',
    };
  }

  if (voiceStatus === 'failed') {
    return {
      kind: 'voice_unavailable',
      clipIndex,
      subtitleId,
      reason: 'server_failed',
    };
  }

  if (voiceStatus === 'missing' && !hasPlayableAudioPath(audioUrl)) {
    return {
      kind: 'voice_unavailable',
      clipIndex,
      subtitleId,
      reason: 'missing',
    };
  }

  if (!hasPlayableAudioPath(audioUrl)) {
    return {
      kind: 'voice_unavailable',
      clipIndex,
      subtitleId,
      reason: 'missing',
    };
  }

  return {
    kind: 'ready',
  };
}

export type PlaybackGateSubtitleRow = {
  vap_draft_audio_path?: string | null;
  audio_url?: string | null;
  vap_voice_status?: string | null;
  vap_needs_tts?: boolean | string | number | null;
};

type EvaluateClipVoiceAvailabilityArgs = {
  clipId: string;
  row: PlaybackGateSubtitleRow | null;
  pendingVoiceIdSet: Set<string>;
  blockingVoiceIdSet?: Set<string>;
  explicitMissingVoiceIdSet: Set<string>;
  audioUrl?: string;
};

function readBooleanFlag(value: unknown) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

export function evaluateClipVoiceAvailability(
  args: EvaluateClipVoiceAvailabilityArgs
): SubtitlePlaybackGateState {
  const { clipId, row, pendingVoiceIdSet, blockingVoiceIdSet, explicitMissingVoiceIdSet, audioUrl: rawAudioUrl } = args;
  const isPendingVoice = pendingVoiceIdSet.has(clipId);
  const isLocallyBlocked = blockingVoiceIdSet?.has(clipId) ?? false;
  const isExplicitMissing = explicitMissingVoiceIdSet.has(clipId);
  const audioUrl = isExplicitMissing
    ? ''
    : readTrimmedString(rawAudioUrl) ||
      readTrimmedString(row?.vap_draft_audio_path) ||
      readTrimmedString(row?.audio_url);

  return evaluateSubtitlePlaybackGate({
    clipIndex: -1,
    subtitleId: clipId,
    audioUrl,
    voiceStatus:
      isExplicitMissing || isPendingVoice || isLocallyBlocked
        ? readTrimmedString(row?.vap_voice_status) || 'missing'
        : row?.vap_voice_status ?? undefined,
    needsTts: isPendingVoice || isLocallyBlocked || readBooleanFlag(row?.vap_needs_tts),
  });
}

export function evaluateClipConvertAuditionAvailability(
  args: EvaluateClipVoiceAvailabilityArgs
): SubtitlePlaybackGateState {
  const gate = evaluateClipVoiceAvailability(args);
  if (gate.kind === 'ready') return gate;

  const hasDraftPreviewAudio = hasAuditionPreviewAudioPath(readTrimmedString(args.audioUrl));
  const isPendingVoice = args.pendingVoiceIdSet.has(args.clipId);
  const isLocallyBlocked = args.blockingVoiceIdSet?.has(args.clipId) ?? false;
  const isExplicitMissing = args.explicitMissingVoiceIdSet.has(args.clipId);

  if (hasDraftPreviewAudio && !isLocallyBlocked && (isExplicitMissing || isPendingVoice)) {
    return { kind: 'ready' };
  }

  return gate;
}
