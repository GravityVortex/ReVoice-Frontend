import { describe, expect, it } from 'vitest';

import {
  getStructuralEditBlockReason,
  remapSubtitleIdAfterTimingSave,
  reconcilePendingTimingAfterPersist,
  reconcilePendingTimingMap,
} from './video-editor-structural-edit';

describe('video editor structural edit guards', () => {
  it('blocks split and rollback while a video update is still active', () => {
    expect(
      getStructuralEditBlockReason({
        isGeneratingVideo: true,
        isTaskRunning: false,
        isMergeJobActive: false,
      } as any)
    ).toBe('video-updating');

    expect(
      getStructuralEditBlockReason({
        isTaskRunning: false,
        isMergeJobActive: true,
      })
    ).toBe('video-updating');

    expect(
      getStructuralEditBlockReason({
        isTaskRunning: true,
        isMergeJobActive: false,
      })
    ).toBe('video-updating');

    expect(
      getStructuralEditBlockReason({
        isTaskRunning: false,
        isMergeJobActive: false,
      })
    ).toBeNull();
  });

  it('drops rollback-restored timing entries and keeps only still-dirty ids', () => {
    expect(
      reconcilePendingTimingMap(
        {
          'clip-1': { startMs: 1000, endMs: 2000 },
          'clip-2': { startMs: 5000, endMs: 7000 },
          'clip-removed': { startMs: 9000, endMs: 10000 },
        },
        [
          {
            id: 'clip-1',
            start: '00:00:01,000',
            end: '00:00:02,000',
          },
          {
            id: 'clip-2',
            start: '00:00:04,000',
            end: '00:00:06,000',
          },
        ]
      )
    ).toEqual({
      'clip-2': { startMs: 5000, endMs: 7000 },
    });
  });

  it('keeps newer in-flight pending timings after a save response and remaps renamed ids', () => {
    expect(
      reconcilePendingTimingAfterPersist({
        currentPendingTimingMap: {
          'clip-1': { startMs: 1300, endMs: 2300 },
          'clip-2': { startMs: 5000, endMs: 7000 },
        },
        requestedItems: [
          { id: 'clip-1', startMs: 1000, endMs: 2000 },
        ],
        idMap: {
          'clip-1': 'clip-1-renamed',
        },
      })
    ).toEqual({
      'clip-1-renamed': { startMs: 1300, endMs: 2300 },
      'clip-2': { startMs: 5000, endMs: 7000 },
    });
  });

  it('remaps split target ids after timing saves rename translated subtitles', () => {
    expect(
      remapSubtitleIdAfterTimingSave('clip-old', {
        'clip-old': 'clip-new',
      })
    ).toBe('clip-new');

    expect(remapSubtitleIdAfterTimingSave('clip-stable', {})).toBe('clip-stable');
  });
});
