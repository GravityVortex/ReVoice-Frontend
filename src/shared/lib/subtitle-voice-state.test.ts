import { describe, expect, it } from 'vitest';

import { deriveSubtitleVoiceUiState, shouldBlockTranslatedPreview, shouldBlockVoicePlayback } from './subtitle-voice-state';

describe('deriveSubtitleVoiceUiState', () => {
  it('marks non-split rows that still need voice generation as text_ready', () => {
    const state = deriveSubtitleVoiceUiState({
      persistedText: '字幕文本',
      effectiveText: '字幕文本',
      needsTts: true,
      persistedAudioPath: '',
    });

    expect(state).toBe('text_ready');
    expect(shouldBlockTranslatedPreview(state)).toBe(true);
  });

  it('marks failed non-split rows as text_ready so translated preview stays blocked', () => {
    const state = deriveSubtitleVoiceUiState({
      persistedText: '字幕文本',
      effectiveText: '字幕文本',
      voiceStatus: 'failed',
      persistedAudioPath: '',
    });

    expect(state).toBe('text_ready');
    expect(shouldBlockTranslatedPreview(state)).toBe(true);
  });

  it('keeps rows with an existing persisted voice in ready state when backend status is stale but playback is still available', () => {
    const state = deriveSubtitleVoiceUiState({
      persistedText: '字幕文本',
      effectiveText: '字幕文本',
      voiceStatus: 'missing',
      persistedAudioPath: 'adj_audio_time/clip-1.wav',
    });

    expect(state).toBe('ready');
    expect(shouldBlockTranslatedPreview(state)).toBe(false);
  });

  it('blocks translated playback while voice generation is still processing', () => {
    const state = deriveSubtitleVoiceUiState({
      persistedText: '字幕文本',
      effectiveText: '新的字幕文本',
      isProcessing: true,
    });

    expect(state).toBe('processing');
    expect(shouldBlockTranslatedPreview(state)).toBe(true);
    expect(shouldBlockVoicePlayback(state)).toBe(true);
  });
});
