import { describe, expect, it } from 'vitest';

import { getSubtitleRowInlineUiModel } from './subtitle-row-inline-ui';

describe('subtitle row inline ui model', () => {
  it('uses two compact actions for stale rows', () => {
    expect(getSubtitleRowInlineUiModel({ state: 'stale', isSelected: false })).toEqual({
      tone: 'warm',
      showHint: true,
      emphasizeHint: false,
      actions: [
        { kind: 'retranslate', emphasis: 'primary', meta: 'credit_1' },
        { kind: 'manual_edit', emphasis: 'secondary', meta: 'free' },
      ],
    });
  });

  it('emphasizes the inline hint only after a blocked preview attempt', () => {
    expect(
      getSubtitleRowInlineUiModel({
        state: 'text_ready',
        isSelected: true,
        showPreviewBlockHint: true,
      }).emphasizeHint
    ).toBe(true);
  });

  it('keeps text_ready actions focused on generate voice first', () => {
    expect(getSubtitleRowInlineUiModel({ state: 'text_ready', isSelected: true }).actions).toEqual([
      { kind: 'generate_voice', emphasis: 'primary', meta: 'credit_2' },
      { kind: 'continue_editing', emphasis: 'secondary', meta: null },
    ]);
  });

  it('keeps audio_ready focused on apply first while still allowing direct regen', () => {
    expect(getSubtitleRowInlineUiModel({ state: 'audio_ready', isSelected: true })).toEqual({
      tone: 'success',
      showHint: true,
      emphasizeHint: false,
      actions: [
        { kind: 'apply_voice', emphasis: 'primary', meta: null },
        { kind: 'generate_voice', emphasis: 'secondary', meta: 'credit_2' },
      ],
    });
  });

  it('shows no extra actions for unselected ready rows', () => {
    expect(getSubtitleRowInlineUiModel({ state: 'ready', isSelected: false })).toEqual({
      tone: 'muted',
      showHint: false,
      emphasizeHint: false,
      actions: [],
    });
  });

  it('keeps selected ready rows lightweight with only two secondary actions', () => {
    expect(getSubtitleRowInlineUiModel({ state: 'ready', isSelected: true }).actions).toEqual([
      { kind: 'retranslate', emphasis: 'secondary', meta: 'credit_1' },
      { kind: 'generate_voice', emphasis: 'secondary', meta: 'credit_2' },
    ]);
  });
});
