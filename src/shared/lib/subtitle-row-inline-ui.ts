import type { SubtitleVoiceUiState } from './subtitle-voice-state';

export type SubtitleRowInlineActionKind = 'retranslate' | 'manual_edit' | 'generate_voice' | 'continue_editing' | 'apply_voice';

export type SubtitleRowInlineAction = {
  kind: SubtitleRowInlineActionKind;
  emphasis: 'primary' | 'secondary';
  meta: 'credit_1' | 'credit_2' | 'free' | null;
};

export type SubtitleRowInlineUiModel = {
  tone: 'muted' | 'warm' | 'accent' | 'success';
  showHint: boolean;
  emphasizeHint: boolean;
  actions: SubtitleRowInlineAction[];
};

type GetSubtitleRowInlineUiModelInput = {
  state: SubtitleVoiceUiState;
  isSelected: boolean;
  showPreviewBlockHint?: boolean;
};

export function getSubtitleRowInlineUiModel(input: GetSubtitleRowInlineUiModelInput): SubtitleRowInlineUiModel {
  const { state, isSelected, showPreviewBlockHint = false } = input;

  if (state === 'stale') {
    return {
      tone: 'warm',
      showHint: true,
      emphasizeHint: showPreviewBlockHint,
      actions: [
        { kind: 'retranslate', emphasis: 'primary', meta: 'credit_1' },
        { kind: 'manual_edit', emphasis: 'secondary', meta: 'free' },
      ],
    };
  }

  if (state === 'text_ready') {
    return {
      tone: 'accent',
      showHint: true,
      emphasizeHint: showPreviewBlockHint,
      actions: [
        { kind: 'generate_voice', emphasis: 'primary', meta: 'credit_2' },
        { kind: 'continue_editing', emphasis: 'secondary', meta: null },
      ],
    };
  }

  if (state === 'audio_ready') {
    return {
      tone: 'success',
      showHint: true,
      emphasizeHint: false,
      actions: [{ kind: 'apply_voice', emphasis: 'primary', meta: null }],
    };
  }

  if (state === 'processing') {
    return {
      tone: 'muted',
      showHint: true,
      emphasizeHint: false,
      actions: [],
    };
  }

  return {
    tone: 'muted',
    showHint: false,
    emphasizeHint: false,
    actions: isSelected
      ? [
          { kind: 'retranslate', emphasis: 'secondary', meta: 'credit_1' },
          { kind: 'generate_voice', emphasis: 'secondary', meta: 'credit_2' },
        ]
      : [],
  };
}
