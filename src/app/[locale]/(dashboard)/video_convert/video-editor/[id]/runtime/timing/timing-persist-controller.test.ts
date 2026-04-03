import { describe, expect, it } from 'vitest';

import {
  buildPendingTimingPersistItems,
  reconcileTimingAfterRollback,
  resolveTimingPersistSuccess,
} from './timing-persist-controller';

describe('timing persist controller', () => {
  it('builds persist payload items from pending timing map', () => {
    expect(
      buildPendingTimingPersistItems({
        'clip-1': { startMs: 1000, endMs: 2000 },
        'clip-2': { startMs: 3000, endMs: 5000 },
      })
    ).toEqual([
      { id: 'clip-1', startMs: 1000, endMs: 2000 },
      { id: 'clip-2', startMs: 3000, endMs: 5000 },
    ]);
  });

  it('reconciles convert rows and pending timing map after persist success', () => {
    const result = resolveTimingPersistSuccess({
      currentPendingTimingMap: {
        'clip-1': { startMs: 1000, endMs: 2000 },
        'clip-2': { startMs: 3000, endMs: 5000 },
      },
      requestedItems: [
        { id: 'clip-1', startMs: 1000, endMs: 2000 },
      ],
      response: {
        data: {
          idMap: {
            'clip-1': 'clip-1a',
          },
        },
      },
      convertRows: [
        { id: 'clip-1', txt: 'a' },
        { id: 'clip-2', txt: 'b' },
      ],
      nowMs: 12345,
    });

    expect(result.nextPendingTimingMap).toEqual({
      'clip-2': { startMs: 3000, endMs: 5000 },
    });
    expect(result.nextIdMap).toEqual({ 'clip-1': 'clip-1a' });
    expect(result.nextConvertRows).toEqual([
      { id: 'clip-1a', txt: 'a', timing_rev_ms: 12345 },
      { id: 'clip-2', txt: 'b' },
    ]);
  });

  it('keeps only still-dirty timing entries after rollback restore', () => {
    expect(
      reconcileTimingAfterRollback({
        currentPendingTimingMap: {
          'clip-1': { startMs: 1000, endMs: 2000 },
          'clip-2': { startMs: 3000, endMs: 5000 },
        },
        restoredRows: [
          { id: 'clip-1', start: '00:00:01,000', end: '00:00:02,000' },
          { id: 'clip-2', start: '00:00:03,500', end: '00:00:05,000' },
        ],
      })
    ).toEqual({
      'clip-2': { startMs: 3000, endMs: 5000 },
    });
  });
});
