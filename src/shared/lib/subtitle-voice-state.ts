export type SubtitleVoiceUiState = 'ready' | 'stale' | 'text_ready' | 'audio_ready' | 'processing';

export type SubtitleVoiceStateInput = {
  persistedText: string;
  effectiveText: string;
  voiceStatus?: string;
  needsTts?: boolean;
  splitParentId?: string;
  splitOperationId?: string;
  draftAudioPath?: string;
  customDraftAudioPath?: string;
  isProcessing?: boolean;
  isSaving?: boolean;
  isDraftAudioInvalidated?: boolean;
  isTextPreparedForVoice?: boolean;
};

export function isSplitDerivedRow(input: SubtitleVoiceStateInput): boolean {
  return Boolean(input.splitParentId || input.splitOperationId);
}

export function shouldBlockTranslatedPreview(state: SubtitleVoiceUiState): boolean {
  return state === 'stale' || state === 'text_ready';
}

export function deriveSubtitleVoiceUiState(input: SubtitleVoiceStateInput): SubtitleVoiceUiState {
  if (input.isProcessing || input.isSaving) return 'processing';
  const hasDraftAudio = Boolean(input.draftAudioPath || input.customDraftAudioPath);
  const hasValidDraftAudio = hasDraftAudio && !input.isDraftAudioInvalidated;
  if (hasValidDraftAudio) return 'audio_ready';
  const textChanged = input.effectiveText !== input.persistedText;
  if ((textChanged || input.isTextPreparedForVoice) && !hasValidDraftAudio) return 'text_ready';
  if (isSplitDerivedRow(input) && (input.voiceStatus === 'missing' || input.needsTts)) return 'stale';
  return 'ready';
}
