import type { SubtitleVoiceUiState } from './subtitle-voice-state';

export type SubtitleRowStatusLabelKey =
  | 'status.stale'
  | 'status.splitStale'
  | 'status.textReady'
  | 'status.splitTextReady'
  | 'status.audioReady'
  | 'status.splitAudioReady'
  | 'status.processing';

type SubtitleRowStatusInput = {
  isSplit: boolean;
  state: SubtitleVoiceUiState;
};

type SubtitleRowStatusOptions = {
  hasLabel?: (key: SubtitleRowStatusLabelKey) => boolean;
};

export type CompactSubtitleRowStatusModel = {
  labelKey: SubtitleRowStatusLabelKey | null;
  showLabel: boolean;
};

function getFallbackLabelKey(key: SubtitleRowStatusLabelKey | null): SubtitleRowStatusLabelKey | null {
  switch (key) {
    case 'status.splitStale':
      return 'status.stale';
    case 'status.splitTextReady':
      return 'status.textReady';
    case 'status.splitAudioReady':
      return 'status.audioReady';
    default:
      return key;
  }
}

export function getSubtitleRowStatusLabelKey(
  input: SubtitleRowStatusInput,
  options: SubtitleRowStatusOptions = {}
): SubtitleRowStatusLabelKey | null {
  const { isSplit, state } = input;
  let labelKey: SubtitleRowStatusLabelKey | null;

  if (isSplit) {
    switch (state) {
      case 'stale':
        labelKey = 'status.splitStale';
        break;
      case 'text_ready':
        labelKey = 'status.splitTextReady';
        break;
      case 'audio_ready':
        labelKey = 'status.splitAudioReady';
        break;
      case 'processing':
        labelKey = 'status.processing';
        break;
      default:
        labelKey = null;
    }
  } else {
    switch (state) {
      case 'stale':
        labelKey = 'status.stale';
        break;
      case 'text_ready':
        labelKey = 'status.textReady';
        break;
      case 'audio_ready':
        labelKey = 'status.audioReady';
        break;
      case 'processing':
        labelKey = 'status.processing';
        break;
      default:
        labelKey = null;
    }
  }

  if (labelKey && options.hasLabel && !options.hasLabel(labelKey)) {
    return getFallbackLabelKey(labelKey);
  }

  return labelKey;
}

export function getCompactSubtitleRowStatusModel(
  input: SubtitleRowStatusInput,
  options: SubtitleRowStatusOptions = {}
): CompactSubtitleRowStatusModel {
  const labelKey = getSubtitleRowStatusLabelKey(input, options);

  return {
    labelKey,
    showLabel: input.isSplit && labelKey !== null,
  };
}
