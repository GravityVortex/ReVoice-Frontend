import { describe, expect, it } from 'vitest';

import { getCompactSubtitleRowStatusModel, getSubtitleRowStatusLabelKey } from './subtitle-row-status';

describe('subtitle row status model', () => {
  it('returns the split audio_ready label for split rows in compact mode', () => {
    expect(getCompactSubtitleRowStatusModel({ isSplit: true, state: 'audio_ready' })).toMatchObject({
      labelKey: 'status.splitAudioReady',
      showLabel: true,
    });
  });

  it('falls back to generic audio_ready key when split-specific copy is unavailable', () => {
    expect(
      getSubtitleRowStatusLabelKey(
        { isSplit: true, state: 'audio_ready' },
        { hasLabel: (key) => key !== 'status.splitAudioReady' }
      )
    ).toBe('status.audioReady');
  });

  it('falls back to generic text_ready key when split-specific copy is unavailable', () => {
    expect(
      getSubtitleRowStatusLabelKey(
        { isSplit: true, state: 'text_ready' },
        { hasLabel: (key) => key !== 'status.splitTextReady' }
      )
    ).toBe('status.textReady');
  });

  it('keeps regular rows icon-only in compact mode', () => {
    expect(getCompactSubtitleRowStatusModel({ isSplit: false, state: 'audio_ready' })).toEqual({
      labelKey: 'status.audioReady',
      showLabel: false,
    });
  });

  it('does not render any compact badge for ready split rows', () => {
    expect(getCompactSubtitleRowStatusModel({ isSplit: true, state: 'ready' })).toEqual({
      labelKey: null,
      showLabel: false,
    });
  });
});
