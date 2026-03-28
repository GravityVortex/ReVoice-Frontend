import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { SubtitleTrack } from './subtitle-track';

describe('SubtitleTrack', () => {
  it('renders adjacent high-density clips as one dense run with internal boundaries', () => {
    const html = renderToStaticMarkup(
      <SubtitleTrack
        items={[
          {
            id: 'micro-1',
            type: 'video',
            name: 'Micro 1',
            text: '第一条',
            startTime: 114.84,
            duration: 0.1,
          },
          {
            id: 'micro-2',
            type: 'video',
            name: 'Micro 2',
            text: '第二条',
            startTime: 114.94,
            duration: 0.06,
          },
          {
            id: 'micro-3',
            type: 'video',
            name: 'Micro 3',
            text: '第三条',
            startTime: 115,
            duration: 0.04,
          },
        ]}
        totalDuration={120}
        currentTime={0}
        pxPerSec={50}
      />
    );

    expect(html).toContain('data-run-mode="dense"');
    expect(html).toContain('data-dense-run="true"');
    expect(html).toContain('data-dense-boundary-item="micro-1"');
    expect(html).toContain('data-dense-boundary-item="micro-2"');
    expect(html).toContain('data-dense-boundary-item="micro-3"');
  });

  it('keeps dense-run items individually addressable with millisecond-precision titles', () => {
    const html = renderToStaticMarkup(
      <SubtitleTrack
        items={[
          {
            id: 'micro-1',
            type: 'video',
            name: 'Micro 1',
            text: '极短字幕',
            startTime: 114.84,
            duration: 0.1,
          },
          {
            id: 'micro-2',
            type: 'video',
            name: 'Micro 2',
            text: '更短字幕',
            startTime: 114.94,
            duration: 0.06,
          },
        ]}
        totalDuration={120}
        currentTime={0}
        pxPerSec={50}
      />
    );

    expect(html).toContain('data-item-anchor="true"');
    expect(html).toContain('data-item-id="micro-1"');
    expect(html).toContain('data-item-id="micro-2"');
    expect(html).toContain('114.840s - 114.940s');
    expect(html).toContain('114.940s - 115.000s');
  });

  it('highlights only the selected local segment inside a dense run', () => {
    const html = renderToStaticMarkup(
      <SubtitleTrack
        items={[
          {
            id: 'micro-1',
            type: 'video',
            name: 'Micro 1',
            text: '第一条',
            startTime: 114.84,
            duration: 0.1,
          },
          {
            id: 'micro-2',
            type: 'video',
            name: 'Micro 2',
            text: '第二条',
            startTime: 114.94,
            duration: 0.06,
          },
          {
            id: 'micro-3',
            type: 'video',
            name: 'Micro 3',
            text: '第三条',
            startTime: 115,
            duration: 0.04,
          },
        ]}
        totalDuration={120}
        currentTime={0}
        pxPerSec={50}
        selectedItem="micro-2"
      />
    );

    expect(html).toContain('data-dense-selected-item="micro-2"');
    expect(html).not.toContain('data-dense-selected-item="micro-1"');
    expect(html).not.toContain('data-dense-selected-item="micro-3"');
  });
});
