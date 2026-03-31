export type SubtitleVoiceUiState = 'ready' | 'stale' | 'text_ready' | 'audio_ready' | 'processing';

export type SubtitleVoiceStateInput = {
  persistedText: string;
  effectiveText: string;
  persistedAudioPath?: string;
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

export type SubtitleVoiceRequirementInput = {
  voiceStatus?: unknown;
  needsTts?: unknown;
  persistedAudioPath?: unknown;
};

export function isSplitDerivedRow(input: SubtitleVoiceStateInput): boolean {
  return Boolean(input.splitParentId || input.splitOperationId);
}

export function hasPersistedVoiceAudio(input: Pick<SubtitleVoiceRequirementInput, 'persistedAudioPath'>): boolean {
  return typeof input.persistedAudioPath === 'string' && input.persistedAudioPath.trim().length > 0;
}

export function requiresVoiceGeneration(input: SubtitleVoiceRequirementInput): boolean {
  const status = typeof input.voiceStatus === 'string' ? input.voiceStatus : '';
  return input.needsTts === true || status === 'failed' || (status === 'missing' && !hasPersistedVoiceAudio(input));
}

export function shouldBlockVoicePlayback(state: SubtitleVoiceUiState): boolean {
  return state === 'stale' || state === 'text_ready' || state === 'processing';
}

export function shouldBlockTranslatedPreview(state: SubtitleVoiceUiState): boolean {
  return shouldBlockVoicePlayback(state);
}

export function deriveSubtitleVoiceUiState(input: SubtitleVoiceStateInput): SubtitleVoiceUiState {
  if (input.isProcessing || input.isSaving) return 'processing';
  const hasDraftAudio = Boolean(input.draftAudioPath || input.customDraftAudioPath);
  const hasValidDraftAudio = hasDraftAudio && !input.isDraftAudioInvalidated;
  if (hasValidDraftAudio) return 'audio_ready';
  const textChanged = input.effectiveText !== input.persistedText;
  const needsVoiceGeneration = requiresVoiceGeneration({
    voiceStatus: input.voiceStatus,
    needsTts: input.needsTts,
    persistedAudioPath: input.persistedAudioPath,
  });
  if ((textChanged || input.isTextPreparedForVoice) && !hasValidDraftAudio) return 'text_ready';
  if (isSplitDerivedRow(input) && needsVoiceGeneration) return 'stale';
  if (needsVoiceGeneration) return 'text_ready';
  return 'ready';
}
