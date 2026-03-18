import { describe, expect, it } from 'vitest';

import { deriveSubtitleVoiceUiState, shouldBlockTranslatedPreview } from './subtitle-voice-state';

const base = {
  persistedText: 'hello',
  effectiveText: 'hello',
};

describe('subtitle voice UI state', () => {
  it('prefers processing over every other state', () => {
    expect(deriveSubtitleVoiceUiState({ ...base, isProcessing: true })).toBe('processing');
  });

  it('keeps processing priority even when audio, text, and stale markers coexist', () => {
    expect(
      deriveSubtitleVoiceUiState({
        ...base,
        isProcessing: true,
        splitParentId: 'a',
        voiceStatus: 'missing',
        effectiveText: 'world',
        draftAudioPath: 'path.wav',
      })
    ).toBe('processing');
  });

  it('treats isSaving alone as processing', () => {
    expect(deriveSubtitleVoiceUiState({ ...base, isSaving: true })).toBe('processing');
  });

  it('treats split rows with splitParentId + missing voice as stale', () => {
    expect(deriveSubtitleVoiceUiState({ ...base, splitParentId: 'a', voiceStatus: 'missing' })).toBe('stale');
  });

  it('treats split rows with splitOperationId + missing voice as stale', () => {
    expect(deriveSubtitleVoiceUiState({ ...base, splitOperationId: 'b', voiceStatus: 'missing' })).toBe('stale');
  });

  it('treats split rows with needsTts=true as stale even without missing status', () => {
    expect(deriveSubtitleVoiceUiState({ ...base, splitParentId: 'a', needsTts: true })).toBe('stale');
  });

  it('does not treat non-split rows as stale only because needsTts is true', () => {
    expect(deriveSubtitleVoiceUiState({ ...base, needsTts: true })).toBe('ready');
  });

  it('does not treat non-split rows with missing voiceStatus as stale', () => {
    expect(deriveSubtitleVoiceUiState({ ...base, voiceStatus: 'missing' })).toBe('ready');
  });

  it('returns audio_ready when a valid draft audio path exists', () => {
    expect(deriveSubtitleVoiceUiState({ ...base, draftAudioPath: 'adj_audio_time/0001.wav' })).toBe('audio_ready');
  });

  it('returns audio_ready when a valid customDraftAudioPath exists', () => {
    expect(deriveSubtitleVoiceUiState({ ...base, customDraftAudioPath: 'custom/path.wav' })).toBe('audio_ready');
  });

  it('lets audio_ready override stale when split rows also have a valid draft audio', () => {
    expect(
      deriveSubtitleVoiceUiState({
        ...base,
        splitParentId: 'a',
        voiceStatus: 'missing',
        draftAudioPath: 'path.wav',
      })
    ).toBe('audio_ready');
  });

  it('lets audio_ready override text_ready when text changed but a valid draft audio still exists', () => {
    expect(
      deriveSubtitleVoiceUiState({
        ...base,
        draftAudioPath: 'path.wav',
        effectiveText: 'other',
      })
    ).toBe('audio_ready');
  });

  it('enters text_ready when effectiveText differs from persistedText', () => {
    expect(
      deriveSubtitleVoiceUiState({
        ...base,
        effectiveText: 'world',
      })
    ).toBe('text_ready');
  });

  it('enters text_ready when AI marked textPreparedForVoiceIds even if text is identical', () => {
    expect(
      deriveSubtitleVoiceUiState({
        ...base,
        isTextPreparedForVoice: true,
      })
    ).toBe('text_ready');
  });

  it('lets text_ready override stale when split rows changed text and have no valid draft audio', () => {
    expect(
      deriveSubtitleVoiceUiState({
        ...base,
        splitParentId: 'a',
        voiceStatus: 'missing',
        effectiveText: 'world',
      })
    ).toBe('text_ready');
  });

  it('drops from audio_ready to text_ready when draft audio was invalidated', () => {
    expect(
      deriveSubtitleVoiceUiState({
        ...base,
        draftAudioPath: 'path.wav',
        isDraftAudioInvalidated: true,
        effectiveText: 'world',
      })
    ).toBe('text_ready');
  });

  it('falls back to ready when no condition matches', () => {
    expect(deriveSubtitleVoiceUiState({ ...base })).toBe('ready');
  });

  it('blocks translated preview only for stale and text_ready', () => {
    expect(shouldBlockTranslatedPreview('stale')).toBe(true);
    expect(shouldBlockTranslatedPreview('text_ready')).toBe(true);
    expect(shouldBlockTranslatedPreview('ready')).toBe(false);
    expect(shouldBlockTranslatedPreview('audio_ready')).toBe(false);
    expect(shouldBlockTranslatedPreview('processing')).toBe(false);
  });

  it('does not map failed voice status into stale by itself', () => {
    expect(
      deriveSubtitleVoiceUiState({
        ...base,
        voiceStatus: 'failed',
        splitParentId: 'a',
      })
    ).toBe('ready');
  });

  it('lets audio_ready override stale when has draft audio and split row with text change', () => {
    expect(
      deriveSubtitleVoiceUiState({
        ...base,
        splitParentId: 'a',
        voiceStatus: 'missing',
        effectiveText: 'world',
        draftAudioPath: 'path.wav',
      })
    ).toBe('audio_ready');
  });

  it('returns ready after the caller patches saved audio as the new baseline', () => {
    expect(
      deriveSubtitleVoiceUiState({
        persistedText: 'saved text',
        effectiveText: 'saved text',
        voiceStatus: 'ready',
        needsTts: false,
        splitParentId: 'a',
      })
    ).toBe('ready');
  });
});
