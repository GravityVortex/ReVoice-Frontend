import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/shared/hooks/use-paused-video-prefetch', () => ({
  usePausedVideoPrefetch: () => undefined,
}));

import { VideoPreviewPanel } from './video-preview-panel';

describe('VideoPreviewPanel', () => {
  it('renders the active subtitle from the transport snapshot', () => {
    const html = renderToStaticMarkup(
      <VideoPreviewPanel
        transportSnapshot={{
          currentTimeSec: 4,
          playbackStatus: 'paused',
          activeTimelineClipIndex: 1,
          activeAuditionClipIndex: null,
          auditionMode: null,
          autoPlayNext: false,
        }}
        subtitleTrack={[
          {
            id: 'clip-1',
            text: '第一条字幕',
            startTime: 0,
            duration: 2,
          },
          {
            id: 'clip-2',
            text: '第二条字幕',
            startTime: 2,
            duration: 2,
          },
        ]}
      />
    );

    expect(html).toContain('第二条字幕');
    expect(html).not.toContain('第一条字幕');
  });
});
