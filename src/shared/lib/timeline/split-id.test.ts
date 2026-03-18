import { describe, expect, it } from 'vitest';

import { buildSplitChildIds } from './split';

describe('buildSplitChildIds', () => {
  it('creates numeric child ids that remain compatible with time-coded ids', () => {
    const ids = buildSplitChildIds({
      id: '0001_00-00-00-000_00-00-04-000',
      leftStartMs: 0,
      leftEndMs: 2000,
      rightStartMs: 2000,
      rightEndMs: 4000,
    });

    expect(ids.left).toBe('00010001_00-00-00-000_00-00-02-000');
    expect(ids.right).toBe('00010002_00-00-02-000_00-00-04-000');
  });

  it('keeps extending the numeric prefix when splitting a child again', () => {
    const ids = buildSplitChildIds({
      id: '00010002_00-00-02-000_00-00-04-000',
      leftStartMs: 2000,
      leftEndMs: 3000,
      rightStartMs: 3000,
      rightEndMs: 4000,
    });

    expect(ids.left).toBe('000100020001_00-00-02-000_00-00-03-000');
    expect(ids.right).toBe('000100020002_00-00-03-000_00-00-04-000');
  });
});
