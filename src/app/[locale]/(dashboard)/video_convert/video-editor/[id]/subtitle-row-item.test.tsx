import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const translator = ((key: string) => key) as ((key: string) => string) & {
      has: (key: string) => boolean;
    };
    translator.has = () => true;
    return translator;
  },
}));

import { SubtitleRowItem, type SubtitleRowData } from './subtitle-row-item';

function makeItem(overrides: Partial<SubtitleRowData> = {}): SubtitleRowData {
  return {
    order: 0,
    id: 'clip-1',
    sourceId: 'source-1',
    startTime_source: '00:00:01,000',
    endTime_source: '00:00:02,000',
    text_source: 'source text',
    audioUrl_source: 'split_audio/audio/source-1.wav',
    startTime_convert: '00:00:01,000',
    endTime_convert: '00:00:02,000',
    text_convert: 'convert text',
    persistedText_convert: 'convert text',
    audioUrl_convert: 'adj_audio_time/clip-1.wav',
    newTime: '',
    ...overrides,
  };
}

describe('SubtitleRowItem', () => {
  it('disables both source and translated textareas while the row is generating or saving', () => {
    const html = renderToStaticMarkup(
      <SubtitleRowItem
        item={makeItem()}
        isSelected
        isPlayingSource={false}
        isPlayingConvert={false}
        convertingType="translate_srt"
        uiVoiceState="processing"
        onSelect={vi.fn()}
        onUpdate={vi.fn()}
        onPlayPauseSource={vi.fn()}
        onPlayPauseConvert={vi.fn()}
        onConvert={vi.fn()}
        onSave={vi.fn()}
      />
    );

    expect(html.match(/<textarea/g)).toHaveLength(2);
    expect(html.match(/disabled=""/g)).toHaveLength(2);
  });
});
