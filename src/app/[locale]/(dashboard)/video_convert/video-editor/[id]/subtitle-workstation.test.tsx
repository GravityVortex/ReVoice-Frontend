import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type MockRow = {
  order: number;
  id: string;
  sourceId: string;
  startTime_source: string;
  endTime_source: string;
  text_source: string;
  audioUrl_source: string;
  startTime_convert: string;
  endTime_convert: string;
  text_convert: string;
  persistedText_convert?: string;
  audioUrl_convert: string;
  newTime: string;
};

let seededRows: MockRow[] = [];
let useStateCallCount = 0;
const capturedRowProps: Array<Record<string, any>> = [];

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');

  return {
    ...actual,
    useState: ((initial: unknown) => {
      useStateCallCount += 1;
      if (useStateCallCount === 1) {
        return actual.useState(seededRows as unknown as typeof initial);
      }
      return actual.useState(initial);
    }) as typeof actual.useState,
  };
});

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const translator = ((key: string) => key) as ((key: string) => string) & {
      has: (key: string) => boolean;
    };
    translator.has = () => true;
    return translator;
  },
}));

vi.mock('@/shared/contexts/app', () => ({
  useAppContext: () => ({
    fetchUserCredits: vi.fn(),
  }),
}));

vi.mock('./subtitle-row-item', () => ({
  SubtitleRowItem: (props: Record<string, any>) => {
    capturedRowProps.push(props);
    return null;
  },
}));

import { SubtitleWorkstation } from './subtitle-workstation';

describe('SubtitleWorkstation', () => {
  beforeEach(() => {
    seededRows = [
      {
        order: 0,
        id: 'clip-1',
        sourceId: 'clip-1',
        startTime_source: '00:00:01,000',
        endTime_source: '00:00:02,000',
        text_source: 'source text',
        audioUrl_source: 'split_audio/audio/clip-1.wav',
        startTime_convert: '00:00:01,000',
        endTime_convert: '00:00:02,000',
        text_convert: 'convert text',
        persistedText_convert: 'convert text',
        audioUrl_convert: 'adj_audio_time/clip-1.wav',
        newTime: '',
      },
    ];
    useStateCallCount = 0;
    capturedRowProps.length = 0;
  });

  it('invokes onRequestAuditionPlay when the row triggers source playback', () => {
    const onRequestAuditionPlay = vi.fn();

    renderToStaticMarkup(
      <SubtitleWorkstation
        convertObj={{ id: 'task-1', targetLanguage: 'en' } as any}
        onRequestAuditionPlay={onRequestAuditionPlay}
      />
    );

    expect(capturedRowProps).toHaveLength(1);

    capturedRowProps[0].onPlayPauseSource();

    expect(onRequestAuditionPlay).toHaveBeenCalledWith(0, 'source');
  });

  it('invokes onRequestAuditionToggle when the same clip is already auditioning', () => {
    const onRequestAuditionToggle = vi.fn();

    renderToStaticMarkup(
      <SubtitleWorkstation
        convertObj={{ id: 'task-1', targetLanguage: 'en' } as any}
        auditionPlayingIndex={0}
        auditionActiveType="source"
        onRequestAuditionToggle={onRequestAuditionToggle}
      />
    );

    expect(capturedRowProps).toHaveLength(1);

    capturedRowProps[0].onPlayPauseSource();

    expect(onRequestAuditionToggle).toHaveBeenCalledTimes(1);
  });
});
